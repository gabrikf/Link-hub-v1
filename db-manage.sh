#!/bin/bash

# CraftHub Development Database Management Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Start the database
#
# MinIO is started here, not behind the `tools` profile that pgAdmin and Mailpit
# sit behind. Uploading a profile photo is a core product flow, not an optional
# debugging aid: without a bucket, POST /me/uploads returns 500 on a fresh
# clone. `minio-setup` runs to completion and exits — a container in state
# `Exited (0)` beside the others is the SUCCESS case for it, not a crash.
start_db() {
    check_docker
    print_status "Starting PostgreSQL, Redis and MinIO..."
    docker compose -f docker-compose.dev.yml up -d postgres redis minio minio-setup
    
    print_status "Waiting for database to be ready..."
    sleep 5
    
    # Wait for PostgreSQL health check
    timeout=30
    while [ $timeout -gt 0 ]; do
        if docker compose -f docker-compose.dev.yml ps postgres | grep -q "healthy"; then
            print_status "Database is ready!"
            break
        fi
        sleep 1
        timeout=$((timeout - 1))
    done
    
    if [ $timeout -eq 0 ]; then
        print_warning "Database took longer than expected to start, but it might be ready"
    fi
    
    wait_for_minio

    print_status "Database URL: postgresql://crafthub_user:crafthub_password@localhost:5432/crafthub_dev"
    print_minio_urls
}

# Wait for the bucket, not just for the server.
#
# `minio-setup` is what creates `crafthub-media` and makes it publicly readable,
# and it only starts once MinIO reports healthy. Returning from `start` before
# it has finished means the first upload of the session races it and fails with
# NoSuchBucket — a confusing error for something the script just claimed to have
# started.
wait_for_minio() {
    local timeout=40
    while [ $timeout -gt 0 ]; do
        if curl -sf http://localhost:9000/crafthub-media/ > /dev/null 2>&1; then
            print_status "MinIO bucket 'crafthub-media' is ready"
            return 0
        fi
        sleep 1
        timeout=$((timeout - 1))
    done
    print_warning "MinIO did not report a ready bucket in time. Check: docker compose -f docker-compose.dev.yml logs minio-setup"
    return 0
}

print_minio_urls() {
    print_status "MinIO S3 API:  http://localhost:9000  (bucket: crafthub-media)"
    print_status "MinIO console: http://localhost:9001  (crafthub / crafthub_secret)"
    print_status "Uploads work with no S3_* variables set — the API defaults to this MinIO in development."
}

# Stop the database
stop_db() {
    print_status "Stopping PostgreSQL database..."
    docker compose -f docker-compose.dev.yml down
}

# Start with pgAdmin
start_with_admin() {
    check_docker
    print_status "Starting PostgreSQL database with pgAdmin..."
    docker compose -f docker-compose.dev.yml --profile tools up -d
    
    print_status "Waiting for services to be ready..."
    sleep 10
    
    wait_for_minio

    print_status "Services started!"
    print_status "Database URL: postgresql://crafthub_user:crafthub_password@localhost:5432/crafthub_dev"
    print_status "pgAdmin: http://localhost:5050 (admin@crafthub.com / admin123)"
    print_minio_urls
}

# Show logs
logs() {
    docker compose -f docker-compose.dev.yml logs -f postgres
}

# Connect to database
connect() {
    check_docker
    if ! docker-compose -f docker-compose.dev.yml ps postgres | grep -q "Up"; then
        print_error "Database is not running. Start it first with: $0 start"
        exit 1
    fi
    
    print_status "Connecting to database..."
    docker compose -f docker-compose.dev.yml exec postgres psql -U crafthub_user -d crafthub_dev
}

# Reset database (remove volumes)
reset() {
    print_warning "This will destroy all data in the database!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Stopping and removing database and object storage..."
        docker compose -f docker-compose.dev.yml down -v
        docker volume rm crafthub-v1_postgres_data 2>/dev/null || true
        # Uploaded images live in this one. `down -v` already removes it for a
        # project started from this directory; the explicit rm covers a volume
        # left behind by an older project name, same as the line above.
        docker volume rm crafthub-v1_minio_data 2>/dev/null || true
        print_status "Database and uploaded images reset complete"
    else
        print_status "Reset cancelled"
    fi
}

# Seed database defaults
seed() {
    print_status "Running database seed..."
    npm run --workspace=api db:seed
    print_status "Seed finished"
}

seed_realistic() {
    print_status "Running realistic database seed..."
    npm run --workspace=api db:seed:real
    print_status "Realistic seed finished"
}

seed_all() {
    print_status "Running default catalog seed..."
    npm run --workspace=api db:seed
    print_status "Running realistic users/resumes seed..."
    npm run --workspace=api db:seed:real
    print_status "All seeds finished"
}

reseed_realistic() {
    check_docker
    print_warning "Resetting database volume for a fresh realistic dataset..."
    docker compose -f docker-compose.dev.yml down -v
    docker volume rm crafthub-v1_postgres_data 2>/dev/null || true

    start_db

    print_status "Applying migrations..."
    npm run db:migrate

    seed_all
}

# Show status
status() {
    check_docker
    docker compose -f docker-compose.dev.yml ps
}

# Show help
show_help() {
    echo "CraftHub Development Database Management"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start       Start PostgreSQL, Redis and MinIO (object storage)"
    echo "  stop        Stop all services"
    echo "  admin       Start everything above plus pgAdmin and Mailpit"
    echo "  logs        Show database logs"
    echo "  connect     Connect to database shell"
    echo "  status      Show services status"
    echo "  reset       Reset database AND uploaded images (removes all data)"
    echo "  seed        Seed default catalog data"
    echo "  seed-real   Seed realistic users/resumes + embeddings"
    echo "  seed-all    Run default seed, then realistic seed"
    echo "  reseed-real Fresh reset + migrate + seed-all"
    echo "  help        Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 start     # Start the database, Redis and MinIO"
    echo "  $0 admin     # ... plus pgAdmin and Mailpit"
    echo "  $0 connect   # Connect to database shell"
}

# Main command handling
case "${1:-help}" in
    start)
        start_db
        ;;
    stop)
        stop_db
        ;;
    admin)
        start_with_admin
        ;;
    logs)
        logs
        ;;
    connect)
        connect
        ;;
    status)
        status
        ;;
    reset)
        reset
        ;;
    seed)
        seed
        ;;
    seed-real)
        seed_realistic
        ;;
    seed-all)
        seed_all
        ;;
    reseed-real)
        reseed_realistic
        ;;
    help|*)
        show_help
        ;;
esac
