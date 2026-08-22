#!/usr/bin/env bash
#
# Nightly PostgreSQL backup to Cloudflare R2.
#
#   ./scripts/backup.sh
#
# ---------------------------------------------------------------------------
# INSTALL (crontab)
# ---------------------------------------------------------------------------
# Run `crontab -e` on the VPS and add:
#
#   # LinkHub database backup — 03:17 UTC daily. Deliberately not on the hour:
#   # every cron on every VPS on earth fires at :00, and R2 rate-limits.
#   17 3 * * * /srv/linkhub/scripts/backup.sh >> /var/log/linkhub-backup.log 2>&1
#
# Cron runs with a minimal PATH and no login shell, so `rclone` must be at
# /usr/bin or /usr/local/bin (the official install script puts it there).
#
# ---------------------------------------------------------------------------
# RCLONE REMOTE
# ---------------------------------------------------------------------------
# This script expects an rclone remote named `r2` (override with RCLONE_REMOTE).
# Create it once, as the same user the cron job runs as:
#
#   rclone config
#     n) New remote
#     name>    r2
#     Storage> s3
#     provider> Cloudflare
#     access_key_id>     <R2 token access key id>
#     secret_access_key> <R2 token secret>
#     region>            auto
#     endpoint>          https://<account-id>.r2.cloudflarestorage.com
#
# Use a SEPARATE R2 token from the one the app uses for uploads, scoped to the
# backup bucket only. The app's token has object-write on the public media
# bucket; a backup job does not need that, and a backup token that can also
# delete user avatars is a needless coupling.
#
# Verify with:  rclone lsd r2:
#
# ---------------------------------------------------------------------------
# RESTORE (write this down somewhere that is not this VPS)
# ---------------------------------------------------------------------------
#   rclone copy r2:linkhub-backups/postgres/linkhub-2026-08-15T03-17-00Z.sql.gz .
#   gunzip -c linkhub-*.sql.gz | \
#     docker exec -i linkhub-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
#
# A backup that has never been restored is a hypothesis. Test it once a quarter
# against a scratch database.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.production}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-linkhub-postgres}"
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"
RCLONE_BUCKET="${RCLONE_BUCKET:-linkhub-backups}"
RCLONE_PATH="${RCLONE_PATH:-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# A gzipped dump of an empty-but-initialised database is around 1KB; a real one
# is far larger. Anything under this is a failed dump wearing a .sql.gz suffix.
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-1024}"

log()  { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die()  { printf '[%s] ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; exit 1; }

command -v rclone >/dev/null || die "rclone is not installed or not on PATH (cron uses a minimal PATH)"
command -v docker >/dev/null || die "docker is not installed or not on PATH"
[ -f "$ENV_FILE" ] || die "$ENV_FILE not found"

# POSTGRES_USER / POSTGRES_DB come from the same file the container was started
# with, so the dump can never target a database the app is not using.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${POSTGRES_USER:?POSTGRES_USER is not set in $ENV_FILE}"
: "${POSTGRES_DB:?POSTGRES_DB is not set in $ENV_FILE}"

docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1 \
  || die "container $POSTGRES_CONTAINER is not running — nothing to back up"

TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
DUMP_NAME="linkhub-${TIMESTAMP}.sql.gz"

# mktemp -d, not a fixed path: two overlapping runs (a slow dump plus the next
# cron tick) would otherwise write the same file and upload a truncated one.
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
DUMP_PATH="$WORK_DIR/$DUMP_NAME"

log "Dumping $POSTGRES_DB from $POSTGRES_CONTAINER"

# -T because there is no TTY under cron and pg_dump would otherwise get one and
# corrupt the stream with control characters.
# --clean --if-exists makes the dump restorable over an existing database.
# The pipeline runs under `set -o pipefail`, so a pg_dump failure fails the
# script even though gzip on the right-hand side exits 0.
if ! docker exec -T "$POSTGRES_CONTAINER" \
  pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --clean --if-exists --no-owner \
  | gzip -9 > "$DUMP_PATH"; then
  die "pg_dump failed — nothing uploaded"
fi

# ---------------------------------------------------------------------------
# VERIFY BEFORE UPLOADING
# ---------------------------------------------------------------------------
# A 0-byte backup is worse than no backup: it looks like success in every
# dashboard, silently overwrites the retention window with garbage, and is only
# discovered on the one day it matters. Two checks: the file has real size, and
# gzip can actually read it back.
[ -s "$DUMP_PATH" ] || die "dump is empty — nothing uploaded"

DUMP_BYTES="$(stat -c %s "$DUMP_PATH")"
[ "$DUMP_BYTES" -ge "$MIN_DUMP_BYTES" ] \
  || die "dump is only ${DUMP_BYTES} bytes (minimum ${MIN_DUMP_BYTES}) — treating as a failed dump, nothing uploaded"

gzip --test "$DUMP_PATH" || die "dump failed gzip integrity check — nothing uploaded"

# Cheap sanity check on the contents: pg_dump always emits this trailer on a
# complete run, so its absence means the dump was truncated mid-stream.
if ! gzip -cd "$DUMP_PATH" | tail -n 20 | grep -q "PostgreSQL database dump complete"; then
  die "dump does not end with pg_dump's completion marker — it was truncated, nothing uploaded"
fi

log "Dump OK: $DUMP_NAME (${DUMP_BYTES} bytes)"

# ---------------------------------------------------------------------------
# UPLOAD
# ---------------------------------------------------------------------------
DEST="${RCLONE_REMOTE}:${RCLONE_BUCKET}/${RCLONE_PATH}"

log "Uploading to $DEST"
rclone copyto "$DUMP_PATH" "${DEST}/${DUMP_NAME}" \
  --s3-no-check-bucket \
  --retries 3 \
  --low-level-retries 5 \
  || die "upload failed — the local dump was valid, so this is a network or credentials problem"

# Confirm the object is actually there at the expected size before pruning
# anything. Pruning on the strength of an unverified upload is how a retention
# policy deletes the last good copy.
REMOTE_BYTES="$(rclone size "${DEST}/${DUMP_NAME}" --json 2>/dev/null | grep -o '"bytes":[0-9]*' | cut -d: -f2 || echo 0)"
[ "$REMOTE_BYTES" = "$DUMP_BYTES" ] \
  || die "uploaded object is ${REMOTE_BYTES} bytes, expected ${DUMP_BYTES} — NOT pruning old backups"

log "Upload verified"

# ---------------------------------------------------------------------------
# PRUNE
# ---------------------------------------------------------------------------
log "Pruning backups older than ${RETENTION_DAYS} days from $DEST"
rclone delete "$DEST" --min-age "${RETENTION_DAYS}d" --retries 3 \
  || log "WARNING: prune failed. The new backup is safe; old objects will be retried tomorrow."

log "Done. Remaining objects:"
rclone size "$DEST" || true
