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
  "args": ["postgres-mcp", "--access-mode=restricted"],
  "env": {
    "DATABASE_URI": "postgresql://crafthub_user:crafthub_password@localhost:5432/crafthub_dev"
  }
}
```

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

## `context7` — current library documentation

Not declared in `.mcp.json` because it is a user-level server, but the
`context7-usage` skill assumes it is available. This repo runs several recent
majors — Tailwind v4, zod 4, Vite 8, React 19, Fastify 5, Drizzle 0.44 — whose
APIs a model will confidently get wrong from memory. Consult Context7 before
writing against any of them.

---

## `crafthub` — the product's own MCP server

`apps/mcp` is a *product feature*, not development tooling: it is how a coding
agent publishes posts to a user's CraftHub profile, behind that user's disclosure
policy. It is not part of this repo's development harness and does not belong in
`.mcp.json`. Its consumer-facing setup lives in the root `README.md`.
