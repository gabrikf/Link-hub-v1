#!/usr/bin/env bash
#
# Collects the CURRENT state of the CraftHub infrastructure as JSON on stdout.
#
#   bash scripts/infra-snapshot.sh > infra.json
#
# Reads credentials from the repo-root .env. Nothing here writes to any provider —
# every call is a GET. Safe to run as often as you like.
#
# WHY THIS EXISTS: the dashboard artifact cannot fetch this itself. A published
# artifact runs under a CSP that blocks every external host, and reaching the
# Hetzner and Cloudflare APIs would mean shipping those tokens inside a page that
# can be shared. So the collection happens here, on your machine, with your
# credentials, and the result is pasted into the page.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
set -a; . ./.env; set +a
: "${HETZNER_API_KEY:?missing in .env}"
: "${CLOUDFLARE_API_TOKEN:?missing in .env}"
: "${CLOUDFLARE_ACCOUNT_ID:?missing in .env}"

ZONE="${CF_ZONE_ID:-de1a55fa8d553ccd08735bb6692ddd61}"
HOST="${VPS_HOST:-2.28.64.43}"
KEY="${VPS_SSH_KEY_PATH:-$HOME/.ssh/linkhub_deploy}"

hz()  { curl -sf -H "Authorization: Bearer $HETZNER_API_KEY" "https://api.hetzner.cloud/v1/$1"; }
cf()  { curl -sf -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/$1"; }

servers=$(hz servers)
types=$(hz "server_types?per_page=100")
pricing=$(hz pricing)
dns=$(cf "zones/$ZONE/dns_records?per_page=100")
buckets=$(cf "accounts/$CLOUDFLARE_ACCOUNT_ID/r2/buckets")

# Live probes. `|| true` so one unreachable endpoint does not abort the snapshot —
# an endpoint being down is exactly what you want the dashboard to show.
probe() {
  local url=$1 code time
  code=$(curl -s -o /dev/null -m 10 -w "%{http_code}" "$url" 2>/dev/null || echo 0)
  time=$(curl -s -o /dev/null -m 10 -w "%{time_total}" "$url" 2>/dev/null || echo 0)
  printf '{"url":"%s","status":%s,"seconds":%s}' "$url" "${code:-0}" "${time:-0}"
}

# Host + containers over SSH. Degrades to nulls rather than failing the run.
vps=$(ssh -o BatchMode=yes -o ConnectTimeout=10 -i "$KEY" "deploy@$HOST" '
  mem=$(free -m | awk "NR==2{print \$3\",\"\$2}")
  disk=$(df -BG --output=used,size,pcent / | tail -1 | tr -s " " | sed "s/^ //;s/G//g;s/%//;s/ /,/g")
  up=$(uptime -p)
  cs=$(docker compose -f /srv/crafthub/docker-compose.prod.yml ps --format "{{.Service}}|{{.Status}}" 2>/dev/null | paste -sd";")
  printf "%s\n%s\n%s\n%s\n" "$mem" "$disk" "$up" "$cs"
' 2>/dev/null || printf '\n\n\n\n')

deploys=$(gh run list --repo "${GH_REPO:-gabrikf/Link-hub-v1}" --workflow=deploy.yml --limit 8 \
  --json conclusion,headSha,createdAt 2>/dev/null || echo '[]')

jq -n \
  --argjson servers "$servers" --argjson types "$types" --argjson pricing "$pricing" \
  --argjson dns "$dns" --argjson buckets "$buckets" --argjson deploys "$deploys" \
  --argjson probes "[$(probe https://crafthub.dev),$(probe https://api.crafthub.dev/health),$(probe https://media.crafthub.dev)]" \
  --arg vps "$vps" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '
{
  collectedAt: $at,
  server: ($servers.servers[0] | {
    name, status, ip: .public_net.ipv4.ip, created,
    type: .server_type.name, cores: .server_type.cores,
    memoryGb: .server_type.memory, diskGb: .server_type.disk
  }),
  price: {
    serverMonthly: ($types.server_types[] | select(.name==($servers.servers[0].server_type.name))
                    | .prices[] | select(.location=="nbg1") | .price_monthly.gross | tonumber),
    ipv4Monthly:   ($pricing.pricing.primary_ips[]? | select(.type=="ipv4")
                    | .prices[] | select(.location=="nbg1") | .price_monthly.gross | tonumber)
  },
  dns:      [ $dns.result[]     | {type, name, content, proxied} ],
  buckets:  [ $buckets.result.buckets[] | {name, created: .creation_date} ],
  probes:   $probes,
  deploys:  $deploys,
  vps: ($vps | split("\n") | {
    memUsedMb: (.[0]//"" | split(",")[0]), memTotalMb: (.[0]//"" | split(",")[1]),
    diskUsedGb: (.[1]//"" | split(",")[0]), diskTotalGb: (.[1]//"" | split(",")[1]),
    uptime: (.[2]//""),
    containers: [ (.[3]//"") | split(";")[] | select(length>0) | split("|") | {service: .[0], status: .[1]} ]
  })
}'
