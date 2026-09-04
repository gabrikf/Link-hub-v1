# apps/api — Agent Rules

Fastify 5, clean architecture, tsyringe DI, Drizzle + Postgres/pgvector, BullMQ,
OpenAI. Read the root `AGENTS.md` first; this file is the depth.
```bash
npm run dev:api            # :3333, Swagger at /docs, health at /health{,/ready}
bash db-manage.sh start    # Postgres 5432 + Redis 6379 + MinIO 9000
```

## The layer rule

`src/core/` is pure — entities, use cases, repository and provider INTERFACES.
`src/infra/` is everything that touches the world: http, database, queue, di.

**`src/core/` must not import from `src/infra/`, ever**, nor `fastify`,
`drizzle-orm`, `ioredis`, `openai` or `pg`. A use case that needs to talk to
something declares an interface in `src/core/providers/` or
`src/core/repositories/` and `src/infra/` implements it. `eslint.config.js`
enforces this with `no-restricted-imports` scoped to `src/core/**`, so the gate
catches it on any file you touch.

This is not architectural taste. It is what makes the use-case tests fast and
hermetic — they run against in-memory repositories with no database, no network
and no container, and finish in under a minute. A use case is a folder holding
`<name>.use-case.ts` and `<name>.use-case.test.ts` side by side, under
`src/core/use-case/<area>/`.

Four files in `src/core/` already break this; they are named in
`docs/harness/known-debt.md`. Do not add a fifth.

## DI — `src/infra/di/container.ts`

Over 2,200 lines, and every dependency in the app is registered there.
- Register the **interface token** (`TOKENS.*`), not the concrete class.
- A new use case means: register it, and add it to the controller that calls it.
- `container-wiring.test.ts` catches a token you forgot, but it needs docker up
  and the gate skips it when Postgres is unreachable — so a broken wiring can
  pass a local push. If you touched the container, **start docker and run the
  api suite** before you claim it works.

Pattern-matching the neighbours usually works. Verify anyway: a mis-registered
token fails at runtime, not at compile time.

## HTTP

`fastify-type-provider-zod` v6. Every route declares its schema, and the schema
comes from `@repo/schemas` — never an inline zod object for a shape that crosses
the boundary. That is what keeps Swagger, the web client and the MCP server in
agreement.


**Every module is registered twice: at the bare path and under `/api/v1`** — so
`/posts` and `/api/v1/posts` are the same route. Do not "fix" one of them.

Errors go through `src/infra/http/middleware/global-error-handler.ts`: throw a
domain error from the use case and let the handler map it. Never catch one in a
controller to return a generic 500 — that erases the mapping and the Sentry
breadcrumb.

Auth is argon2 + JWT, with Google OAuth, long-lived API tokens for agents and
HMAC-signed webhooks alongside it; `GET /me` is the authed identity endpoint.

## Tests

**The hermetic path is the default.**
`src/infra/http/test-support/build-test-app.ts` builds a real Fastify instance
with in-memory repositories and a deterministic JWT secret, driven by
`server.inject` — no socket, no database, no docker, and it still exercises the
real guard, the real validation and the real error handler. An endpoint's test
goes there; a pure business rule goes next to its use case in `src/core/**`.

**Some tests need real infrastructure.** Without it the database-bound ones do
not fail fast: they **hang for 60-90 seconds and then error**, which is how a
test suite gets a reputation for being broken.
`scripts/guardrails/pre-push.mjs` holds the authoritative lists; if it and this
one ever disagree, the gate is right.

Need docker (`bash db-manage.sh start`):

- `src/infra/di/container-wiring.test.ts`
- `src/infra/database/drizzle/search-indexes.e2e.test.ts`
- `src/infra/database/drizzle/user-email-verified-mapping.e2e.test.ts`
- `src/infra/database/drizzle/user-preferences-constraints.e2e.test.ts`
- `src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts`

Need a funded `OPENAI_API_KEY` (excluded by name in CI, and by the gate):

- `src/infra/http/controllers/resume/test/search.e2e.test.ts`
- `src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts`
- `src/infra/database/drizzle/search-indexes.e2e.test.ts`

Need MinIO on 9000, or Mailpit (`bash db-manage.sh admin`):

- `src/infra/providers/s3-file-storage-provider.minio.e2e.test.ts`
- `src/infra/providers/smtp-mail-provider.mailpit.e2e.test.ts`

The last two SELF-SKIP with a printed reason rather than hanging; the gate
excludes them by name so its notice says what went unverified.

**Consequence, stated plainly:** semantic-search relevance and the pgvector
index behaviour are not covered by any automated run you or CI will normally do.
If you change resume search or the embedding pipeline, run those tests locally
with a key. Do not add a `.skip` to them.

## File storage

One port, `IFileStorageProvider`, one adapter, `S3FileStorageProvider`. Both
environments are S3-compatible: production is Cloudflare R2 from the six `S3_*`
variables, local is MinIO from `docker-compose.dev.yml`, configured by nothing.

`resolveFileStorageConfig(env)` in
`src/infra/providers/s3-file-storage-provider.ts` decides in a fixed order — a
complete `S3_*` environment wins; a **partial** one is an error (`null`), never
quietly redirected — four of five set is a typo, and hiding it ships a photo
that resolves to `localhost` for every visitor. "Partial" counts the five
REQUIRED keys only; `S3_REGION` has a default and is excluded, because it
shipped uncommented in `.env.example` and therefore sits in every developer's
`.env`. Nothing set **and** `NODE_ENV=development` falls back to
`LOCAL_MINIO_STORAGE_CONFIG`, which production and `test` never reach. **Do not "simplify" that order**: it is what
stops a deployed CraftHub writing user photographs to a loopback address and
reporting success. The reasoning is in that file's own comments.

Change MinIO credentials, bucket or ports in `docker-compose.dev.yml` **and**
`LOCAL_MINIO_STORAGE_CONFIG` — the e2e test reads the constant and talks to the
container, so drift fails there rather than in someone's browser.

## Database

Drizzle, schema in `src/infra/database/drizzle/schema.ts`.
```bash
npm run db:generate    # after editing schema.ts, then npm run db:migrate
npm run db:push        # dev only, no migration file
bash db-manage.sh seed-all
```

- pgvector is a hard requirement — migration 0006 runs `CREATE EXTENSION vector`
  and the image is `pgvector/pgvector:pg15` in dev and in CI.
- Repositories return **entities**, not Drizzle rows; mapping belongs in the
  repository.
- Watch for N+1: a `for` loop with an `await` on a query inside it is one — use a
  single query with an `inArray`.
- Verify a write through the postgres MCP server by correlation id rather than
  by trusting the status code. See `docs/mcp-servers.md`.

## OpenAI and cost

Embeddings, resume parsing and recruiter query conversion all call OpenAI, and
every call is real money.

- Go through the provider interfaces in `src/core/providers/`; never call the
  `openai` client from a use case.
- `cached-embedding-provider.ts` exists because the same text was being embedded
  repeatedly. Do not bypass it, and remember that an unbounded loop embedding
  per row is a spend incident, not a slow endpoint.
- The AI quota guard (`src/infra/http/middleware/ai-quota-guard.ts`) is not
  optional decoration on AI routes.

## Queues

BullMQ over Redis, with `npm run dev:worker` and `npm run dev:digest-worker`
running as separate processes.

A job must be **idempotent**: BullMQ retries, and a job that appends on every
attempt produces duplicates in production and nowhere else. Enqueue through the
queue provider interface, never by importing BullMQ into core.

## Lint

`apps/api/eslint.config.js` exists but there is **no `lint` script here** — the
comment at the top of that file says why. Your changed files are linted by
`node scripts/guardrails/lint-changed.mjs`, which the gate runs. New api code is
held to the config from today; the backlog is in `docs/harness/known-debt.md`.
