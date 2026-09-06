---
name: qa-report
description: >-
  Plans real-user QA for CraftHub as living repo docs — the durable
  <qa-docs-path> tree (default docs/qa/) that every QA cycle appends to. Use
  when bootstrapping or updating the project's QA docs, planning a cycle before
  execution (map journeys as flows — sign-up, resume import, profile layout,
  recruiter search by job description, agent posts and the review queue,
  disclosure policy — derive scenarios, plan persona-driven session charters),
  or registering bugs into the durable bug registry with their GitHub issue and
  root-cause classification. Do not use for live session execution, browser
  evidence, or fix loops — use qa-execution for those.
disable-model-invocation: true
argument-hint: "[qa-docs-path]"
metadata:
  author: Pedro Nauck
  github: https://github.com/pedronauck
  repository: https://github.com/pedronauck/skills
---
# Real-User QA Planner

Plan QA as journeys real people walk, not test cases that accumulate. This skill owns the project's **living QA docs** — one committed tree (`<qa-docs-path>`, default `docs/qa/`) that every round appends to — and plans the persona-driven sessions `qa-execution` runs.

Two rules anchor everything:

1. **Living docs, not round artifacts.** All durable QA knowledge lives in the one committed tree; rounds append to it (structure, durability, and anti-patterns: `references/qa-docs-layout.md`).
2. **Sessions, not cases.** The atomic planning unit is the **session charter** (persona + journey + tour + time-box), derived from journey flowcharts. Coverage means "every planned journey was walked by a persona this cycle" — a session ledger, never a per-case count.

Each step points at the reference file that owns its contract; read that file before producing the step's deliverable — the inline text is a pointer, not the spec.

## Required Inputs

- **qa-docs-path** (optional): root of the living tree; defaults to **`docs/qa/`** at the repo root, beside `docs/specs/` (where feature specs live). Never a temp dir. If the argument points outside the repository, confirm before proceeding: living docs outside the repo lose review, diff, and history.

## CraftHub specifics

Five things this project fixes, so plans do not drift into generic QA:

- **Personas are CraftHub's three real audiences** — the **developer** curating their own profile and disclosure policy, the **recruiter** searching by job description and reading AI Match %, and the **coding agent** publishing posts through MCP behind that policy — plus the public reader who lands on a shared profile. Derive `<qa-docs-path>/personas.md` from those, per `references/personas.md`. There are no industrial or e-commerce archetypes here.
- **The disclosure policy is the product's highest-risk surface.** Every cycle that touches posts, settings, the MCP server, the extractor or the public profile plans at least one Disclosure Tour charter. A leak — an agent naming an employer, client or blocked term above the chosen level — is `Data-Loss` at minimum. The tour lives in `../qa-execution/references/tours.md`, its edges in `../qa-execution/references/edge-cases.md`, its lens in `../qa-execution/references/lenses.md`.
- **Dark mode is a standing planning dimension.** The web app themes through a `.dark` class; a surface authored without its `dark:` variants is unreadable, not merely off-brand, and it is this repo's cheapest bug to ship. Every browser charter is planned as light **and** dark, and `DESIGN.md` at the repo root is the arbiter of what each theme should look like.
- **Area codes map to the real web features** under `apps/web/src/features/` and the routes in `apps/web/src/router.tsx` — one code per area, defined once in `<qa-docs-path>/README.md`. See the seed table in `references/qa-docs-layout.md`.
- **Every bug carries its GitHub issue** (`gh issue create` against the repo in `git remote -v`) and, on close, one **Root Cause** from the fixed taxonomy — `api-contract · cache-state · auth-permission · disclosure-policy · date-timezone · race-loading · null-data · layout-responsive · dark-mode · search-ranking · regression · third-party`. Contract in `references/bug-registry.md`.
- **Fixes are red-test-first (vitest) and gated by `node scripts/guardrails/pre-push.mjs`.** Planning does not fix anything, but the plans it writes must not imply otherwise — the fix contract lives in `../qa-execution/references/fix-loop.md`. There is no jest in this repo. There IS i18n — three locales, enforced by the gate — so a translation-coverage sweep is a legitimate session, and a raw string on screen is a real bug.

## Procedures

**Step 1 — Resolve or bootstrap the tree.** Read `references/qa-docs-layout.md` (canonical tree, gitignore block, bootstrap procedure, adoption procedure for scattered legacy artifacts). Resolve `<qa-docs-path>`. If the tree exists, read its `README.md` and scan `scenarios/` and open `bugs/` first, and build every decision below on that state; when the branch just merged parallel QA work, reconcile before planning — two files describing one behavior or one symptom fold into the older id (merge verdict fields by `last_report` recency, update references, delete the duplicate, record the fold in the cycle's report). If the tree does not exist, bootstrap it per the layout reference — directory tree, seeded `templates/`, and the gitignore block. If legacy QA artifacts sit scattered outside it, adopt them per the reference: index them, migrate durable knowledge, re-mint counter-based ids.

**Step 2 — Establish project personas.** Read `references/personas.md` (seed catalog + CraftHub's real audience + derivation rules). Personas are durable instance data in `<qa-docs-path>/personas.md`: update them only when the product's audience changed; if absent, derive 4-6 from the catalog, adapted to real accounts. The coding-agent persona is mandatory whenever the cycle touches posts or MCP — it is a real user of this product, and it is the only persona whose interface is not a browser.

**Step 3 — Map journeys as flows (before any scenario).** Read `references/journeys-and-flows.md` (journey anatomy, Mermaid mapping, flows-before-matrix, the CraftHub journey seed set). Scope the mapping: a branch/PR cycle covers every user-visible change in the diff; a release cycle covers the product's high-value journeys. For each, write or update `<qa-docs-path>/journeys/J-<slug>.md` — the YAML journey map plus a Mermaid flowchart from entry → actions → branch points → side effects → the **true end state**, with at least one abandonment path. Map the flow first; the scenario comes from it.

**Step 4 — Derive scenarios into the tracker.** Read `references/state-schema.md` (fields, enums, id minting — exact) and `references/taxonomy.md` (the six coverage dimensions). Walk each flowchart and derive scenarios: one `scenarios/<AREA>-<slug>.md` file per scenario with a content-addressed id, updated in place, overlaps recorded in the `overlaps` field. Sweep the six taxonomy dimensions per journey so coverage is deliberate. Scenario files are planning output — `qa_status` stays `untested` until `qa-execution` runs them.

**Step 5 — Plan session charters.** Read `references/session-charters.md` (charter anatomy, cadence tiers, the coverage inversion). Pick the cadence tier (smoke / targeted / full / sanity); the tier picks the journeys. Write one charter per session to `<qa-docs-path>/charters/CH-<slug>.md` from `<qa-docs-path>/templates/charter.md` (seed: `assets/charter-template.md`), preserving its headings — mission, persona, journey, exactly one tour, themes, time-box, must-try guidance — ordered by risk: highest-impact journey × highest-blast-radius tour first. Reuse an existing charter whose mission still fits before writing a sibling.

**Step 6 — Register bugs.** Read `references/bug-registry.md` (id minting, dedup, the five-tier user-impact rubric — the canonical severity model for both skills — plus the GitHub link and the root-cause taxonomy). Dedup before filing: search `<qa-docs-path>/bugs/` for the symptom and update the existing file rather than duplicating — a re-found bug is history worth keeping on one id. Only a genuinely new symptom mints a new content-addressed `BUG-<YYYYMMDD>-<slug>` id; write it from `<qa-docs-path>/templates/bug.md` (seed: `assets/bug-template.md`), preserving its headings, and link the id into the affected scenario files' `bug_ids`.

**Step 7 — Validate cycle completeness.** Before handing off to `qa-execution`, verify — and record gaps honestly rather than padding:

- every in-scope journey has a flowchart with a true end state and ≥1 abandonment path;
- every in-scope journey has ≥1 charter with an assigned persona;
- **every cycle touching agent-authored content has ≥1 Disclosure Tour charter;**
- **every browser charter names both themes, or names which one it is deliberately skipping and why;**
- every in-scope scenario file has a content-addressed id, a linked journey, and a `qa_status` reflecting reality;
- every open bug has a registry file and appears in ≥1 scenario's `bug_ids`;
- the six taxonomy dimensions were considered per journey — a skipped one is recorded with reasoning.

The completeness bar is "every journey walked by a persona", a session ledger — never a per-case count. Case accumulation is the failure mode this skill exists to prevent.

When a journey grows stable or regression-prone enough to deserve an automated walk, read `references/automation-backlog.md` in full, then record the intent as one file in `<qa-docs-path>/automation-backlog/` — one backlog, never automation fields on individual scenarios or charters.

## Companion Skills

- **qa-execution** — runs the sessions this skill plans and writes results back into the same tree (statuses, bugs, reports). The living tree is the contract between the two.
- **visual-check** — the browser driver `qa-execution` uses (scenario scripts via `node scripts/visual/run.mjs` against `npm run dev:web`, both themes, `DESIGN.md` as the visual authority). Planning names screens and routes; that skill is what actually looks at them.
- **i18n** — the shipped internationalisation contract: three locales, every user-visible string through `t()`, both halves gated. Consult it when a plan touches copy, or when planning a translation-coverage session.
- **testing-boss** / **no-workarounds** — how a fix's regression test is written (vitest, red first), and how the fix itself is judged. Referenced by the automation backlog when a journey earns a committed spec.
- **diagnose** — for a finding whose cause resists the walk.
- **The guardrail scripts, not a skill** — `node scripts/guardrails/pre-push.mjs` (the gate), `npm run check-types`, `node scripts/guardrails/lint-changed.mjs`, `npm run test:coverage`. Route technical integration/security/performance/load suites there or to dedicated tooling; record the routing decision, don't absorb the work.

## Error Handling

- **A scenario file's frontmatter won't parse** (missing delimiter, unknown field, nested value): repair it and report what was repaired before any downstream step — every step depends on a loadable tracker.
- **Two files describe one behavior or one symptom under different slugs** (typical after merging parallel QA branches): run the Step 1 fold before any downstream step plans on top of the duplicates.
- **A branch cycle's diff has no user-visible change:** say so and stop; there is nothing to dogfood. Do not invent scenarios to fill a cycle. A pure refactor still gets a line in the report saying so.
- **The diff is entirely in `apps/mcp` or `apps/extractor`:** it is still user-visible — the agent persona is a user, and its output lands on a human's public profile. Plan the agent journeys rather than declaring the cycle empty.
- **`<qa-docs-path>` can't be created** (permissions, read-only checkout): surface the error and stop — never fall back to a temp directory.
