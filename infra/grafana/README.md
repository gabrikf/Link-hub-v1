# Grafana Cloud dashboards

Three importable dashboards for the CraftHub API, versioned next to the code that
emits the metrics.

| File                         | Dashboard             | UID                   | Answers                                               |
| ---------------------------- | --------------------- | --------------------- | ----------------------------------------------------- |
| `dashboards/api-health.json` | CraftHub — API health | `crafthub-api-health` | Is it up, is it fast, are the queues draining?        |
| `dashboards/business.json`   | CraftHub — Business   | `crafthub-business`   | Are people signing up, publishing and searching?      |
| `dashboards/ai-cost.json`    | CraftHub — AI cost    | `crafthub-ai-cost`    | What is OpenAI costing, and who is hitting the quota? |

They are plain dashboard JSON, not a provisioning bundle — import them by hand,
or point Grafana's file provisioner at this directory if you would rather manage
them declaratively.

---

## Importing

Do this once per dashboard.

1. Grafana → **Dashboards** → **New** → **Import**
2. **Upload dashboard JSON file** and pick one of the files in `dashboards/`
   (or paste its contents into the text box)
3. Click **Load**
4. On the options screen, set **Data source** to your Grafana Cloud Prometheus
   instance — it is usually named `grafanacloud-<yourstack>-prom`
5. Click **Import**

Every dashboard declares a `datasource` template variable of type `datasource`,
which is what makes step 4 appear. Nothing is hard-coded to a datasource UID, so
the same file imports cleanly into a local Grafana, a colleague's stack, or a
second Grafana Cloud org.

### Re-importing after a change

Editing the JSON here and importing it again will prompt about the existing UID.
Choose **Import (Overwrite)**. Changes made in the Grafana UI do _not_ flow back
to this repo — if you improve a panel in the browser, use **Dashboard settings →
JSON Model**, copy the JSON, and paste it over the file here so the repo stays
the source of truth.

### Variables you will see at the top

- **Data source** — every dashboard. Which Prometheus to query.
- **Job** — every dashboard. The OTel service, in case more than one CraftHub
  deployment ever shares a Prometheus tenant. Leave it on `All`.
- **Route** — API health only. The route template, already normalised (see
  below).
- **Three price boxes** — AI cost only. USD per 1,000,000 tokens for
  `gpt-4o-mini` (input and output) and `text-embedding-3-small`. **Prices are
  not in the metrics**; they are multiplied in at query time. When OpenAI changes
  its price list, change these boxes — no JSON edit and no deploy. Note that
  only those two models are priced: if `RESUME_PARSING_MODEL`,
  `QUERY_CONVERSION_MODEL` or `EMBEDDING_MODEL` is pointed somewhere else, its
  tokens show up in the rate panels but contribute `$0.00` to spend. The
  _Tokens by model_ table exists to make that omission visible.

---

## Making telemetry flow

Metrics are produced by the OpenTelemetry SDK **inside** the Node process and
pushed over OTLP/HTTP straight to Grafana Cloud. There is no Collector and no
Alloy agent — deliberately, because the VPS has 4 GB of RAM shared between
Postgres, Redis, the API and two workers, and a Collector container would spend a
few hundred megabytes of it forwarding bytes the process can post itself.

### Environment variables

Set these in `.env.production` (the file `docker-compose.prod.yml` hands to every
service).

| Variable                         | Required                                                      | Purpose                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`    | **yes — this is the on/off switch**                           | Your Grafana Cloud OTLP gateway URL. Its presence alone starts the SDK; with it unset, no provider is registered, every instrument is a no-op, and nothing is exported.                                                                                                                                                                                         |
| `GRAFANA_CLOUD_INSTANCE_ID`      | yes (unless using `OTEL_EXPORTER_OTLP_HEADERS`)               | The numeric instance/user ID of your stack's OTLP endpoint. Becomes the Basic-auth username.                                                                                                                                                                                                                                                                    |
| `GRAFANA_CLOUD_API_TOKEN`        | yes (unless using `OTEL_EXPORTER_OTLP_HEADERS`)               | A Grafana Cloud access policy token with write scopes. Becomes the Basic-auth password.                                                                                                                                                                                                                                                                         |
| `OTEL_SERVICE_NAME`              | no — defaults to `crafthub-api`                               | Service name on every span, metric and log.                                                                                                                                                                                                                                                                                                                     |
| `OTEL_SERVICE_NAMESPACE`         | no — defaults to `crafthub`                                   | Groups the API and its workers.                                                                                                                                                                                                                                                                                                                                 |
| `DEPLOYMENT_ENVIRONMENT`         | no — defaults to `NODE_ENV`                                   | `deployment.environment.name` resource attribute.                                                                                                                                                                                                                                                                                                               |
| `OTEL_METRIC_EXPORT_INTERVAL_MS` | no — defaults to `60000`                                      | How often metrics are pushed. Lowering it costs data points, not series; on the free tier, 60 s is already generous.                                                                                                                                                                                                                                            |
| `SERVICE_ROLE`                   | set per container: `api`, `worker-embedding`, `worker-digest` | Decides which process reports the once-per-cluster gauges. **Exactly one container may claim `api`**, or daily-active-users and queue depth arrive three times under three different instance IDs. `docker-compose.prod.yml` already sets this correctly.                                                                                                       |
| `GIT_SHA`                        | no                                                            | Becomes `service.version`, and doubles as the Sentry release.                                                                                                                                                                                                                                                                                                   |
| `OTEL_ESM_LOADER_HOOK`           | no — **defaults to `false`, leave it there**                  | Installs the OpenTelemetry ESM loader hook, without which the http, ioredis and pino instrumentations patch nothing. It also gates `@fastify/otel` and undici, which need no patching but are held behind the same switch on purpose. It is off because it breaks `openai@4` — see "The loader hook" below. Off costs traces and logs, and no dashboard panels. |
| `OTEL_EXPORTER_OTLP_HEADERS`     | no                                                            | The standard OTel escape hatch. If set it **takes precedence** and the two `GRAFANA_CLOUD_*` variables are ignored — the app assumes you have assembled the auth header yourself.                                                                                                                                                                               |

Sentry is a separate, independent switch (`SENTRY_DSN`). It is the error sink
only; tracing is left to OTel, which is why `SENTRY_TRACES_SAMPLE_RATE` defaults
to `0`.

### Finding your OTLP endpoint and credentials

1. Log in to <https://grafana.com> and open **My Account**
2. Pick your stack, then find the **OpenTelemetry** tile and click
   **Configure** / **Send OpenTelemetry data**
3. The page shows an **OTLP Endpoint** that looks like
   `https://otlp-gateway-prod-<region>.grafana.net/otlp` — that is
   `OTEL_EXPORTER_OTLP_ENDPOINT`, verbatim, including `/otlp` and with no
   trailing `/v1/metrics`. The SDK appends the signal paths itself.
4. The same page shows an **Instance ID** (a number) — that is
   `GRAFANA_CLOUD_INSTANCE_ID`
5. Click **Generate now** / **Create token** to mint an access policy token with
   the OTLP write scopes. Copy it immediately; it is shown once. That is
   `GRAFANA_CLOUD_API_TOKEN`.

Grafana Cloud's own instructions hand you a pre-encoded
`OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20<base64>`. That works and takes
precedence, but the two-variable form is preferred here: the deploy carries two
readable values that can be rotated independently instead of one opaque blob that
has to be re-encoded by hand.

### The loader hook, and why traces are off

`OTEL_ESM_LOADER_HOOK` defaults to `false`. Turning it on is what the API's
module-patching instrumentations need in order to produce anything — and it is
also what crash-loops the API at boot.

**There are three of them, not five.** This page said five (http, fastify, pg,
ioredis, undici) until 2026-09-05, and two of those were wrong.
`@opentelemetry/instrumentation-pg` was removed that day — it patches
node-postgres, and this app reaches Postgres through `postgres.js`, so it
matched no module and emitted nothing — and
`@opentelemetry/instrumentation-fastify` was replaced with `@fastify/otel`,
which registers through Fastify's `initialization` diagnostics_channel and
patches nothing at all. Re-derived from
[`otel.ts`](../../apps/api/src/infra/observability/otel.ts), the instrumentations
that actually rewrite a module at import time are:

| Instrumentation           | Patches         | Produces                                   |
| ------------------------- | --------------- | ------------------------------------------ |
| `instrumentation-http`    | `http`, `https` | the incoming-request span                  |
| `instrumentation-ioredis` | `ioredis`       | BullMQ enqueue and quota/DAU counter spans |
| `instrumentation-pino`    | `pino`          | log records — not spans                    |

`@fastify/otel` and `instrumentation-undici` are in the same gate but need no
patching: both return no module definitions and work through
`diagnostics_channel`. They are gated with the rest deliberately, so this one
switch keeps meaning exactly "no request spans" instead of quietly changing what
arrives in Tempo on the next deploy.

`@opentelemetry/instrumentation/hook.mjs` installs `import-in-the-middle`, which
intercepts **every** ESM import in the process rather than only the modules an
instrumentation registered interest in. `openai@4` resolves its runtime through
its `_shims` subsystem during module evaluation; under that interception the
module is evaluated twice, the second `init()` finds shims already set, and it
throws

```
Error: you must `import 'openai/shims/node'` before importing anything else from openai
```

before any handler runs. This is not theoretical: on 2026-08-29, setting
`OTEL_EXPORTER_OTLP_ENDPOINT` for the first time took production down for six
minutes in exactly this way, with all six containers reporting green.

**What being off costs: request traces and the pino log bridge, and nothing
else.** Every metric queried by the three dashboards in this directory is
recorded by hand in `metrics.ts`. `RuntimeNodeInstrumentation` reads
`perf_hooks` rather than patching modules, so the Node process metrics survive
too.

### There are no database spans, and there never were

Turning the hook on does **not** buy you query timings. Nothing in this app
instruments a database call:

- The `pg` instrumentation that used to be listed here patched node-postgres.
  The app uses `postgres.js` via `drizzle-orm/postgres-js`, so it matched no
  module. It was removed on 2026-09-05 rather than left standing as a
  reassurance the trace data does not support.
- Drizzle's own tracing is dead code upstream. `drizzle-orm/tracing.js` wraps
  every query in `tracer.startActiveSpan`, but the module declares `let otel;`
  and never assigns it, so the `if (!otel) return fn()` guard short-circuits on
  every call. Confirmed in 0.44.4 (the version pinned here) and unchanged in
  0.45.2. Its `Logger.logQuery` hook is no substitute: it fires at query start
  only, with no completion and no duration, so no span can be closed from it.

**So a slow query is invisible in Tempo.** It shows up only as unexplained time
inside the fastify `handler - …` span with nothing underneath it. Do not read a
flat waterfall as "the database is fine", and do not infer query time from one.
Adding DB spans means wrapping the `postgres()` client by hand, which is a
deliberate change with its own review.

**`openai` v5 deleted `_shims`, and this repo is now on v7**, so that crash is
gone. Verified rather than assumed: the built app was booted through the
production entrypoint with the hook on, exporting to the real Grafana Cloud
endpoint as `crafthub-api-preflight`, and both signals landed — spans in Tempo,
pino records in Loki.

The default is still `false`. Not from doubt, but because an env var is
revertible in thirty seconds while a bad default needs a deploy — and because
the incident was hard to diagnose precisely because the hook and telemetry were
switched on in the same breath. Turn it on by itself.

### This flag is also the only reason logs exist

`instrumentation-pino` is what bridges the app's pino output onto the OTLP log
exporter, and it has to patch `pino` to do it — so it needs the hook exactly
like the span instrumentations do. **With `OTEL_ESM_LOADER_HOOK=false` you get
metrics only: Tempo and Loki both stay empty.**

Note that log-to-trace correlation does _not_ depend on this. `server.ts`
already stamps `trace_id` and `span_id` onto every pino line through its own
`mixin()`. The instrumentation adds the _delivery_, plus `trace_flags`.

### Checking it works

The API does not log a "telemetry started" line, so verify from the data side:

```promql
# Should return a series within ~2 export intervals of a deploy.
sum(rate(http_server_requests_total[5m]))
```

If it is empty: confirm `OTEL_EXPORTER_OTLP_ENDPOINT` is actually set inside the
container (`docker compose exec api printenv | grep OTEL`), and remember that
telemetry only starts through the production entrypoints — `npm run dev` uses
`tsx watch src/index.ts`, which never loads `register.js`.

---

## What the metrics are called, and why

Instruments are defined in one file on purpose:
[`apps/api/src/infra/observability/metrics.ts`](../../apps/api/src/infra/observability/metrics.ts).
Read it before adding a panel — do not guess a metric name.

Names go through the OTel → Prometheus translation on the way in, which is why
queries here use suffixes that do not appear in the TypeScript:

- **Counters** gain `_total` (the instruments are already named that way, so the
  suffix is not doubled).
- **Histograms** become `_bucket`, `_sum` and `_count` series; latency
  percentiles come from `histogram_quantile()` over the `_bucket` series.
- **Observable gauges** (`queue_depth`, `crafthub_daily_active_users`) keep their
  name as-is.

### The cardinality rule

**Never use `userId`, username, email, profile slug, repository name, post id,
job id or a raw URL as a metric label.** The Grafana Cloud free tier caps active
series at 10,000, and any one of those would blow through it from a single user's
traffic. Identifiers belong in a log line or a span attribute, where they cost
nothing per series.

Two consequences are visible in these dashboards:

- **Daily active users is a gauge, not a per-user counter.** It is backed by a
  Redis HyperLogLog: ~12 KB and exactly one time series no matter how many people
  sign up. It resets at 00:00 UTC, so the series is a sawtooth by design and the
  peak of each tooth is the day's number.
- **Route labels are normalised.** Every route module is registered twice, bare
  and under `/api/v1`, so one handler would otherwise produce two route
  templates; the prefix is stripped so the two collapse into one line per
  endpoint. Anything that matched no route at all — 404s, scanner probes for
  `/wp-admin/...` — becomes the single label `__unmatched__` rather than minting
  a fresh series per path someone probes.

There is **no runtime backstop**, on purpose. Every attribute passed to an
instrument in this codebase is a literal from a closed vocabulary, so there is no
dynamic-key path to sanitise — and a `sanitizeAttributes()` that nothing called
was judged worse than none, because it reads as protection that does not exist.
The comment at the bottom of `metrics.ts` is the authority here. The rule is
enforced by review, not by code: check it when you add an instrument.

---

## Suggested alerts

Not shipped as JSON (alert rules are stack-specific and want notification
policies attached), but these are the four worth creating first:

| Alert            | Expression sketch                                      | Why                                                    |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| API down         | `absent(up)` / no `http_server_requests_total` for 10m | Nothing else fires if no data arrives.                 |
| Error budget     | 5xx ratio > 2% for 10m                                 | The one number that means "users are seeing failures". |
| Queue backing up | `queue_depth{state="waiting"} > 50` for 15m            | Resumes accepted but never becoming searchable.        |
| AI spend         | projected 30-day spend > your budget                   | Cheaper to catch here than on the OpenAI invoice.      |
