# QA Docs Layout

The canonical living QA tree. One tree per project, committed to the repository, appended to by every QA round. This layout is the contract between `qa-report` (writes plans, registry, tracker) and `qa-execution` (writes results, reports, evidence).

The tree is **merge-safe** by construction: every id is content-addressed (no shared counters to collide on), every run writes its own dated files (no shared file two branches append to), and generated views are gitignored (no derived artifact to conflict over). Parallel branches running QA merge without touching each other.

## Contents

- The canonical tree
- What is durable vs per-run
- Version-control policy (the gitignore block)
- Bootstrap procedure (new project)
- CraftHub: where the tree sits, and its area codes
- Adoption procedure (project with scattered QA artifacts)
- Evidence policy (lean by design)
- Anti-patterns

## The canonical tree

```
<qa-docs-path>/                      # default: docs/qa/
├── README.md                        # project QA conventions, area codes, entry points
├── personas.md                      # project personas (instances, not methodology)
├── scenarios/
│   └── <AREA>-<slug>.md             # living scenario tracker, one file per scenario (see state-schema.md)
├── journeys/
│   └── J-<slug>.md                  # journey map (YAML) + Mermaid flowchart
├── charters/
│   └── CH-<slug>.md                 # session charters; immutable once written (debriefs live in reports)
├── bugs/
│   └── BUG-<YYYYMMDD>-<slug>.md     # global bug registry (see bug-registry.md)
├── reports/
│   └── <YYYY-MM-DD>-<scope>.md      # one per run; dated; never overwritten
├── evidence/
│   └── <YYYY-MM-DD>-<scope>/        # screenshots per run — gitignored by default (policy below)
├── automation-backlog/
│   └── <slug>.md                    # automation intent, one item per file (see automation-backlog.md)
├── state.csv                        # GENERATED tracker view — gitignored, never edited (see state-schema.md)
└── templates/
    ├── scenario.md                  # seeded from qa-report/assets/scenario-template.md
    ├── bug.md                       # seeded from qa-report/assets/bug-template.md
    ├── charter.md                   # seeded from qa-report/assets/charter-template.md
    └── report.md                    # seeded from qa-execution/assets/report-template.md
```

Both skills prefer the project-local `templates/` copies (projects may customize them); the bundled assets are the fallback and the seed source.

## What is durable vs per-run

| Durable (grows, never reset)                          | Per-run (dated, appended)                    |
| ----------------------------------------------------- | -------------------------------------------- |
| `scenarios/` files and their lifecycle fields         | `reports/<date>-<scope>.md`                  |
| `bugs/` (ids stable forever)                          | `evidence/<date>-<scope>/`                   |
| `personas.md`, `journeys/`, `automation-backlog/`     | session debriefs (inside the run report)     |
| `charters/` (missions persist; re-run across cycles)  | `state.csv` (regenerated view)               |

The durable side is the memory that per-round QA trees never had: the next cycle reads it before planning, dedups against it before filing, and updates it instead of duplicating it.

## Version-control policy (the gitignore block)

The tree splits into **source** (committed: scenarios, bugs, journeys, charters, reports, personas, templates, README) and **output** (ignored: generated views, bulky evidence). Bootstrap appends this block to the repo-root `.gitignore` (adjust the path when `<qa-docs-path>` differs):

```gitignore
# QA living docs — generated views & bulky evidence (source of truth: docs/qa/scenarios/ etc.)
docs/qa/state.csv
docs/qa/evidence/
```

The rule behind the block, applied to anything new the tree accumulates: **generated or bulky → ignored; authored and reviewable → committed.** Screenshot dumps, exported spreadsheets, and multi-MB logs are output, not source — a 400KB generated file that changes every cycle buys permanent merge conflicts and drowns review, while its source files diff cleanly.

## Bootstrap procedure (new project)

1. Create the directory tree above under `<qa-docs-path>` (add a `.gitkeep` in empty dirs when git needs it).
2. Copy the four templates into `templates/` (scenario + bug + charter from `qa-report/assets/`, report from the sibling skill's `qa-execution/assets/report-template.md` when installed).
3. Write `README.md` with: the project's area codes for scenario ids (defined once — seed table below), the product's entry points and routes, how to start the stack, and the evidence policy choice (default below).
4. Append the gitignore block (above) to the repo-root `.gitignore`.

For CraftHub, the README's "how to start" section is exactly:

```bash
npm run build:schemas                       # always first
bash db-manage.sh start                     # Postgres/pgvector 5432, Redis 6379
bash db-manage.sh seed-all                  # recruiter.seed@crafthub.local + seed-<slug>-<NN>, password 12345678
npm run dev:api                             # http://localhost:3333 (Swagger at /docs)
npm run dev:web                             # http://localhost:5173
node scripts/guardrails/pre-push.mjs        # the gate
node scripts/visual/session.mjs login       # seed an authed storageState for the visual runner
```

## CraftHub: where the tree sits, and its area codes

`<qa-docs-path>` defaults to **`docs/qa/`** at the repo root, beside `docs/specs/`:

| Directory | Owns |
|---|---|
| `docs/specs/<feature>/` | what we intend to build — feature specs |
| `docs/qa/` | what we actually walked and what we found — journeys, charters, scenarios, the bug registry, dated reports |

Neither absorbs the other, and neither is bootstrapped into the other. The orientation docs the tree's README should link rather than restate: `README.md` (root), `AGENTS.md` (root, plus `apps/api/AGENTS.md` and `apps/web/AGENTS.md`), `DESIGN.md` (the design language — the arbiter for any visual or theme finding), and `DEVELOPMENT-GUIDE.md` (the npm-scripts reference).

**Area codes come from the real web features** under `apps/web/src/features/` and the routes in `apps/web/src/router.tsx`, so a scenario id points at code an engineer can open. Define the set once in `<qa-docs-path>/README.md` and add to it only when an area is added. Seed mapping (`apps/web/src/router.tsx` is the authority for routes):

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

A code grouping several folders (`RSME`, `POST`) is grouping one user-facing area — that is fine; a code covering *unrelated* areas is not, split it. `AGNT` is deliberately not a route: it is the surface the Autonomous Agent persona uses, and scenarios there are settled through MCP tool calls with their true end state read on a `POST` or `PROF` surface.

## Adoption procedure (project with scattered QA artifacts)

For projects that accumulated per-round `qa/` trees, orphan bug files, a monolithic `state.csv`, or external outputs before this layout existed:

1. **Inventory first.** List every location holding QA artifacts. Record the inventory in `README.md` under `## Adopted from`.
2. **Migrate durable knowledge only:** journey definitions, still-relevant charters, and open/unresolved bugs. Historical verification reports and evidence stay where they are — indexed by path from `README.md`, never copied.
3. **Grandfather unique ids; re-mint only colliding ones.** Counter ids from a healthy single tree (unique across the project, cited by existing reports, charters, and bugs) are kept as-is — each scenario or bug file keeps its old id and filename, and only ids minted from here on use the content-addressed format, so the counter stops being read and branches stop contending. Re-mint only ids that actually collide, recording the origin path and old id in the migrated file's `Origin:` field — old ids become aliases inside the file, never reused as registry ids.
4. **Explode a legacy tracker into scenario files.** Run `python3 <qa-report-skill-dir>/scripts/explode_state.py <csv-path> <qa-docs-path>` — a bootstrap helper: reads the CSV, writes one `scenarios/<id>.md` per row (grandfathered id = filename, packed notes unfolded into body paragraphs), and touches nothing else. Validate the round trip: `materialize_state.py` must parse every produced file and report exactly the original row count. Then untrack the generated artifacts that stay behind (`git rm --cached <qa-docs-path>/state.csv`, evidence dirs) in the same adoption commit, so the gitignore block takes effect.
5. **Seed net-new scenarios from the product, not from old test cases.** Derive files from journey flows (Steps 3-4 of the SKILL). Old test-case files describe checks, not scenarios; mine them for forgotten edge knowledge, then leave them behind.
6. Old trees are then dead weight: recommend archival or deletion to the operator — do not maintain both systems. A README changelog section, if one accumulated, is closed the same way: move its entries into the adoption cycle's report and delete the section — cycle history lives in `reports/` from here on. Record the adoption (what moved, what was grandfathered or re-minted, what was untracked) in that report.

## Evidence policy (lean by design)

Living docs stay reviewable. Evidence discipline:

- **Gitignored by default** (the bootstrap block above): screenshots stay on disk and in CI artifact stores; reports reference them by path, and the report is the durable record. A project that wants evidence in history removes the `evidence/` line from the block and records that choice in `README.md`.
- Screenshots: **checkpoints and failures only** — goal-reached states, divergences, bug reproductions. Not every step.
- **Name the theme in the filename** (`<charter>-<step>-dark.png`). A dark-mode bug report whose screenshot doesn't say which theme it is wastes the reader's first minute.
- **A disclosure finding's evidence is a set, not a screenshot:** the policy screen at the level that was set, the agent's exact tool call and response, the rendered post on the logged-out public profile, and the raw API payload for the same post. One of those alone does not establish where the leak lives.
- Big artifacts (videos, HAR files, multi-MB logs) never enter the tree at all. Store them wherever the project keeps build artifacts and **index them by path** from the report.
- Committed or not, if a run's evidence directory exceeds what a reviewer would reasonably scan (rule of thumb: tens of files / a few MB), prune to the failures and note the pruning in the report.

## Anti-patterns

- **Parallel trees** — a second tracker, a `qa-v2/` dir, or a per-round `qa/` tree next to the canonical one. One tree; rounds append.
- **Shared counters** — `BUG-NNNN`, `CH-NNN`, or any "next = max + 1" id. Two branches mint the same number and collide on merge; ids are content-addressed (date + slug, area + slug) so branches cannot contend.
- **Committing output** — a generated `state.csv` or an evidence dump in the index. They churn every cycle, conflict on every merge, and bury the reviewable source files. The gitignore block is part of the tree.
- **Shared append files** — one changelog, one backlog file, one debrief section that every run appends to. Per-run history goes in that run's dated report; per-item registries get one file per item.
- **Temp-dir fallback** — writing QA output to `/tmp` because no path was given. The default is `docs/qa/` in the repo; a missing tree is bootstrapped, not dodged.
- **Bootstrapping without reading existing state** — if the tree exists, plans build on `scenarios/` and the bug registry. Planning from scratch on top of an existing tree recreates the duplication problem inside the tree itself.
