# MCP servers

`.mcp.json` at the repo root declares the project-scoped MCP servers. Claude Code
asks for approval the first time it sees the file; approve it once per machine.

---

## `postgres` — the database sensor

The point of this server is **verification, not convenience**. After an agent
performs an action that is supposed to write to the database, it queries the
target table by a correlation id and proves the row exists with the values it
claimed to write. "The endpoint returned 201" is not evidence that the write
landed; a `SELECT` is.

```
after: POST /posts  ->  { "id": "3f2b…" }
verify: SELECT id, user_id, status, created_at FROM posts WHERE id = '3f2b…';
```

Use a correlation id you control (the returned primary key, an idempotency key,
a value you seeded into the payload). Do not verify by "the newest row" — two
concurrent runs, or a seed script, and you are asserting against somebody else's
data.

### What is configured, and the two safety properties that matter

```jsonc
{
  "command": "uvx",
  "args": ["--with", "mcp<2", "postgres-mcp", "--access-mode=restricted"],
  "env": {
    "DATABASE_URI": "postgresql://crafthub_user:crafthub_password@localhost:5432/crafthub_dev"
  }
}
```

0. **`--with mcp<2` is load-bearing. Do not remove it.** `postgres-mcp` imports
   `FastMCP` from `mcp.server.fastmcp`. In the Python MCP SDK 2.x that class was
   renamed to `MCPServer`, so an unpinned `uvx` resolves a v2 SDK and the server
   dies at import with `ModuleNotFoundError: No module named 'mcp.server.fastmcp'`
   before it ever reads `DATABASE_URI`. The symptom is a server that never
   connects, which reads exactly like a credentials problem and is not one.
   Diagnose by running the command by hand and looking at stderr:
   `DATABASE_URI=… uvx --with "mcp<2" postgres-mcp --access-mode=restricted`
   A healthy start logs `Successfully connected to database`.
1. **`--access-mode=restricted`.** Read-only transactions with a statement
   timeout. An agent can look; it cannot write, drop or lock. The write path
   through the API is the thing under test — letting the verifier also be able
   to mutate state destroys the whole point of the check.
2. **It points at `crafthub_dev` on `localhost` only.** The local docker database
   from `docker-compose.dev.yml`, whose credentials are already in that file and
   in `db-manage.sh` — nothing here is a secret. Never repoint this at staging
   or production: a "read-only" agent with production data in its context window
   is a data-exfiltration path, and `.mcp.json` is a committed file.

### Setup

The server is `crystaldba/postgres-mcp`, run through `uvx` (from
[uv](https://docs.astral.sh/uv/)), so there is nothing to install into this repo:

```bash
# once, if you do not have uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# the database has to be up for the server to connect
bash db-manage.sh start
```

Then restart Claude Code and approve the project MCP server.

### NOT `@modelcontextprotocol/server-postgres`

The archived reference implementation is deliberately not used here. It is
unmaintained and interpolates parameters into SQL. Do not swap it in.

---

## `postgres-prod` — the same sensor, pointed at production

Added on request, 2026-08-29. It reads the **production** database. Everything the
`postgres` section says still applies; these are the differences, and they are the
whole reason this is a separate entry rather than an edit to that one.

```jsonc
{
  "command": "uvx",
  "args": ["postgres-mcp", "--access-mode=restricted"],
  "env": { "DATABASE_URI": "${CRAFTHUB_PROD_DATABASE_URI:-}" }
}
```

**No credential is committed.** `.mcp.json` is a tracked file in a public
repository, so the URI arrives from the environment. Unset, it expands to empty
and the server simply fails to connect — inert by default, which is the state
every session should be in unless someone deliberately opted in.

### Turning it on

Two things have to be true, and both are deliberate friction.

1. **A tunnel is open.** Production postgres publishes no port, so nothing can
   reach it without one:

   ```bash
   bash scripts/prod-db-tunnel.sh
   ```

2. **The variable is exported** in the shell that launches Claude Code — from your
   shell profile or a gitignored file you source, never from a tracked file:

   ```bash
   export CRAFTHUB_PROD_DATABASE_URI='postgresql://USER:PASSWORD@localhost:15432/DB'
   ```

   The three values come from `.env.production` on the server:
   `ssh deploy@2.28.64.43 "grep -E 'POSTGRES_(DB|USER|PASSWORD)' /srv/crafthub/.env.production"`

Close the tunnel and the tool goes dead. That is the intended off switch.

### What this costs, stated plainly

`--access-mode=restricted` stops the agent **writing**. It does not stop it
**reading**, and reading is the risk here: every row an agent selects — emails,
resumes, private profile fields — lands in a context window and travels to a
model provider. The `postgres` section's warning against repointing dev at
production still stands for that entry; this one exists so that using production
is an explicit, separately-named act rather than a quiet edit to a URI.

So: query by the correlation id you are investigating. Do not `SELECT *` a user
table to "have a look". If a bug can be reproduced against dev, use dev.

---

## `context7` — current library documentation

Not declared in `.mcp.json` because it is a user-level server, but the
`context7-usage` skill assumes it is available. This repo runs several recent
majors — Tailwind v4, zod 4, Vite 8, React 19, Fastify 5, Drizzle 0.44 — whose
APIs a model will confidently get wrong from memory. Consult Context7 before
writing against any of them.

---

## `grafana` — observability, read-only by intent

Grafana's hosted remote MCP server (`https://mcp.grafana.com/mcp`, streamable
HTTP). It is a **read sensor for production behaviour**: query dashboards,
Prometheus/Loki data sources, alert rules and incidents when you need evidence
about how the deployed app is actually behaving. The same rule as `postgres`
applies — a green deploy log is not evidence that the thing works; a query is.

```jsonc
{
  "type": "http",
  "url": "https://mcp.grafana.com/mcp"
}
```

### Setup

There is nothing to install. The endpoint is OAuth-protected (it answers an
unauthenticated call with `401` and a `WWW-Authenticate` pointing at
`/.well-known/oauth-protected-resource/mcp`; scopes are `grafana:read`,
`grafana:query`, `grafana:write`). Claude Code performs the OAuth flow itself:

```bash
claude   # then: /mcp  ->  grafana  ->  authenticate
```

The flow opens a browser and needs an **interactive** session — a headless or
non-interactive run cannot authorise it, and the server's tools stay unavailable
there until someone has authenticated once on that machine. The token lives in
Claude Code's own credential store, not in this repo. **Never put a Grafana
service-account token in `.mcp.json`** — it is a committed file.

### Scope discipline

Prefer read and query over write. Creating or editing dashboards, silencing
alerts or acknowledging incidents from an agent changes what the on-call human
sees; do that only when the task explicitly asks for it.

---

## `crafthub` — the product's own MCP server

`apps/mcp` is a *product feature*, not development tooling: it is how a coding
agent publishes posts to a user's CraftHub profile, behind that user's disclosure
policy. It is not part of this repo's development harness and does not belong in
`.mcp.json`. Its consumer-facing setup lives in the root `README.md`.
