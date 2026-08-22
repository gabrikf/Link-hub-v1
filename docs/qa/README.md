# LinkHub QA — living docs

This is the durable QA tree: journeys, session charters, the scenario tracker, and the global bug registry. It is committed and appended to by every QA round; it is not per-run scratch space. Per-run output (dated reports, evidence) lives alongside it and is described below.

Bootstrapped `2026-08-22`, iteration 1 of the nightly QA-hardening loop (`.nightly/`), per `.claude/skills/qa-report/SKILL.md`. Read that skill (and its companion `.claude/skills/qa-execution/SKILL.md`) before adding to this tree — do not invent a different layout.

## Where this sits

| Directory | Owns |
|---|---|
| `docs/specs/<feature>/` | what we intend to build — feature specs |
| `docs/qa/` (this tree) | what we actually walked and what we found — journeys, charters, scenarios, the bug registry, dated reports |

Neither absorbs the other.

## Tree

```
docs/qa/
├── README.md            — this file
├── personas.md           — the five real LinkHub audiences (Nina, Diego, Priya, Atlas, Sam)
├── scenarios/            — one file per scenario, <AREA>-<slug>.md, living qa_status tracker
├── journeys/             — J-<slug>.md, flow maps (YAML + Mermaid) per user journey
├── charters/             — CH-<slug>.md, session charters (immutable once written; re-run across cycles)
├── bugs/                 — BUG-<YYYYMMDD>-<slug>.md, the global bug registry (ids stable forever)
├── reports/              — <YYYY-MM-DD>-<scope>.md, one per run, never overwritten
├── evidence/              — screenshots per run, gitignored (see policy below)
├── automation-backlog/   — intent to promote a journey to an automated spec, one file per item
├── state.csv             — GENERATED tracker view, gitignored, never hand-edited
└── templates/             — local copies of the four templates (scenario, bug, charter, report)
```

## Area codes

Scenario ids are `<AREA>-<slug>`. Area codes map to `apps/web/src/features/` and the routes in `apps/web/src/router.tsx`, so an id points at code an engineer can open. Add to this table only when a web feature area is added.

| Code | Covers | Route(s) |
|---|---|---|
| `AUTH` | `features/auth` — sign up, sign in, Google OAuth | `/` |
| `DASH` | `features/dashboard` — the signed-in overview | `/dashboard` |
| `RSME` | `features/resume`, `features/resume-import` — PDF import and the parsed career | (import flow under `/dashboard`) |
| `WORK` | `features/work-history` — roles, ranges, employers | (within profile surfaces) |
| `LAYT` | `features/profile-layout` — the drag-and-drop editor, desktop + mobile arrangements | `/dashboard/layout` |
| `PROF` | `features/profile` — the public profile as a stranger reads it | `/profile/$username` |
| `SRCH` | `features/search` — job-description search, pgvector, AI Match % | `/dashboard/search` |
| `POST` | `features/posts` — the posts list and the agent-post review queue | `/dashboard/posts`, `/dashboard/posts/review` |
| `SET` | `features/settings` — disclosure policy, API tokens, git connections | `/dashboard/settings` |
| `AGNT` | `apps/mcp` + `apps/extractor` — the agent-facing surface, no browser | MCP tools, extractor CLI/hook |

## How to start the stack

```bash
npm run build:schemas                       # always first
bash db-manage.sh start                     # Postgres/pgvector 5432, Redis 6379
bash db-manage.sh seed-all                  # recruiter.seed@linkhub.local + seed-<slug>-<NN>, password 12345678
npm run dev:api                             # http://localhost:3333 (Swagger at /docs)
npm run dev:web                             # http://localhost:5173
node scripts/guardrails/pre-push.mjs        # the gate
node scripts/visual/session.mjs login       # seed an authed storageState for the visual runner
```

Orientation docs this tree links rather than restates: `README.md` (root), `AGENTS.md` (root, plus `apps/api/AGENTS.md` and `apps/web/AGENTS.md`), `DESIGN.md` (the visual authority for any theme finding), `DEVELOPMENT-GUIDE.md` (the npm-scripts reference).

## Relationship to `.nightly/`

The autonomous nightly loop (`.nightly/STATE.json`, `.nightly/QUEUE.json`, `.nightly/MEMORY.md`, documented in `docs/nightly-loop.md`) is a separate, faster-cadence mechanism: it hunts bugs against the running dev servers every iteration and tracks them in `QUEUE.json` (`candidates` → `confirmed` → `fixed`/`escalated`/`rejected`). This tree is the slower, human-reviewable counterpart — durable journeys, personas and session charters that outlive any one night, plus the same bugs registered here with their GitHub issue and root-cause classification once triaged.

The two are not yet cross-linked in an automated way. Until they are: a bug confirmed in `.nightly/QUEUE.json` and judged durable-worthy gets a corresponding `bugs/BUG-<YYYYMMDD>-<slug>.md` file here (same id date/slug where practical) rather than being re-described from scratch.

## Evidence policy

Gitignored by default (see the gitignore block appended to the repo root). Screenshots stay on disk; reports reference them by path, and the report is the durable record. Screenshots are checkpoints and failures only, theme named in the filename. A disclosure finding's evidence is always a set — the policy screen, the agent's exact tool call and response, the rendered post on the logged-out public profile, and the raw API payload — never a single screenshot.

## Registered bugs

Registered from `.nightly/QUEUE.json` on 2026-08-22 (run `2026-08-22T18:58:46.702Z`, iteration 4 — TRIAGE). Ids are stable forever; status lives in each file.

| Bug | Severity | Area | One line |
|---|---|---|---|
| [BUG-20260822-disclosure-external-url](bugs/BUG-20260822-disclosure-external-url.md) | Critical / P0 | posts | `externalUrl` is never disclosure-scanned, so an agent publishes the employer's name in a public clickable link at `summary` |
| [BUG-20260822-disclosure-cross-role](bugs/BUG-20260822-disclosure-cross-role.md) | Critical / P0 | posts | Marking one job `full` un-blocks **every** other employer's name for agent-authored posts |
| [BUG-20260822-links-keyboard-reorder](bugs/BUG-20260822-links-keyboard-reorder.md) | High / P1 | dashboard | Profile links cannot be reordered by keyboard — the drag lifts and announces itself, then arrows do nothing |
| [BUG-20260822-open-to-work-switch-name](bugs/BUG-20260822-open-to-work-switch-name.md) | Low / P3 | dashboard | The "Open to work" switch has no accessible name |

## Adopted from

Nothing yet — this is a fresh bootstrap, not a migration. The four bugs above are the first entries the loop registered here. `.nightly/QUEUE.json`'s remaining `confirmed[]` entries (7 bugs carried in from a prior hand-off — `public-posts-contract`, `links-url-scheme`, `agent-self-publish`, `auth-unhandled-rejection`, `layout-vertical-keyboard`, `layout-error-fabricated`, `dashboard-error-state`) are still indexed here by reference only (see "Relationship to `.nightly/`" above); they were not re-reproduced by the triage that registered the four above, so copying them in would present hand-off knowledge as this cycle's verified work.
