# apps/api — Agent Rules

Fastify 5, clean architecture, tsyringe DI, Drizzle + Postgres/pgvector, BullMQ,
OpenAI. Read the root `AGENTS.md` first; this file is the depth.

```bash
npm run dev:api            # http://localhost:3333
                           # Swagger UI at /docs, health at /health and /health/ready
bash db-manage.sh start    # Postgres 5432 + Redis 6379
```

---

## The layer rule

```
src/core/     pure. entities, use cases, repository INTERFACES, provider INTERFACES.
src/infra/    everything that touches the world. http, database, queue, providers, di.
```

**`src/core/` must not import from `src/infra/`, ever.** It must not import
`fastify`, `drizzle-orm`, `ioredis`, `openai` or `pg`. If a use case needs to
talk to something, it declares an interface in `src/core/providers/` or
`src/core/repositories/` and `src/infra/` implements it.

This is not architectural taste. It is what makes the use-case tests fast and
hermetic — they run against in-memory repositories with no database, no network
and no container, which is why 832 tests finish in under a minute.

A use case is a folder:

```
src/core/use-case/posts/create-post-use-case/
  create-post.use-case.ts
  create-post.use-case.test.ts
```

---

## DI — `src/infra/di/container.ts`

~1900 lines, and every dependency in the app is registered there.

- Register the **interface token** (`TOKENS.*`), not the concrete class.
- A new use case means: register it, and add it to the controller that calls it.
- `container-wiring.test.ts` resolves the container against a real database and
  will catch a token you forgot — but it needs docker up. It is one of the three
  files the gate skips when Postgres is unreachable, so a broken wiring can pass
  a local push. If you touched the container, **start docker and run the api
  suite** before you claim it works.

The container is large enough that adding to it by pattern-matching the
neighbours usually works. Verify anyway: a mis-registered token fails at
runtime, not at compile time.

---

## HTTP

`fastify-type-provider-zod` v6. Every route declares its schema, and the schema
comes from `@repo/schemas` — never an inline zod object for a shape that crosses
the boundary. That is what keeps Swagger, the web client and the MCP server in
agreement.

**Every module is registered twice: at the bare path and under `/api/v1`.** So
`/posts` and `/api/v1/posts` are the same route. Do not "fix" one of them.

Errors go through `src/infra/http/middleware/global-error-handler.ts`. Throw a
domain error from the use case and let the handler map it. Never catch an error
in a controller just to return a generic 500 — that erases the mapping and the
Sentry breadcrumb with it.

Auth: argon2 password hashing, JWT, Google OAuth, long-lived API tokens for
agents, HMAC-signed webhooks. The authed identity endpoint is `GET /me`.

---

## Tests

### The hermetic path — use this by default

`src/infra/http/test-support/build-test-app.ts` builds a real Fastify instance
with in-memory repositories and a deterministic JWT secret, driven by
`server.inject`. No socket, no database, no docker. It exercises the real guard,
the real validation and the real error handler.

If you are adding an endpoint, this is where its test goes.

### Tests that need real infrastructure

These do not fail fast without it — they **hang for 60-90 seconds and then
error**, which is how a test suite gets a reputation for being broken.

Need docker (`bash db-manage.sh start`):

- `src/infra/di/container-wiring.test.ts`
- `src/infra/database/drizzle/search-indexes.e2e.test.ts`
- `src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts`

Need a funded `OPENAI_API_KEY` (excluded by name in CI, and by the gate):

- `src/infra/http/controllers/resume/test/search.e2e.test.ts`
- `src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts`
- `src/infra/database/drizzle/search-indexes.e2e.test.ts`

**Consequence, stated plainly:** semantic-search relevance and the pgvector index
behaviour are not covered by any automated run you or CI will normally do. If
you change resume search or the embedding pipeline, run those three locally with
a key. Do not add a `.skip` to them.

---

## Database

Drizzle, schema in `src/infra/database/drizzle/schema.ts`.

```bash
npm run db:generate    # after editing schema.ts
npm run db:migrate
npm run db:push        # dev only, no migration file
bash db-manage.sh seed-all
```

- pgvector is a hard requirement — migration 0006 runs `CREATE EXTENSION vector`
  and the embedding tables use the `vector` column type. The image is
  `pgvector/pgvector:pg15`, in dev and in CI.
- Repositories return **entities**, not Drizzle rows. Mapping belongs in the
  repository.
- Watch for N+1: a `for` loop with an `await` on a query inside it is one. Use a
  single query with an `inArray`.
- Verify a write with the postgres MCP server by correlation id, not by trusting
  the status code. See `docs/mcp-servers.md`.

---

## OpenAI and cost

Embeddings, resume parsing and recruiter query conversion all call OpenAI, and
every call is real money on a real key.

- Go through the provider interfaces in `src/core/providers/`. Never call the
  `openai` client from a use case.
- `cached-embedding-provider.ts` exists because the same text was being embedded
  repeatedly. Do not bypass it.
- An unbounded loop that embeds per row is a spend incident, not a slow endpoint.
- The AI quota guard (`src/infra/http/middleware/ai-quota-guard.ts`) is not
  optional decoration on AI routes.

---

## Queues

BullMQ over Redis. Workers are separate processes:
`npm run dev:worker`, `npm run dev:digest-worker`.

A job must be **idempotent** — BullMQ retries, and a job that appends on every
attempt produces duplicates in production and nowhere else. Enqueue from a use
case through the queue provider interface, never by importing BullMQ into core.

---

## Lint

`apps/api/eslint.config.js` exists but there is **no `lint` script here** — read
the comment at the top of that file for why. Your changed files are linted by
`node scripts/guardrails/lint-changed.mjs`, which the gate runs. New api code is
held to the config from today; the historical backlog is a separate task.
