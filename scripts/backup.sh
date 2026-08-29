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
#   # CraftHub database backup — 03:17 UTC daily. Deliberately not on the hour:
#   # every cron on every VPS on earth fires at :00, and R2 rate-limits.
#   17 3 * * * /srv/crafthub/scripts/backup.sh >> /var/log/crafthub-backup.log 2>&1
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
# Then add TWO settings the interactive config does not prompt for:
#
#     no_head = true          # required, see below
#     no_check_bucket = true  # the scoped token cannot list buckets
#
# `no_head = true` IS NOT OPTIONAL ON R2. After a PUT, rclone re-reads the object with
# `HEAD /<key>?versionId=<id>`, using the version id R2 returns in the PUT response. R2
# returns that header but does not implement the `?versionId` subresource, so the HEAD
# gets 501 Not Implemented and the upload is reported as failed. Verified on rclone
# 1.60.1 (Ubuntu 24.04 apt): 3 out of 3 first attempts fail without it.
#
# What made this expensive to diagnose: with `--retries 3` the job still "succeeds".
# The retry finds the object already uploaded and matching, so it skips the upload and
# exits 0. The backup was working by accident, logging an ERROR every night.
#
# Nothing is lost by disabling that HEAD — the integrity check that matters is the
# `rclone size` comparison below, which is also the one that gates pruning.
#
# Use a SEPARATE R2 token from the one the app uses for uploads, scoped to the
# backup bucket only. The app's token has object-write on the public media
# bucket; a backup job does not need that, and a backup token that can also
# delete user avatars is a needless coupling.
#
# Verify with:  rclone ls r2:crafthub-backups
#
# NOT with `rclone lsd r2:` — listing buckets is an account-level permission that a
# correctly scoped token does not have, so that command returns 403 when everything is
# in fact working.
#
# ---------------------------------------------------------------------------
# RESTORE (write this down somewhere that is not this VPS)
# ---------------------------------------------------------------------------
#   rclone copy r2:crafthub-backups/postgres/crafthub-2026-08-15T03-17-00Z.sql.gz .
#   gunzip -c crafthub-*.sql.gz | \
#     docker exec -i crafthub-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
#
# A backup that has never been restored is a hypothesis. Test it once a quarter
# against a scratch database.
#
# THE FULL PROCEDURE IS docs/backup-restore.md — written to be followed under
# pressure, covering both "the data is gone" and "the server is gone", and executed
# end to end on 2026-08-29. The three lines above are a reminder, not the runbook.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.production}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-crafthub-postgres}"
RCLONE_REMOTE="${RCLONE_REMOTE:-r2}"
RCLONE_BUCKET="${RCLONE_BUCKET:-crafthub-backups}"
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
#
# READ IT, DO NOT SOURCE IT. This file is Docker Compose's `env_file`, and Compose's
# parser is not the shell. `MAIL_FROM=CraftHub <no-reply@crafthub.dev>` is a valid
# literal to Compose and a redirection to bash, so `. "$ENV_FILE"` died with a syntax
# error on a mail setting that has nothing to do with backups — and would have died on
# any future value holding a space, a quote, `$`, `&` or `#`.
#
# Quoting the env file to please bash is the wrong direction: the file belongs to
# Compose, Compose has to keep reading it, and its quote handling has changed between
# versions. Sourcing also executes 88 lines of someone else's config as code, and
# imports 50 unrelated secrets into this shell's environment, where any child process
# inherits them.
#
# Two keys, read literally. `tail -n 1` takes the last assignment, which is how both the
# shell and Compose resolve a repeated key. Surrounding quotes are stripped, and so is a
# trailing CR, in case the file is ever saved with CRLF endings.
env_value() {
  sed -n "s/^[[:space:]]*$1=//p" "$ENV_FILE" \
    | tail -n 1 \
    | sed -e 's/\r$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

POSTGRES_USER="$(env_value POSTGRES_USER)"
POSTGRES_DB="$(env_value POSTGRES_DB)"

: "${POSTGRES_USER:?POSTGRES_USER is not set in $ENV_FILE}"
: "${POSTGRES_DB:?POSTGRES_DB is not set in $ENV_FILE}"

docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1 \
  || die "container $POSTGRES_CONTAINER is not running — nothing to back up"

TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
DUMP_NAME="crafthub-${TIMESTAMP}.sql.gz"

# mktemp -d, not a fixed path: two overlapping runs (a slow dump plus the next
# cron tick) would otherwise write the same file and upload a truncated one.
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
DUMP_PATH="$WORK_DIR/$DUMP_NAME"

log "Dumping $POSTGRES_DB from $POSTGRES_CONTAINER"

# NO -t, AND NO -T EITHER. `-T` is a `docker compose exec` flag; plain `docker exec`
# does not have it and exits with "unknown shorthand flag: 'T'" before pg_dump ever
# starts. The two CLIs look alike and are not.
#
# The concern behind it was real — a pseudo-TTY would mangle the dump stream with
# control characters — but `docker exec` allocates one only when asked with `-t`, so
# the correct fix is to pass nothing. `-i` is not needed either: pg_dump writes to
# stdout and reads no stdin.
#
# --clean --if-exists makes the dump restorable over an existing database.
# The pipeline runs under `set -o pipefail`, so a pg_dump failure fails the
# script even though gzip on the right-hand side exits 0.
if ! docker exec "$POSTGRES_CONTAINER" \
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
