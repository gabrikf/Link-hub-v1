#!/usr/bin/env bash
#
# Opens a local port onto the PRODUCTION Postgres.
#
# Production postgres publishes no port of its own (docker-compose.prod.yml says
# why: a published 5432 on a VPS is found by scanners within hours), so the only
# way in is through ssh. The container's IP is assigned by Docker and changes
# whenever the container is recreated, so this resolves it at connect time --
# which is what keeps a TablePlus connection pointed at localhost from ever
# going stale.
#
#   bash scripts/prod-db-tunnel.sh      # then connect to localhost:15432
#
set -euo pipefail

SSH_HOST="${CRAFTHUB_SSH_HOST:-deploy@2.28.64.43}"
SSH_KEY="${CRAFTHUB_SSH_KEY:-$HOME/.ssh/linkhub_deploy}"
LOCAL_PORT="${CRAFTHUB_TUNNEL_PORT:-15432}"
CONTAINER="${CRAFTHUB_PG_CONTAINER:-crafthub-postgres}"

ip="$(ssh -i "$SSH_KEY" "$SSH_HOST" \
  "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $CONTAINER")"

if [ -z "$ip" ]; then
  echo "Could not resolve container '$CONTAINER' on $SSH_HOST." >&2
  echo "Is it running?  ssh $SSH_HOST 'docker ps'" >&2
  exit 1
fi

echo "$CONTAINER is at $ip -- forwarding localhost:$LOCAL_PORT -> $ip:5432"
echo "Leave this running. Ctrl-C closes the tunnel."
exec ssh -i "$SSH_KEY" -N -L "$LOCAL_PORT:$ip:5432" "$SSH_HOST"
