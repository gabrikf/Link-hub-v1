# LinkHub MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets you
create and manage your **LinkHub** posts from any MCP client — Claude Desktop,
Claude Code, Cursor, VS Code, and more.

Its headline use case: **turn your git commits into a recruiter-friendly post.**
Run the `weekly_update` prompt and your agent reads your `git log`, works out
what actually shipped, writes it up in LinkHub house style, and publishes it.

Crucially, **the writing instructions travel with the connection**. The server
ships an MCP prompt (the workflow) and an MCP resource (the style guide), so a
connected agent knows how to write a good post without you pasting rules into a
`CLAUDE.md`, a `.cursorrules`, or the chat box.

It is a thin, authenticated HTTP client over the LinkHub API — it stores no state
and calls no AI of its own.

---

## How it works

- The server speaks MCP over **stdio** and exposes five tools, two prompts and
  one resource (below).
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
| `create_post` | Create a post (Markdown body, optional cover image, images, `externalUrl`, tags). Stored with `source='mcp'`. |
| `list_my_posts` | List your posts (id, title, status, source, createdAt). Supports `limit`/`offset`. |
| `update_post` | PATCH a post by `id` with any subset of fields, including `externalUrl`. |
| `delete_post` | Delete a post by `id`. |
| `create_commit_summary_post` | Publish a summary of recent git work. Stored with `source='commit'` and `metadata { repo, commitCount, period }`. |

---

## Prompts

MCP prompts are user-invoked workflows the server hands to the host agent. They
are how the agent learns the commits-to-post pipeline without you configuring
anything.

| Prompt | Arguments | What it does |
| --- | --- | --- |
| `weekly_update` | `period?`, `repo?`, `status?` | The headline workflow. Walks the agent through bounding the git window, reading the commits *and the diffs*, extracting what shipped / impact / metrics / stack / links, writing the post in house style, stripping secrets and internal identifiers, and publishing via `create_commit_summary_post`. |
| `since_last_post` | `repo?`, `status?` | Same workflow, but the window is derived from LinkHub: it calls `list_my_posts`, finds your newest `source=commit` post, and summarizes only work done since then — so repeated runs never double-post. Falls back to 14 days if you have no commit summary yet. |

`period` accepts `daily`, `weekly` (default), `monthly`, a range like
`2026-07-14..2026-07-21`, or any git date expression such as `3 days ago`.
`status` is `published` (default) or `draft`.

### Invoking a prompt

| Host | How |
| --- | --- |
| Claude Code | `/linkhub:weekly_update` (arguments after it, e.g. `/linkhub:weekly_update monthly`) |
| Claude Desktop | The **+** button in the composer → `linkhub` → `weekly_update` |
| VS Code | `/mcp.linkhub.weekly_update` in the Chat view |
| Cursor | The chat `/` menu on recent versions; otherwise just ask in plain language |

Hosts that don't surface MCP prompts still get the same guidance — the tool
descriptions and the resource below carry it.

---

## Resources

| URI | Contents |
| --- | --- |
| `linkhub://guides/post-quality` | The LinkHub post quality guide (Markdown). |

The guide is the single source of truth for what makes a post recruiter-worthy:
outcome over mechanics, concrete verified metrics, the stack named with
searchable technology names, links to shipped work; what must never appear (raw
commit messages, SHAs, branch names, ticket ids, secrets, private client
detail); length (80–200 words) and tone targets; the exact field mapping for
`create_commit_summary_post`; and a worked weak-vs-strong example.

An agent can read it unprompted at any time. Its full text is also inlined into
both prompts, so an agent that never lists resources still gets it.

Source of truth: `src/resources/post-guidelines.ts`.

---

## The commit-to-post workflow

`create_commit_summary_post` is designed so **the host AI does the writing** —
the tool runs no AI and publishes `summary` verbatim:

1. You invoke `weekly_update` (or `since_last_post`).
2. The agent bounds the window, reads `git log` **and** `git diff --stat` for
   the period, and opens the files that changed most.
3. It extracts the facts: repo, commit count, the 2–5 user-visible capabilities
   that shipped, their impact, any metric it can actually verify, the stack
   touched, and a public link if one exists.
4. It writes 80–200 words of first-person Markdown about outcomes, strips
   anything sensitive, shows you the draft.
5. It calls `create_commit_summary_post`.

Without invoking a prompt, plain language works too:

> "Summarize my commits from this week in the linkhub-v.1 repo and post them to LinkHub as a published update."

---

## Setup

Build once (from the repo root):

```bash
npm install
npm run build --workspace=mcp
```

This produces `apps/mcp/dist/index.js`, the runnable entry point. Print its
absolute path — run this from anywhere inside the checkout and paste the output
wherever a snippet below shows `/ABSOLUTE/PATH/TO/linkhub-v.1/apps/mcp/dist/index.js`:

```bash
echo "$(git rev-parse --show-toplevel)/apps/mcp/dist/index.js"
```

Then paste in your own token.

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

One-liner, from anywhere inside the repo — the shell resolves the entry path, so
there is nothing to hand-edit but the token:

```bash
claude mcp add linkhub \
  --env LINKHUB_API_URL=http://localhost:3333 \
  --env LINKHUB_API_TOKEN=lh_pat_your_token_here \
  -- node "$(git rev-parse --show-toplevel)/apps/mcp/dist/index.js"
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

## Verify the connection

| Host | Check |
| --- | --- |
| Claude Code | `/mcp` in-session, or `claude mcp list` from a shell — `linkhub` should read *connected*. |
| Claude Desktop | Fully quit and reopen (config is read only at startup), then look for `linkhub` and its 5 tools in the composer's tools menu. |
| Cursor | **Settings → MCP** — `linkhub` should show a green dot and its tool list. |
| VS Code | Run the **MCP: List Servers** command — `linkhub` should be *Running*. |

Then prove the token itself works: ask *"list my LinkHub posts"*. A bad or
expired PAT surfaces as `Invalid or expired LinkHub token`; an unreachable API
surfaces as `Could not reach the LinkHub API at ...`.

You can also drive it by hand over stdio:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cli","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"prompts/list"}' \
  | LINKHUB_API_TOKEN=lh_pat_your_token_here node apps/mcp/dist/index.js
```

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
