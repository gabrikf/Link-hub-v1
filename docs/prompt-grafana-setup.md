Set up Grafana Cloud monitoring for CraftHub, which is already live in production.
Guide me step by step: tell me exactly what to click, wait for me to confirm, then do
the parts you can do yourself. Verify each step actually worked instead of assuming it.

## Context you need

Repo: /home/gabriel/Documents/www/linkhub-v.1 (public, github.com/gabrikf/Link-hub-v1)
Production: https://crafthub.dev (Cloudflare Pages) + https://api.crafthub.dev
VPS: ssh deploy@2.28.64.43 -i ~/.ssh/linkhub_deploy — Hetzner cx23, 2 vCPU / 4 GB, Nuremberg
App dir on the box: /srv/crafthub, with a gitignored .env.production (0600) that is the ONLY
place production config lives. Terraform and CI never read or write it.
Six containers via docker-compose.prod.yml: api, caddy, postgres, redis, worker-embedding,
worker-digest. Deploys happen on merge to main via .github/workflows/deploy.yml.

## The important part: the code is ALREADY instrumented. Do not write instrumentation.

apps/api/src/infra/observability/ contains:
  otel.ts               OTel SDK setup, auto-instrumentation for http, fastify, pg, ioredis,
                        undici and Node runtime
  metrics.ts            the business counters
  observable-metrics.ts gauges sampled on the export interval
  register.ts           wiring
  sentry.ts             Sentry, activated by SENTRY_DSN alone

It is entirely opt-in and gated on ONE variable: OTEL_EXPORTER_OTLP_ENDPOINT. With it unset,
no SDK is constructed, nothing is exported, nothing costs anything, and there is no error.
That is why monitoring is currently off — not because anything is missing.

Authentication accepts either form (see otel.ts):
  - OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Basic <base64 of instanceID:token>", or
  - GRAFANA_CLOUD_INSTANCE_ID + GRAFANA_CLOUD_API_TOKEN, and the code builds the header itself
Prefer the second: no hand-assembled base64 to get subtly wrong.

Three dashboards are already committed as JSON in infra/grafana/dashboards/ —
api-health.json, business.json, ai-cost.json ("CraftHub — API health / Business / AI cost").
Import them; do not build dashboards by hand. A dashboard in version control is recreated in
five minutes if the account is lost. One built in the UI is not.

They query these metric names, which metrics.ts already emits — confirm they line up rather
than trusting me: crafthub_daily_active_users, crafthub_signups_total,
crafthub_resumes_submitted_total, crafthub_searches_total, crafthub_posts_created_total,
crafthub_profiles_published_total.

## Constraints that are not negotiable

1. NO Grafana Alloy, and no collector container. It costs 350-700 MB of RAM on a 4 GB box
   already running Postgres, Redis, an API and two workers. The whole design is OTLP straight
   from the Node process (~40 MB) to Grafana Cloud's gateway. If you find yourself suggesting
   a collector, re-read otel.ts first.
2. CARDINALITY IS THE THING THAT BREAKS THE FREE TIER. Never let userId, username, email or
   profile slug become a metric LABEL — one new series per user exhausts the 10k active series
   in about a week. Identifiers belong in logs or span attributes. Review metrics.ts against
   this before turning anything on, and tell me if you find a violation.
3. Free tier is 10k series / 50 GB logs / 50 GB traces / 14-day retention. When it is
   exceeded Grafana cuts you off rather than billing you — there is no automatic upgrade.
   Do not enable anything that changes that.
4. Editing .env.production means restarting containers. Use the smallest restart that
   applies the change; do not trigger a full redeploy just to add an env var.

## What I want you to do, in order

1. Walk me through creating the free Grafana Cloud account and stack. Give me the exact
   links. Tell me which region to choose and why (the server is in Nuremberg).
2. Get me to the OTLP endpoint and generate a token, and tell me precisely which screen it
   is on — that page is genuinely hard to find.
3. Add the variables to .env.production on the VPS yourself over SSH. Do not print secret
   values into the chat. Confirm the file stays 0600 and gitignored.
4. Restart what needs restarting and CONFIRM TELEMETRY IS ACTUALLY ARRIVING. "The container
   restarted" is not evidence. Query the Grafana datasource, or read the api container logs
   for exporter errors, and show me a real data point. An OTLP exporter fails silently by
   design — it drops what it cannot send rather than crashing the app, so a green container
   proves nothing.
5. Import the three dashboards and tell me which panels have real data and which are empty.
   An empty panel usually means the metric has never been incremented yet (nobody has signed
   up in production), not that it is broken — tell me which is which.
6. Set up ONE alert that would actually have caught a real outage: the API being down. Route
   it to email.
7. Then Sentry: create the project, put SENTRY_DSN in .env.production and VITE_SENTRY_DSN in
   the GitHub repo secrets (the front-end DSN is baked in at build time by Vite, so it needs
   a rebuild to take effect — the API one does not).

## How to work with me

- I run terraform apply and gh pr merge myself; your sandbox blocks them. Prepare everything
  and hand me the exact command.
- Do not paste secrets into the chat. Put them in files and tell me what you wrote where.
- Read the actual code before telling me how it behaves. In the last session, docs and
  reality disagreed several times and the code was always right.
- Tell me plainly what you did NOT verify. That matters more to me than a confident summary.

## Known state, so you do not rediscover it

- Zero observability today: no SENTRY_DSN, no OTEL endpoint, no uptime check.
- Two api e2e tests fail with 401 on recruiter login (search.e2e.test.ts,
  search-boundaries.e2e.test.ts). Pre-existing, unrelated, not yours to fix.
- The backup bucket crafthub-backups does not exist yet, so scripts/backup.sh has nowhere to
  write. Higher priority than monitoring if you have to pick — but I am asking for monitoring.
- docs/production-inventory.md and infra/terraform/README.md describe the whole setup.
  Read them first.
