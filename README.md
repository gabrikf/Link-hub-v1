# CraftHub

A developer profile platform with a recruiter-facing semantic candidate search,
plus a local-first toolchain that lets a coding agent publish what you actually
shipped — without leaking your employer's code, repository names, or identity.

Three things happen here:

- **Developers** build a public profile at `/<username>` — the short URL is the
  only one; `/profile/<username>` was removed and 404s — out of
  drag-and-drop tabs and blocks, backed by a structured resume (skills, titles,
  work history) that can be imported from a PDF by an LLM.
- **Recruiters** paste a job description — text or a PDF — at `POST
  /resumes/search` and get candidates ranked by vector similarity over resume
  embeddings, then re-ranked in the browser by a small TensorFlow.js model.
- **Coding agents** publish posts about real work through an
  [MCP server](apps/mcp/README.md) and an
  [activity extractor](apps/extractor/README.md), filtered through a
  server-enforced disclosure policy. From the MCP README:

  > Publish what you shipped to your CraftHub profile, from the terminal where
  > you shipped it — without pasting writing rules into your agent, and without
  > leaking your employer's name.

For the deep development reference — architecture layers, DI conventions, how to
add a use case — see **[DEVELOPMENT-GUIDE.md](DEVELOPMENT-GUIDE.md)**. This file
covers what the project is, how to run it, and how it is deployed and observed.

---

## Repository layout

npm workspaces + Turborepo. **This repo uses npm** (`packageManager:
npm@11.1.0`, a single root `package-lock.json`) — not pnpm, not yarn.

### Apps

| Path | What it is |
| --- | --- |
| `apps/api` | Fastify 5 backend plus two BullMQ workers (resume embedding, activity digest). Clean-architecture layout — `core/entity`, `core/use-case`, `core/repositories`, `core/providers`, `infra/*` — with tsyringe for DI, Drizzle ORM over Postgres + pgvector, Zod schemas via `fastify-type-provider-zod`, and Swagger UI at `/docs`. |
| `apps/web` | React 19 + Vite SPA: auth, dashboard, public profile, recruiter search, the drag-and-drop layout editor, posts and the post review queue. TanStack Router + React Query, Tailwind 4, Zustand, Radix UI, dnd-kit, and `@tensorflow/tfjs` running in a web worker. |
| `apps/mcp` | A stdio MCP server exposing CraftHub post/profile tools to Claude Desktop, Claude Code, Cursor and VS Code. A thin authenticated HTTP client over the API — it stores no state and calls no AI of its own. |
| `apps/extractor` | A local CLI and Claude Code hook that turns git history and agent sessions into hashed, aggregated activity metadata you review before anything is uploaded. No runtime dependencies beyond the shared schemas. |
| `apps/training` | Offline trainer for the "AI Match %" model. Writes versioned TensorFlow.js artefacts into `apps/web/public/ai-models/` and bumps `latest.json`. |

### Packages

| Path | What it is |
| --- | --- |
| `packages/schemas` (`@repo/schemas`) | The shared contract. Zod schemas and types consumed by api, web, mcp, extractor and training. **Ships built** (`main: dist/index.js`), so it must be built before anything type-checks or tests. |
| `packages/typescript-config` | Shared `tsconfig` bases. |
| `packages/eslint-config` | Shared flat ESLint configs. |
| `packages/ui` | Turborepo-starter leftover. Nothing in `apps/` imports it. |

---

## Local development

### Prerequisites

- **Node 22** (the root `engines` field says `>=18`, but CI, the Docker image
  and the observability loader hook all assume 22)
- **npm 11.1.0**
- **Docker** — for Postgres (with pgvector) and Redis
- Optional: [direnv](https://direnv.net/), which the checked-in `.envrc` uses to
  load `.env` and put `node_modules/.bin` on `PATH`

### Quickstart

```bash
npm install
npm run build                 # @repo/schemas must exist as dist/ before anything else works

bash db-manage.sh start       # postgres (pgvector/pgvector:pg15) + redis + minio, waits for healthy
npm run db:migrate            # drizzle-kit migrate
npm run db:seed:all           # skill/title catalogue + realistic candidate data

npm run dev                   # api + web + both workers, in parallel
```

- API → <http://localhost:3333>, docs at <http://localhost:3333/docs>
- Web → <http://localhost:5173>
- `npm run db:studio` → Drizzle Studio

Run pieces individually with `npm run dev:api`, `dev:web`, `dev:mcp`,
`dev:extractor`.

### Database helpers

`db-manage.sh` wraps the dev compose file:

```
start | stop | admin | logs | connect | status | reset | seed | seed-real | seed-all | reseed-real
```

`reset` destroys the Docker volumes (with a confirmation prompt), it does not
merely truncate — the uploaded images in MinIO go with the database.
`bash db-manage.sh admin` starts pgAdmin on <http://localhost:5050> behind the
compose `tools` profile.

### Image uploads, locally

`start` also brings up **MinIO**, the local stand-in for Cloudflare R2 — S3 API
on <http://localhost:9000>, console on <http://localhost:9001>
(`crafthub` / `crafthub_secret`), bucket `crafthub-media` with anonymous read.
Not behind the `tools` profile: uploading a profile photo is a core flow, and
without a bucket `POST /me/uploads` returns 500 on a fresh clone.

**No `S3_*` variables needed.** With none set, the API defaults to this MinIO in
development; production is untouched and still fails loudly when unconfigured.
Both stores go through the same `S3FileStorageProvider`, so what runs locally is
the code path that runs for users. Details in `DEVELOPMENT-GUIDE.md`.

### Environment

There are two committed examples: **`apps/api/.env.example`** and
`apps/web/.env.example`. There is no root one — the production stack reads
`.env.production` at the repository root, and `scripts/deploy.sh` refuses to run
without it, telling you to copy `apps/api/.env.example` into place.

The API is designed so that **nothing is required to boot in development**:
`apps/api/src/infra/config/app-config.ts` gives every knob a development default,
and only `assertProductionConfig()` — gated on `NODE_ENV=production` —
hard-requires anything. It refuses to boot without `JWT_SECRET`, `WEB_APP_URL`,
`DATABASE_URL`, `REDIS_URL` and a **real mail transport** (`SMTP_HOST`, or
`MAIL_TRANSPORT` set explicitly). Each fallback it rejects is a vulnerability or
a dead end rather than an inconvenience: a forgeable session token, a CORS policy
pointing at localhost, per-process AI quota counters that let N containers allow
N × the daily limit, and verification e-mails written to the container log so no
account can ever be confirmed.

Four variables are worth knowing about because they are feature switches rather
than settings:

- **`OPENAI_API_KEY`** — absent, the DI container substitutes deterministic
  embedding, query-conversion and resume-parsing providers. The AI features keep
  working locally, they just stop being intelligent.
- **`OTEL_EXPORTER_OTLP_ENDPOINT`** — absent, no telemetry SDK is registered at
  all. See [Observability](#observability).
- **`MAIL_TRANSPORT`** — `smtp` when `SMTP_HOST` is set, `log` otherwise. On
  `log` the API prints the account-verification link instead of sending it,
  which is the right default locally and a dead end in production — so
  `assertProductionConfig()` refuses to boot on it rather than letting every
  signup stall at "check your inbox". Set `SMTP_HOST` for a real release, and
  see [Seeing the e-mails the API sends](DEVELOPMENT-GUIDE.md#-seeing-the-e-mails-the-api-sends)
  for the local mail catcher.
- **`TRUST_PROXY`** — defaults to `true` in production and `false` elsewhere.
  It is what lets `@fastify/rate-limit` bucket by the client's real address
  instead of by the reverse proxy's. Trusting the header is only safe because
  the API is not directly reachable: `docker-compose.prod.yml` publishes it on
  `127.0.0.1` alone and Caddy is the sole ingress. If that ever changes, a client
  could forge `X-Forwarded-For` and mint itself unlimited rate-limit buckets.

**`APP_PUBLIC_URL` is server-side, not a `VITE_` variable.** It is the single
canonical public origin the API uses to build links that get e-mailed, and it
defaults to the first entry of `WEB_APP_URL`. The two are easy to confuse and
are not interchangeable: `WEB_APP_URL` is a **comma-separated CORS allow-list**
and may legitimately hold several origins, which is exactly why it cannot be the
thing a verification link is built from. Putting `APP_PUBLIC_URL` in
`apps/web/.env` does nothing at all — Vite only exposes variables prefixed
`VITE_`, and this one is read by the API process.

The full list lives in `apps/api/.env.example` and the config reader above, plus
[`infra/grafana/README.md`](infra/grafana/README.md) for the telemetry half.

### Tests

```bash
npm run test                  # every workspace
npm run test:api              # apps/api only
npm run test:coverage
```

Most of the suite is hermetic — even most `*.e2e.test.ts` files, which build a
DB-free Fastify app from `apps/api/src/infra/http/test-support/build-test-app.ts`
and drive it with `app.inject()`. Three files are the exception and need a real
pgvector database **and** a funded `OPENAI_API_KEY`:

- `apps/api/src/infra/http/controllers/resume/test/search.e2e.test.ts`
- `apps/api/src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts`
- `apps/api/src/infra/database/drizzle/search-indexes.e2e.test.ts`

CI excludes exactly those three and prints their names and the reason in the job
log, so a green run never quietly means less than it appears to. Run them locally
before shipping changes to resume search or the embedding pipeline.

---

## CI

`.github/workflows/ci.yml` runs on every pull request: **lint**, **check-types**
and **test** (the last against `pgvector/pgvector:pg15` and `redis:7-alpine`
service containers, with migrations applied first).

One honest caveat: the **lint job is currently non-blocking**. `apps/web` carries
30 pre-existing ESLint errors — mostly `react-hooks/set-state-in-effect` from
eslint-plugin-react-hooks v7 — and clearing them means refactoring working
components. Rather than delete the check or weaken the config, the job records
that number as a baseline, prints it on every PR, and fails if a change pushes it
higher. Lower `LINT_ERROR_BASELINE` in the workflow as violations are fixed;
when it reaches zero, delete `continue-on-error` and let lint block again.

---

## Production architecture

One 4 GB VPS runs everything except the frontend and object storage.

```
                Cloudflare Pages ──── apps/web (static bundle, VITE_* baked in at build)
                        │                app.<domain>, claimed by cloudflare_pages_domain
      users ────────────┤
                        │  https
                        ▼
              Cloudflare edge  (orange cloud, WAF + edge rate limit)
                        │  https, Cloudflare Origin Certificate
                        ▼
                    Caddy :443  (HTTP/3; real client IP from CF-Connecting-IP)
                        │  compose network
                        ▼
    ┌──────────── api :3333 (SERVICE_ROLE=api) ────────────┐
    │            worker-embedding   worker-digest          │   same image,
    │                   │                 │                │   different command
    └───────────────────┴────────┬────────┴────────────────┘
                                 │
                  postgres (pgvector)   redis (AOF, noeviction)
                                 │
              Cloudflare R2 (S3 API) ── avatars, covers, post images
                                        (MinIO locally — same S3 adapter)
              SMTP provider (587)    ── account-verification e-mail
              Grafana Cloud (OTLP)   ── metrics, traces, logs
              Sentry                 ── errors
```

**TLS is a Cloudflare Origin Certificate, not Let's Encrypt.** This README used
to describe the Caddy leg as "TLS via Let's Encrypt", and that could never have
worked: `api.<domain>` is an orange-clouded record and the Hetzner firewall only
accepts 80/443 from Cloudflare's ranges, so the ACME HTTP-01/TLS-ALPN challenge
is answered by Cloudflare's edge and never reaches the origin. Terraform mints an
Origin Certificate instead (`infra/terraform/envs/prod/cloudflare_tls.tf`), the
deploy job writes it to the box, and the `tls` directive in the `Caddyfile`
consumes it. Browsers never see it — the public certificate is Cloudflare's
Universal SSL — and it is only a security boundary while the zone is in **Full
(strict)**, which Terraform manages rather than assumes.

**Caddy resolves the real client IP.** Behind the orange cloud every connection
comes from a Cloudflare colo address, so the global options block declares
Cloudflare's ranges as `trusted_proxies` and reads `CF-Connecting-IP`. Without
that, `X-Real-IP` would be a colo address and the API's per-user rate limit would
silently become a per-datacenter one.

Every container has a hard `mem_limit` and a `NODE_OPTIONS` heap cap set *below*
it, so a leak produces a V8 heap-limit stack trace rather than a silent cgroup
OOM kill. Postgres and Redis publish **no ports** — they are reachable only over
the compose network. The API publishes on `127.0.0.1:3333` so the deploy script
can poll `/health` without exposing it.

Redis runs `--maxmemory-policy noeviction` deliberately: everything in it is
data, not cache. An LRU policy would let it silently drop BullMQ job hashes (a
resume queued for embedding that is never processed, with no error anywhere) and
reset AI quota counters, handing a user unlimited OpenAI spend.

Health endpoints: `/health` is liveness only and must never touch Postgres;
`/health/ready` checks Postgres and Redis and reports each separately, with Redis
reported as `unavailable` rather than `error` because the features behind it
degrade open.

---

## Deployment

`.github/workflows/deploy.yml` runs on push to `main`, with a `concurrency` group
so two pushes can never deploy at once. Two independent jobs:

**API** builds the Docker image, pushes it to `ghcr.io` (authenticated with the
run's built-in `GITHUB_TOKEN` — no extra registry credential to store or
rotate), then SSHes to the VPS, writes the Cloudflare Origin Certificate to
`secrets/caddy/`, and runs `scripts/deploy.sh`. All of the risky logic lives in
that script, and its ordering is the safety property:

```
git pull → docker build → MIGRATE → compose up -d → poll /health (120s)
                                                       └─ fail → re-pin previous image tag, restart
```

The certificate arrives as two repository secrets, base64-encoded on a single
line because `appleboy/ssh-action` cannot carry a multi-line value and a PEM is
multi-line by definition:

```bash
cd infra/terraform/envs/prod
terraform output -raw origin_certificate | base64 -w0   # -> CADDY_ORIGIN_CERT_B64
terraform output -raw origin_private_key | base64 -w0   # -> CADDY_ORIGIN_KEY_B64
```

The workflow fails on the runner if either secret is missing, and
`scripts/deploy.sh` refuses to restart anything unless both files are present,
non-empty and PEM-shaped — before it applies any migration.

Migrating **before** the restart is what stops new code from ever meeting an old
schema. The rollback is **image-only** — there are no down-migrations in this
repo and the database keeps the new schema — which is why **every migration must
be backward-compatible with the release before it**: add columns nullable or
with a default, never rename in a single release, never drop a column the
previous image still selects.

**Web** runs `npm ci`, then `npm run build:web` with the `VITE_*` values injected
from GitHub Secrets and Variables, then publishes `apps/web/dist` to Cloudflare
Pages with `wrangler`. Vite substitutes `import.meta.env.VITE_*` at **build**
time, so those values are baked into the JavaScript every browser downloads —
they are public by definition, and nothing secret may ever be a `VITE_` variable.
Changing one requires a rebuild, not a Cloudflare setting change.

There are exactly six, and `grep -rn "import.meta.env.VITE_" apps/web/src` is the
list: `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_MODEL_CDN_BASE_URL`,
`VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_RELEASE`. Anything
else the API reads server-side, `APP_PUBLIC_URL` included. Sign-in with LinkedIn
looks like an exception and is not one: the button links to
`${VITE_API_URL}/auth/linkedin` and every LinkedIn credential lives on the API.
`apps/web/public/_redirects` provides the SPA fallback so a hard refresh on
`/dashboard` or `/<username>` reaches the router instead of a 404.

`.github/workflows/retrain-model.yml` retrains the match model weekly, uploads
the artefacts to S3/CloudFront and commits the new `latest.json`.

---

## Observability

Metrics, traces and logs are produced by the OpenTelemetry SDK **inside** the
Node process and pushed over OTLP/HTTP directly to Grafana Cloud. There is no
Collector and no Alloy agent, deliberately: on a 4 GB box shared with Postgres,
Redis and three Node processes, a Collector container would spend a few hundred
megabytes forwarding bytes the process can post itself.

Telemetry is **opt-in by the presence of `OTEL_EXPORTER_OTLP_ENDPOINT` alone**.
No endpoint means no SDK, no exporter, no cost — and, critically, no error. Every
instrument becomes a no-op function call. Sentry is a separate switch
(`SENTRY_DSN`) and is the error sink only; tracing is left to OTel, which is why
`SENTRY_TRACES_SAMPLE_RATE` defaults to `0`.

Dashboards live in [`infra/grafana/`](infra/grafana/README.md) as importable
JSON — API health (RED + queues), business funnel, and AI cost.

### Cardinality rule

> **Never use `userId`, username, email, profile slug, repository name or any
> other high-cardinality identifier as a metric label.** The Grafana Cloud free
> tier caps active series at 10,000. Identifiers belong in a log line or a span
> attribute, never in a metric label.

This is not a style preference. A single user's traffic is enough to exhaust the
whole budget through one careless label. Every instrument in the system is
therefore declared in one file —
[`apps/api/src/infra/observability/metrics.ts`](apps/api/src/infra/observability/metrics.ts)
— so the cardinality of the entire application can be read off a single screen,
and `sanitizeAttributes()` there strips a denylist of forbidden keys as a last
line of defence for anything dynamic.

The current series budget, from the comment at the bottom of that file:

```
RED     ~67 route templates x ~3 status codes x 10 series  ~= 2,000
OpenAI  2 models x 3 operations x 2 directions             ~=    12
Queues  2 queues x (2 histograms x 9 + counters + depth)   ~=    50
Funnel  ~8 counters with <=3 label values each             ~=    20
Runtime node process metrics                               ~=   100
```

Total well under 3,000, leaving headroom for growth. Histogram bucket boundaries
are explicit and deliberately few (eight for HTTP latency, seven for job
duration) because every extra bucket is one more series per label combination,
multiplied across every route.

### Why route labels look the way they do

Two normalisations happen in
[`apps/api/src/infra/http/plugins/http-observability.ts`](apps/api/src/infra/http/plugins/http-observability.ts)
before a route ever becomes a label:

- **The `/api/v1` prefix is stripped.** Every route module is registered twice —
  bare and under `/api/v1` — so a single handler produces two route templates.
  Collapsing the prefix halves the RED series count and, more usefully, means a
  dashboard shows one line per endpoint instead of two that have to be summed by
  eye.
- **Unmatched requests become `__unmatched__`.** A 404 has no route template.
  Using the raw URL there would mint one time series per path a scanner probes —
  a single afternoon of `/wp-admin/...` traffic would exhaust the 10,000-series
  budget on its own.

The label source is `request.routeOptions.url`, the Fastify **route template**,
never the request URL, so `/profile/alice` and `/profile/bob` are one series.

### Two gauges report from exactly one process

`crafthub_daily_active_users` and `queue_depth` read shared Redis state, so
exactly one process may report them or the same number arrives three times under
three different instance IDs. `SERVICE_ROLE` decides which; `docker-compose.prod.yml`
assigns `api`, `worker-embedding` and `worker-digest`, and only `api` registers
the callbacks.

Daily active users is backed by a Redis HyperLogLog (`PFADD` on write, `PFCOUNT`
on collect, keyed by UTC date with a 48h TTL): ~12 KB and exactly **one** time
series regardless of how many people sign up. The cardinality rule forbids the
per-user alternative, and this is what replaces it.

Logs are pino JSON in production only, with a `mixin()` that stamps `trace_id`
and `span_id` from the active span so a Loki log line pivots straight to its
Tempo trace.

---

## Scripts reference

| Command | What it does |
| --- | --- |
| `npm run dev` | api + web + both workers, in parallel |
| `npm run build` | build every workspace (`@repo/schemas` first) |
| `npm run lint` | ESLint across the workspaces that have a lint script |
| `npm run check-types` | `tsc --noEmit` across every workspace |
| `npm run test` | every test suite |
| `npm run db:migrate` / `db:generate` | apply / author Drizzle migrations |
| `npm run db:seed:all` / `db:seed:fresh` | seed data / destroy and re-seed |
| `npm run db:studio` | Drizzle Studio |
| `npm run train:model:incremental` | retrain the match model from new interactions |

---

## Working with coding agents

This repo is set up so Claude Code, Cursor, Codex and Kiro all read the same
instructions, from one set of files rather than one copy per tool.

- **[AGENTS.md](AGENTS.md)** — the root index every tool loads: the gate, the
  non-negotiables, and a table pointing at everything else. `CLAUDE.md` is a
  symlink to it.
- **[apps/api/AGENTS.md](apps/api/AGENTS.md)**,
  **[apps/web/AGENTS.md](apps/web/AGENTS.md)**,
  **[packages/schemas/AGENTS.md](packages/schemas/AGENTS.md)** — the depth for
  each workspace, loaded when you are working inside it.
- **[docs/harness/agent-harness.md](docs/harness/agent-harness.md)** — how the
  wiring works, which tool reads what, how to add a rule or a skill, and how to
  onboard a new agent tool.

`npm run harness:check` verifies the whole thing on every push: every path an
instruction cites exists, every command it names is real, and no file has grown
past the size its reader will actually load.

---

## Further reading

- **[DEVELOPMENT-GUIDE.md](DEVELOPMENT-GUIDE.md)** — a reference for the npm
  scripts, and nothing else
- **[docs/harness/agent-harness.md](docs/harness/agent-harness.md)** — the agent
  harness: layout, per-tool loading rules, and how to extend it
- **[docs/harness/known-debt.md](docs/harness/known-debt.md)** — the debt that is
  recorded on purpose, and why each item is still there
- **[apps/mcp/README.md](apps/mcp/README.md)** — MCP server setup for Claude
  Desktop / Claude Code / Cursor / VS Code, the tool surface, and the disclosure
  policy model
- **[apps/extractor/README.md](apps/extractor/README.md)** — the local activity
  extractor and its privacy guarantees
- **[infra/grafana/README.md](infra/grafana/README.md)** — importing the
  dashboards and wiring up telemetry
