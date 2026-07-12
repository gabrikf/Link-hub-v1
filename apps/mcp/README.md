# LinkHub MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets you
create and manage your **LinkHub** posts from any MCP client — Claude Desktop,
Claude Code, Cursor, VS Code, and more.

Its headline use case: **turn your git commits into a recruiter-friendly post.**
Ask your AI to _"summarize my commits from this week and post them to LinkHub"_
and it will read your `git log`, write a polished summary, and publish it.

It is a thin, authenticated HTTP client over the LinkHub API — it stores no state
and calls no AI of its own.

---

## How it works

- The server speaks MCP over **stdio** and exposes five tools (below).
- On startup it reads two environment variables:
  - `LINKHUB_API_TOKEN` — **required.** Your Personal Access Token (`lh_pat_...`).
  - `LINKHUB_API_URL` — optional, defaults to `http://localhost:3333`.
- Every request is sent to the LinkHub API with `Authorization: Bearer <PAT>`.
- If the token is missing the server exits immediately with a clear message.

### How to get a token

1. Open the LinkHub app and go to **Settings → Personal Access Tokens**.
2. Create a token (scopes `posts:write` and `posts:read`).
3. Copy the one-time `lh_pat_...` value — it is shown only once.
4. Use it as `LINKHUB_API_TOKEN` in the config snippets below.

---

## Tools

| Tool | Purpose |
| --- | --- |
| `create_post` | Create a post (Markdown body). Stored with `source='mcp'`. |
| `list_my_posts` | List your posts (id, title, status, source, createdAt). Supports `limit`/`offset`. |
| `update_post` | PATCH a post by `id` with any subset of fields. |
| `delete_post` | Delete a post by `id`. |
| `create_commit_summary_post` | Publish a summary of recent git work. Stored with `source='commit'` and `metadata { repo, commitCount, period }`. |

### The commit-to-post workflow

`create_commit_summary_post` is designed so **the host AI does the writing**:

1. The agent runs `git log` for the period you want.
2. The agent composes a concise, recruiter-friendly Markdown summary of _what
   was shipped_ and its impact (features and outcomes — not raw commit lines).
3. The agent calls `create_commit_summary_post` with that summary. The tool
   simply persists it; it performs no summarization itself.

Example prompt:

> "Summarize my commits from this week in the linkhub-v.1 repo and post them to LinkHub as a published update."

---

## Setup

Build once (from the repo root):

```bash
npm install
npm run build --workspace=mcp
```

This produces `apps/mcp/dist/index.js`, the runnable entry point. In the snippets
below, replace `/ABSOLUTE/PATH/TO/linkhub-v.1` with the absolute path to this repo
and paste in your own token.

### Claude Desktop

Edit `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`,
Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "linkhub": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/linkhub-v.1/apps/mcp/dist/index.js"],
      "env": {
        "LINKHUB_API_URL": "http://localhost:3333",
        "LINKHUB_API_TOKEN": "lh_pat_your_token_here"
      }
    }
  }
}
```

### Claude Code

One-liner (project scope), from the repo root:

```bash
claude mcp add linkhub \
  --env LINKHUB_API_URL=http://localhost:3333 \
  --env LINKHUB_API_TOKEN=lh_pat_your_token_here \
  -- node ./apps/mcp/dist/index.js
```

Or add it to a `.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "linkhub": {
      "command": "node",
      "args": ["./apps/mcp/dist/index.js"],
      "env": {
        "LINKHUB_API_URL": "http://localhost:3333",
        "LINKHUB_API_TOKEN": "lh_pat_your_token_here"
      }
    }
  }
}
```

### Cursor

Create `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "linkhub": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/linkhub-v.1/apps/mcp/dist/index.js"],
      "env": {
        "LINKHUB_API_URL": "http://localhost:3333",
        "LINKHUB_API_TOKEN": "lh_pat_your_token_here"
      }
    }
  }
}
```

### VS Code

Create `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "linkhub": {
      "type": "stdio",
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/linkhub-v.1/apps/mcp/dist/index.js"],
      "env": {
        "LINKHUB_API_URL": "http://localhost:3333",
        "LINKHUB_API_TOKEN": "lh_pat_your_token_here"
      }
    }
  }
}
```

> VS Code will prompt before starting an MCP server. To keep the token out of
> the file you can use an input variable and reference it as
> `"LINKHUB_API_TOKEN": "${input:linkhub-token}"`.

---

## Local development

```bash
# From apps/mcp — watch mode (tsx)
LINKHUB_API_TOKEN=lh_pat_... npm run dev

# Type-check only
npm run check-types

# Build to dist/
npm run build
```

During development you can point a client at the source entry with
`tsx apps/mcp/src/index.ts` instead of the built `dist/index.js`.
