# LinkHub Activity Extractor

Get credit on a public profile for the work you do in your employer's private
repositories — without shipping their code, their repo names, or their people's
email addresses to anyone, including LinkHub.

Two commands:

- **`linkhub-extract`** reads local git history and writes a JSON file of
  hashed, aggregated metadata. It prints a summary and **stops**. Uploading is a
  second command you type.
- **`linkhub-hook`** is a Claude Code hook that records agent sessions the same
  way, spooling locally and flushing when a session ends.

Analysis happens on your machine. The only thing that can leave it is a file you
have already read.

---

## The privacy guarantees, and how to check them yourself

These are the claims. Each one has a test, and each one is checkable by hand in
about thirty seconds.

| Guarantee | Check it |
| --- | --- |
| Repo names, remotes and paths never leave your machine — only a sha-256 fingerprint does | `grep -i your-repo-name linkhub-activity.json` |
| Commit messages are never sent — in fact they are **never read**. The extractor asks git for `%(trailers:key=Co-authored-by)`, not `%B`, so the message never enters the process | `grep -i 'some words from a commit message' linkhub-activity.json` |
| File paths and diffs are never sent; a changeset becomes a set of technology tags and a file count | `grep -i AcmeInvoiceService linkhub-activity.json` |
| Collaborators' emails are hashed before they touch a file | `grep -i @your-company.com linkhub-activity.json` |
| Dates only — never an hour, never a timezone offset. A profile cannot show when you sleep | `grep -E '[0-9]{2}:[0-9]{2}' linkhub-activity.json` |
| Branch names, issue keys and customer names are never collected at all | open the file; every event has six fields |
| Nothing is uploaded by `extract` | run it with your network off — it works |
| Re-running is a no-op, not a duplicate | run it twice, `diff` the two files |

The last one is worth doing. Two runs over the same history produce
**byte-identical** files, so a `diff` that shows nothing is a real result.

### What an event actually looks like

```json
{
  "externalDeliveryId": "3f2a…64 hex chars…",
  "kind": "commit",
  "occurredOn": "2026-03-04",
  "repoFingerprint": "9c81…64 hex chars…",
  "technologies": ["sql", "typescript"],
  "actorIsOwner": true,
  "counterpartyFingerprints": ["ab19…", "77e0…"],
  "payload": { "changedFiles": 4 }
}
```

That is the whole thing. The API's own schema (`activityFingerprintSchema`)
rejects anything in a fingerprint field that is not 64 hex characters, so a
clear-text identity cannot be stored even if this tool had a bug — but the
promise here is stronger: it never gets that far.

### Technology tags come from what *you changed*

A competitor once ranked people in the top few percent of languages they had
never written, because it measured the bytes in a repository instead of the
lines a person changed. So tags here come only from files you actually touched,
minus a named exclusion list: lockfiles, `node_modules/`, `vendor/`,
`third_party/`, `dist/`, `build/`, `target/`, `.next/`, `Pods/`, `.venv/`,
`*.min.js`, `*.map`, protobuf/gRPC codegen, `*.g.dart`, `__generated__/`,
snapshots, and more. The list is `EXCLUDED_PATH_PATTERNS` in
[`src/technologies.ts`](src/technologies.ts) — every entry carries the reason it
is there, and the tests assert against the real constant.

A dependency bump that touches 3,000 vendored Go files and one TypeScript file
credits TypeScript. Only.

---

## Install

```bash
npm install                          # from the monorepo root
npm run build:extractor
npm link --workspace=extractor       # optional: puts both commands on PATH
```

Set up auth. Extraction needs neither of these — only uploading does:

```bash
export LINKHUB_API_TOKEN='lh_pat_…'  # Settings → Personal access tokens
export LINKHUB_API_URL='http://localhost:3333'   # default
```

The token needs the **`activity:write`** scope, which is *not* granted by
default — a token you minted for the MCP server will not have it. A 403 says so
explicitly.

Optionally, `~/.linkhub/extractor.json` so you can stop passing flags:

```json
{
  "connectionId": "6b1d0f6e-6a3b-4d05-9d4e-6b0a35f2c8a1",
  "authors": ["me@work.example", "me@personal.dev"],
  "repos": ["/home/me/work/api", "/home/me/work/web"],
  "since": "180.days.ago",
  "includeAgentSummary": false
}
```

---

## Usage

```bash
# Extract, review, stop. No network. No token needed.
linkhub-extract ~/work/api ~/work/web --since 180.days.ago

# Read the file. Grep it. Then, separately:
linkhub-extract upload linkhub-activity.json
```

**Multiple author emails are first-class.** Most people commit as one address at
work and another on their own projects, and tools in this space routinely lose
half a history to it. Pass `--author` once per address, or let the extractor
read each repository's own `git config user.email` — it checks every repo, not
just the first:

```bash
linkhub-extract ~/work/api -a me@work.example -a me@personal.dev
```

Useful flags: `--since` / `--until` (default `90.days.ago`), `--repo`
(repeatable), `--out`, `--connection`, `--max-commits`, `--config`. `--yes`
uploads immediately and skips review; it exists, it is off, and it is the only
way extraction ever reaches the network.

---

## The Claude Code hook

Print the snippet (this command does **not** edit your settings — paste it
yourself):

```bash
linkhub-hook print-settings
```

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [{ "type": "command", "command": "linkhub-hook stop", "timeout": 5 }]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "linkhub-hook session-end",
            "timeout": 30,
            "async": true
          }
        ]
      }
    ]
  }
}
```

Goes in `~/.claude/settings.json` (all projects) or `.claude/settings.json` (one
project). If you already have a `hooks` key, merge into it.

### Why Stop spools and SessionEnd flushes

`Stop` fires once **per turn**, not once per task. Hooking it naively means an
HTTP request on every single agent response — latency you pay for all day, and
an ingestion firehose. So `Stop` does no network I/O at all: it appends one line
to `~/.linkhub/spool/events.jsonl`, and only when the repository's `HEAD` has
moved since the last line it wrote for this session. Idle turns — a question
answered, some code read — cost nothing. It also exits immediately when
`stop_hook_active` is true, which is how hook loops start.

`SessionEnd` fires once per session, but SessionEnd hooks **share a ~1.5 second
budget**, which is not enough for an HTTP round trip. So it is declared
`"async": true` and Claude Code does not wait for it.

If the upload fails — you are offline, the API is down, the token expired — the
spool is **left in place** and the next session that ends successfully carries
the backlog. Events are idempotent server-side, so a retry after a partial
success costs nothing.

**The hook always exits 0.** Exit code 2 blocks the agent and other non-zero
codes surface as errors; neither is acceptable for a profile tool. A missing
token, a corrupt spool, an unreachable API and an outright bug in this package
all look identical from inside your session: nothing happened.

### The agent's own prose is off by default

`Stop`'s payload includes `last_assistant_message` — the model's description of
what it just did, which is the field most likely to name your employer's systems
in plain English. It is attached **only** when `includeAgentSummary` is `true`
in your config file, and the connection carries an independent server-side flag
of the same name. Omission means no. There is a test that scans the spool file
for the prose and fails if it appears.

---

## Limitations, honestly

- **Commits only.** Pull requests, reviews and releases are not visible from a
  local checkout, so `pull_request_merged`, `review_submitted`,
  `review_received` and `release` come from the forge connectors, not from here.
- **Co-authors come from trailers.** Reviewers and approvers live on the forge,
  so a repo without `Co-authored-by:` trailers produces no counterparties.
- **Merge commits are skipped** (`--no-merges`). They carry no diff of their
  own, so counting them would double-count work already counted on the branch.
- **You must be the commit author.** Commits where you were only a co-author are
  not collected — claiming them would mean reading someone else's history.
- **Technology tags are conservative by design.** An unrecognised extension
  credits nothing. Silence beats a false claim on something a recruiter reads.
- **The repo fingerprint follows the remote.** A repo with no remote falls back
  to its absolute path, so moving that directory changes its fingerprint and it
  will look like a new repository.

---

## Development

```bash
npm run test --workspace=extractor
npm run check-types --workspace=extractor
```

Tests build throwaway git repositories in temp directories — nothing reads this
repository's own history. The privacy tests work by planting confidential
strings in a fake repo's remote URL, branch name, file paths, commit messages
and collaborator addresses, then asserting that none of them appear anywhere in
the serialized payload. That scan-the-output approach is deliberate: a field
added later that leaks one of them fails the test without anyone remembering to
update it.
