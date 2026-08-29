#!/usr/bin/env bash
#
# Deploy CraftHub to the production VPS.
#
#   ./scripts/deploy.sh              manual deploy: git pull, build here, deploy
#   ./scripts/deploy.sh <tag>        deploy a prebuilt image already tagged <tag>
#
# TWO ENTRY POINTS, ONE SEQUENCE. Run by hand it pulls the repo and builds the
# image on the box. Run with a tag argument — which is how
# .github/workflows/deploy.yml invokes it after pushing to GHCR — it skips both:
# CI has already checked out that exact commit (so `git pull` would fail on the
# detached HEAD it leaves behind) and already built the image (so rebuilding it
# on a 4GB VPS would be slow and could produce a *different* image than the one
# CI tested). Everything after that point is identical, because the migrate /
# restart / verify / roll-back sequence is the part that must never have two
# implementations.
#
# Order matters and is not negotiable: get the image, MIGRATE, restart, verify.
# Migrating before the restart is what stops new code from ever meeting an old
# schema. Migrating after would leave a window — however short — in which the
# new containers are serving traffic against columns that do not exist yet.
#
# ---------------------------------------------------------------------------
# ROLLBACK IS IMAGE-ONLY. MIGRATIONS ARE FORWARD-ONLY.
# ---------------------------------------------------------------------------
# If the health check fails, this script re-pins the previous image tag and
# restarts. It does NOT and CANNOT undo the migrations it just applied — there
# are no down-migrations in this repo, and rolling a schema backwards while
# containers are live is how data gets lost.
#
# The practical consequence, and the reason this is printed on every run: EVERY
# MIGRATION MUST BE BACKWARD-COMPATIBLE WITH THE RELEASE BEFORE IT. Add columns
# nullable or with a default; never rename in a single release (add, backfill,
# switch reads, drop two releases later); never drop a column the previous image
# still selects. If a migration cannot be written that way, it needs a planned
# maintenance window, not this script.

set -euo pipefail

# --- configuration ---------------------------------------------------------
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.production}"
IMAGE_NAME="${IMAGE_NAME:-crafthub-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3333/health}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-120}"
HEALTH_INTERVAL_SECONDS=3

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m [!] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m [x] %s\033[0m\n' "$*" >&2; exit 1; }

cd "$REPO_DIR"

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found. Copy apps/api/.env.example to .env.production and fill it in."
command -v docker >/dev/null || die "docker is not installed"
command -v curl >/dev/null || die "curl is not installed (needed for the health check)"
docker compose version >/dev/null 2>&1 || die "docker compose v2 is required"

# --- TLS material -----------------------------------------------------------
# Caddy terminates TLS with the Cloudflare Origin Certificate, not with
# Let's Encrypt: api.<domain> is orange-clouded, so an ACME challenge is answered
# by Cloudflare's edge and never reaches this box.
#
# Checked HERE, before anything else runs, for two reasons. First,
# docker-compose.prod.yml bind-mounts these as FILES — Docker silently creates a
# DIRECTORY at any missing bind-mount path, and the resulting Caddy error names
# neither the deploy nor the missing secret. Second, a missing certificate means
# the site answers 525 to every visitor, and finding that out after migrations
# have been applied is strictly worse than finding it out now.
#
# .github/workflows/deploy.yml writes both files immediately before calling this
# script. To place them by hand:
#
#   cd infra/terraform/envs/prod
#   mkdir -p "$REPO_DIR/secrets/caddy"
#   terraform output -raw origin_certificate > "$REPO_DIR/secrets/caddy/origin.pem"
#   terraform output -raw origin_private_key > "$REPO_DIR/secrets/caddy/origin.key"
#   chmod 0600 "$REPO_DIR/secrets/caddy/origin.key"
CADDY_TLS_DIR="${CADDY_TLS_DIR:-$REPO_DIR/secrets/caddy}"

check_pem() {
  local path="$1" label="$2" marker="$3"

  [ -e "$path" ] || die "$label is missing: $path. Caddy cannot start without it and the site would answer 525. See the comment above this check for how to place it."
  # An `if`, not `[ -d "$path" ] && die ...`. Under `set -e` that AND-list exits
  # the script with status 1 whenever the test is FALSE — i.e. on every healthy
  # deploy — because the list as a whole then evaluates non-zero.
  #
  # A directory here is the Docker bind-mount footgun, and it is worth naming
  # explicitly: the error Caddy produces for it looks nothing like a missing file.
  if [ -d "$path" ]; then
    die "$path is a DIRECTORY, not a file. Docker created it by bind-mounting a path that did not exist. Remove it (sudo rm -rf '$path') and let the deploy write the real file."
  fi
  [ -f "$path" ] || die "$label exists but is not a regular file: $path"
  [ -s "$path" ] || die "$label is empty: $path. The secret it comes from is probably unset or was decoded from a bad base64 value."
  grep -q "$marker" "$path" || die "$label does not look like PEM ($marker not found in $path). Check that the repository secret holds the raw output of 'terraform output -raw ...', base64-encoded on a single line."
}

check_pem "$CADDY_TLS_DIR/origin.pem" "The Cloudflare Origin Certificate" "BEGIN CERTIFICATE"
check_pem "$CADDY_TLS_DIR/origin.key" "The Origin Certificate private key" "PRIVATE KEY"

# ---------------------------------------------------------------------------
# 0. Record what is running RIGHT NOW, before anything changes.
# ---------------------------------------------------------------------------
# Read off the live container rather than off a state file: a state file drifts
# the moment someone runs `docker compose up` by hand, and a rollback target
# that is merely believed to be correct is worse than none at all.
PREVIOUS_TAG=""
previous_image=""
previous_container="$(compose ps -q api 2>/dev/null || true)"
if [ -n "$previous_container" ]; then
  previous_image="$(docker inspect --format '{{.Config.Image}}' "$previous_container" 2>/dev/null || true)"
  case "$previous_image" in
    # A container started from a bare digest has no tag to roll back TO. Better
    # to admit there is no rollback target than to invent one out of a sha256.
    sha256:* | "") PREVIOUS_TAG="" ;;
    *:*)           PREVIOUS_TAG="${previous_image##*:}" ;;
    *)             PREVIOUS_TAG="" ;;
  esac
fi

# The running container and this run must agree on the repository, or "roll back
# to $PREVIOUS_TAG" would pin a tag under the wrong image name and either fail to
# pull or, worse, start something unrelated.
if [ -n "$PREVIOUS_TAG" ] && [ "${previous_image%:*}" != "$IMAGE_NAME" ]; then
  warn "Running image is ${previous_image%:*} but IMAGE_NAME is $IMAGE_NAME. Rollback is disabled for this run — set IMAGE_NAME=${previous_image%:*} if that is wrong."
  PREVIOUS_TAG=""
fi

if [ -n "$PREVIOUS_TAG" ]; then
  log "Currently running: ${IMAGE_NAME}:${PREVIOUS_TAG} (rollback target)"
else
  warn "No running api container found — this looks like a first deploy. There will be NO rollback target."
fi

# ---------------------------------------------------------------------------
# 1. Pull the code
# ---------------------------------------------------------------------------
TAG_ARG="${1:-}"

if [ -z "$TAG_ARG" ]; then
  log "Pulling latest code"
  git pull --ff-only
fi

GIT_SHA_FULL="$(git rev-parse HEAD)"
# Tagged by commit SHA, never by :latest. A moving tag makes "roll back to the
# previous image" impossible to express, which is the entire safety net below.
NEW_TAG="${TAG_ARG:-$(git rev-parse --short=12 HEAD)}"
NEW_IMAGE="${IMAGE_NAME}:${NEW_TAG}"

if [ "$NEW_TAG" = "$PREVIOUS_TAG" ]; then
  warn "$NEW_TAG is already the running tag. Continuing — the stack will be restarted on it."
fi

# ---------------------------------------------------------------------------
# 2. Get the image
# ---------------------------------------------------------------------------
build_image() {
  log "Building $NEW_IMAGE"
  docker build \
    --tag "$NEW_IMAGE" \
    --build-arg "GIT_SHA=$GIT_SHA_FULL" \
    --label "org.opencontainers.image.revision=$GIT_SHA_FULL" \
    --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --file "$REPO_DIR/Dockerfile" \
    "$REPO_DIR"
}

if [ -n "$TAG_ARG" ]; then
  # CI path. The image exists in the registry; fetch it rather than rebuild.
  if docker image inspect "$NEW_IMAGE" >/dev/null 2>&1; then
    log "$NEW_IMAGE is already on disk"
  else
    log "Pulling $NEW_IMAGE"
    docker pull "$NEW_IMAGE" \
      || die "Could not pull $NEW_IMAGE. Is the registry login still valid? Nothing was changed."
  fi
else
  build_image
fi

# The two values docker-compose.prod.yml interpolates. Exported rather than
# written to .env.production because compose reads env_file into containers, not
# into its own substitution pass.
#
# GIT_SHA is deliberately NOT exported here: it is baked into the image as a
# build-arg above (and by the CI build), so the running process reports the SHA
# it was actually built from rather than whatever the last shell to touch it
# happened to say.
export IMAGE_NAME
export IMAGE_TAG="$NEW_TAG"

# ---------------------------------------------------------------------------
# 3. Migrate — BEFORE anything restarts
# ---------------------------------------------------------------------------
printf '\n\033[1;33m%s\033[0m\n' \
  "SCHEMA MIGRATIONS ARE FORWARD-ONLY AND ARE NOT ROLLED BACK."
printf '\033[1;33m%s\033[0m\n' \
  "If this deploy fails, only the container image is restored — the database keeps the new schema."
printf '\033[1;33m%s\033[0m\n\n' \
  "That is why every migration must stay backward-compatible with ${PREVIOUS_TAG:-the previous release}."

log "Ensuring postgres is up before migrating"
compose up -d postgres redis

# `up -d` returns as soon as the containers are *started*, not when postgres is
# accepting connections. Migrating into a still-booting database fails with a
# connection error that looks exactly like a bad DATABASE_URL, so wait on the
# healthcheck the compose file already defines.
pg_deadline=$((SECONDS + 90))
until [ "$(docker inspect --format '{{.State.Health.Status}}' crafthub-postgres 2>/dev/null || echo starting)" = "healthy" ]; do
  [ "$SECONDS" -lt "$pg_deadline" ] || die "postgres did not become healthy within 90s. Nothing was migrated or restarted."
  sleep 2
done

log "Applying migrations"
# `run --rm` starts a one-shot container from the NEW image on the same network,
# runs the migrator and exits. --no-deps because postgres is already healthy
# above and we do not want this to drag the api service up early. Under
# `set -e`, a non-zero exit here aborts the deploy with the OLD containers still
# serving traffic, untouched.
if ! compose run --rm --no-deps -e SERVICE_ROLE=migrate api npm run db:migrate:prod; then
  die "Migrations failed. Nothing was restarted; the previous release is still serving traffic."
fi

# ---------------------------------------------------------------------------
# 4. Restart the stack on the new image
# ---------------------------------------------------------------------------
log "Starting $NEW_IMAGE"
# NOT bare, despite `set -e`.
#
# HISTORY, because the reason changed and the comment did not: `caddy` used to
# wait on `api: service_healthy`, so a broken image — the exact case this
# script's rollback exists for — made `up` block until the api healthcheck gave
# up and then exit non-zero. Under `set -e` that killed the script right here,
# leaving migrations applied, the reverse proxy never started, and steps 5 and 6
# below unreached: a failed deploy took the whole site offline and abandoned it.
#
# That dependency is now `condition: service_started`
# (docker-compose.prod.yml), so `up` no longer blocks on the API's health. The
# swallowed exit status still earns its place: `up` also fails for a pull error,
# a bad bind mount, or any other service failing to start, and every one of those
# must reach the health poll and the rollback rather than aborting here.
#
# Let the health poll be the judge: it reaches the same conclusion, but on a path
# that continues into the rollback.
if ! compose up -d --remove-orphans; then
  warn "'compose up' reported a failure (a service may never have become healthy). Continuing to the health check so the rollback below can run."
fi

# ---------------------------------------------------------------------------
# 5. Verify
# ---------------------------------------------------------------------------
wait_for_health() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))

  while [ "$SECONDS" -lt "$deadline" ]; do
    if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$HEALTH_INTERVAL_SECONDS"
  done

  return 1
}

log "Waiting for $HEALTH_URL (timeout ${HEALTH_TIMEOUT_SECONDS}s)"

if wait_for_health; then
  log "Healthy. Deployed ${NEW_IMAGE}."
  compose ps
  # Keep the previous image on disk so the next deploy still has a rollback
  # target; prune everything older than a week to stop a 4GB box filling up
  # with dead layers.
  docker image prune --force --filter "until=168h" >/dev/null 2>&1 || true
  exit 0
fi

# ---------------------------------------------------------------------------
# 6. Rollback
# ---------------------------------------------------------------------------
warn "Health check FAILED for $NEW_IMAGE"
printf '\n--- last 50 log lines from api ---\n'
compose logs --tail=50 api || true
printf -- '----------------------------------\n\n'

if [ -z "$PREVIOUS_TAG" ]; then
  compose down || true
  die "No previous tag to roll back to. Stack stopped. Fix the image and deploy again."
fi

if ! docker image inspect "${IMAGE_NAME}:${PREVIOUS_TAG}" >/dev/null 2>&1; then
  warn "Rollback target ${IMAGE_NAME}:${PREVIOUS_TAG} is not on disk — trying the registry"
  docker pull "${IMAGE_NAME}:${PREVIOUS_TAG}" \
    || die "Rollback target ${IMAGE_NAME}:${PREVIOUS_TAG} is gone from disk AND unreachable in the registry. The stack is running the broken image — intervene manually."
fi

warn "Rolling back to ${IMAGE_NAME}:${PREVIOUS_TAG} (IMAGE ONLY — the database keeps the migrations applied in step 3)"
export IMAGE_TAG="$PREVIOUS_TAG"
# Same reasoning as step 4: a non-zero exit here must not abort before the
# verification below reports whether the rollback actually worked.
if ! compose up -d --remove-orphans; then
  warn "'compose up' reported a failure while rolling back. Checking health anyway."
fi

if wait_for_health; then
  warn "Rolled back to ${IMAGE_NAME}:${PREVIOUS_TAG} and it is healthy. The failed build ${NEW_IMAGE} is still on disk for inspection."
else
  warn "Rollback did not become healthy either. Check 'docker compose -f $COMPOSE_FILE logs' — a migration from step 3 may be incompatible with ${PREVIOUS_TAG}."
fi

exit 1
