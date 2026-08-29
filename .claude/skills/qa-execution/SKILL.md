---
name: qa-execution
description: >-
  Runs real-user dogfooding sessions through CraftHub's public interfaces: a
  persona walks a journey in the browser (or an agent persona walks it through
  MCP), takes a thematic tour, probes edges, hunts paper cuts, and reports what
  a real user would experience. Reads its plan from the living QA docs tree
  (<qa-docs-path>, default docs/qa/). Use when validating a release candidate,
  branch diff, migration, or user-facing change to the profile editor, recruiter
  search, posts review queue, disclosure policy, or public profile against
  production-like behavior. Drives the web app with the visual scenario runner
  against npm run dev:web. For planning that tree — personas, journeys,
  charters, the bug registry — use qa-report; for CI gate runs and test hygiene,
  run node scripts/guardrails/pre-push.mjs.
disable-model-invocation: true
argument-hint: "[qa-docs-path]"
metadata:
  author: Pedro Nauck
  github: https://github.com/pedronauck
  repository: https://github.com/pedronauck/skills
---
# Real-User QA Execution

QA the product the way a real person meets it: a **persona** walks a journey through the product's public interfaces, feels the friction, hits the edges, and reports what happened. This is **dogfooding**, not a scripted test pass — the session is the work, and the living QA docs tree remembers it.

Three non-negotiables hold every session:

1. **In persona.** Every interaction and every verification goes through a surface a real user can reach — no dev-tools shortcut, no code-reading to decide what should happen, no patching over a stall.
2. **Proof, not optimism.** A `Pass` is the expected observable seen, confirmed through an independent read path, surviving a refresh, with evidence captured. Optimistic UI is not confirmation.
3. **Write back or it didn't happen.** Every session updates the tree — scenario-file verdicts, bug registry, and the dated report carrying the session debrief.

## Input

- **qa-docs-path** (optional): root of the living QA docs tree; defaults to `docs/qa/`. The tree is this skill's memory and its only output location — never a temp dir. If it doesn't exist, run `qa-report` first; it owns the tree and its bootstrap.

## CraftHub specifics

- **The app under test:** `npm run dev:web` → **http://localhost:5173** (Vite), talking to `npm run dev:api` → **http://localhost:3333** (Fastify; Swagger at `/docs`). Both need the local stack up: `bash db-manage.sh start` (Postgres/pgvector 5432, Redis 6379). Never QA against a mocked build — a session against MSW handlers measures the mocks.
- **Test data comes from the seeder**, never from invented records: `bash db-manage.sh seed-all` creates the recruiter `recruiter.seed@crafthub.local` and candidate accounts `seed-<blueprint-slug>-<NN>` (e.g. `seed-react-frontend-003`). **Password for every seed user: `12345678`.** The public profile of a seeded candidate is `http://localhost:5173/profile/seed-react-frontend-003`.
- **The browser driver is the `visual-check` skill** — load it before Step 3; it owns how the browser is driven in this repo. Its default shape is a scenario script run in one process:
  ```bash
  node scripts/visual/run.mjs scripts/visual/scenarios/<name>.scenario.mjs
  node scripts/visual/session.mjs login      # seeds an authenticated storageState at .playwright/auth.json
  ```
  The runner fails the walk on console errors, uncaught exceptions and un-mocked 4xx/5xx — those are findings even when the screen looks right. `mock()` inside a scenario is what forces a loading, empty or error state; use it to *reach* a state, never to fake the state under test. Command surface: `references/session-protocol.md`.
- **Dark mode is a standing dimension, not an optional tour.** The web app themes through a `.dark` class on `<html>`, persisted in `localStorage["crafthub-theme"]` (`@custom-variant dark` in `apps/web/src/index.css`); a surface whose author forgot its `dark:` variant renders invisible or unreadable text and is one of this repo's most common real bug classes. Every browser charter walks its surface in **both** themes, and the report says so.
- **The disclosure policy is the highest-value bug class in the product.** A post published by a coding agent that names an employer, a client, or a blocked term above the user's chosen disclosure level is a `Data-Loss`-tier leak of someone's real employment context. It gets its own lens (`references/lenses.md`), its own edge-case section (`references/edge-cases.md`), and its own tour (`references/tours.md`). Never treat a disclosure finding as cosmetic.
- **Design questions resolve against `DESIGN.md`** at the repo root — CraftHub's design language. There is no external design system to cite.
- **There is no i18n.** `<html lang="en">`, every user-visible string is hardcoded English. Do not walk a "Locale tour" looking for missing translation keys, and never invent `t()` calls in a fix — the **`i18n`** skill holds the *planned* setup, not a description of existing code. Number, date and timezone formatting is still in scope; that lives in the Time & Formatting tour and the lens pass.
- **Bugs go to GitHub.** Every registry bug that reaches engineering gets an issue via `gh issue create` on `https://github.com/gabrikf/Link-hub-v1` (read `git remote -v` rather than trusting that string), and on close carries one **Root Cause** from the fixed taxonomy in `../qa-report/references/bug-registry.md`. Default branch is `main`.
- **CI gates and test hygiene are not this skill's job.** `node scripts/guardrails/pre-push.mjs` owns the gate. A session that uncovers a gate problem files it and names the gate; it does not pivot mid-session into fixing the pipeline.
- **The known, deliberate debt is not a finding.** 30 pre-existing eslint errors in `apps/web`, no eslint history in `apps/api`, zero tests in `apps/mcp`, dead `packages/ui`, `eslint-plugin-only-warn` neutering `packages/eslint-config`, the stray `pluguins/` directory. A session does not file these and a fix does not "clean them up on the way past".

## Steps

Each step names the reference that owns its detail — read it in full when you reach the step; the inline text is the trigger, not the contract.

**Step 1 — Resolve the tree, scope, and preconditions**
- Read, in order: `<qa-docs-path>/README.md` (entry points, dev-server commands, area codes), the in-scope `scenarios/` files, open `bugs/`, and this cycle's charters. The tree is the memory; running without reading it recreates the duplication this design kills.
- Scope: a **branch/PR run** covers the journeys its user-visible diff touches plus one adjacent canary — no user-visible change, report that and stop. A **release/full run** covers the journeys the cycle plan marked in scope.
- Preconditions, in order:
  ```bash
  npm run build:schemas                    # ALWAYS first — everything types against @repo/schemas dist/
  node scripts/guardrails/pre-push.mjs     # the gate; a precondition, not a QA step
  bash db-manage.sh start && bash db-manage.sh seed-all
  npm run dev:api    # http://localhost:3333
  npm run dev:web    # http://localhost:5173
  ```
  A red gate is fixed or escalated before any session starts. The product must be reachable with real auth against the real API — no MSW, no stubbed search. Not reachable → name the exact gap and stop.
- **Done when:** scope is fixed and every precondition is met or its gap is surfaced.

**Step 2 — Build the matrix and create the report now**
- Read `references/status-and-reporting.md` — it owns the six-value status enum and the report lifecycle.
- Assemble the session matrix from the planned charters: persona × journey × tour × theme × time-box, ordered by risk. A charter missing for an in-scope journey is drafted per `../qa-report/references/session-charters.md` before running — never walk unplanned.
- Create `<qa-docs-path>/reports/<YYYY-MM-DD>-<scope>.md` from the report template (project copy at `<qa-docs-path>/templates/report.md`, else `assets/report-template.md`) **before the first session**, with every matrix row `Pending`. This on-disk report is the source of truth for resume — update it after every session and every fix, never only at the end.
- **Done when:** the report exists on disk carrying the full matrix, every row `Pending`.

**Step 3 — Walk each journey in persona**
- Read `references/session-protocol.md` (the enter→act→verify→capture loop, the evidence standard, the browser and MCP command surfaces) and `references/persona-fidelity.md` (the public-interface guardrails and stall-is-a-finding). Load the **`visual-check`** skill — it owns how the browser is driven here.
- For each charter, in matrix order: adopt the persona (device, network, theme), enter through its real entry point, and walk the journey verb by verb to its **true end state** — verifying each step against the evidence standard.
- The **coding-agent persona walks through MCP**, not the browser: the `crafthub` MCP tools (`get_disclosure_policy`, `get_work_context`, `create_post`, `create_commit_summary_post`, `update_post`, `list_my_posts`, `delete_post`) are its only interface, exactly as a real agent has them. Its true end state is always what the *human* sees in `/dashboard/posts/review` and on the public profile.
- Hunt **paper cuts** throughout: persona-felt friction no functional check fails; sharp ones become findings.
- A leg only a human can complete (real Google OAuth against a live account, a real GitHub App install, a funded `OPENAI_API_KEY` import) is marked `Blocked (needs human verify)` with exact instructions — never faked.
- **Done when:** every charter is walked to a recorded verdict in both themes where a browser is involved, evidence captured at checkpoints and divergences, the debrief written to the report's Session Debriefs section, and the matrix row updated.

**Step 4 — Run each tour and edge probe**
- Read `references/tours.md` (the tour catalog and surface-to-tour matrix) and `references/edge-cases.md` (the non-technical user edge cases, including the disclosure-leak section).
- Run each charter's single **tour** against its surface, in persona, inside the box, asking at each action: *"would this matter for this tour's theme?"*
- Pick 5-10 edge cases matching the surface and persona and attempt them; attempted-and-clean is evidence too. Any charter touching posts, the agent surface, or settings **must** draw at least two from the disclosure section.
- **Done when:** every charter's tour is run and its chosen edge cases are attempted and recorded.

**Step 5 — Experiential lens pass**
- Read `references/lenses.md` — the seven lenses and their severity defaults.
- Pick the 2 journeys covering the largest changed surface and re-walk them holding the lenses in a 45-minute box, recording `pass` / `friction` / `fail` per lens.
- **Done when:** both journeys are re-walked and every lens verdict is recorded, including the disclosure lens whenever an agent-authored surface was in scope.

**Step 6 — File findings into the registry**
- Read `../qa-report/references/bug-registry.md` — it owns ids, dedup, the impact rubric, the GitHub link and the root-cause taxonomy.
- Dedup first: search `bugs/` and the affected scenarios' `bug_ids`. Re-found → append `## Re-found`; regressed → reopen with `## Regressed`; only a genuinely new symptom mints a new `BUG-<YYYYMMDD>-<slug>` id.
- File with the user first — impact tier, persona, journey step, reproduction from the persona's entry point, evidence paths — then link the id into the affected scenario files.
- **Done when:** every finding is deduped, filed, and linked to its rows.

**Step 7 — Fix loop (governed)**
- Read `references/fix-loop.md` — the **governor**, the regression-test-per-fix rule, and Decisions for a Human.
- Judge each fix against the governor **before editing**: only what passes all its bounds is auto-fixed. Everything else goes to the report's **Decisions for a Human** with options and a recommendation.
- **Red test first, always.** Every auto-fix starts with a **vitest** test that reproduces the finding, is run, and is **seen failing for the right reason** — then the fix, then green. Tests are vitest everywhere (`describe/it/expect` from `vitest`); there is no jest in this repo. Place it beside the code it protects (`references/fix-loop.md` owns the map) and, for anything crossing the API boundary, assert a **real captured payload** through its `@repo/schemas` zod schema — that contract test is the strongest sensor here. The **`testing-boss`** skill owns how to write it; **`no-workarounds`** owns fixing the cause instead of the symptom.
- Re-walk each fix's impacted and adjacent journeys in persona before its row moves to `Fixed`.
- **Done when:** every finding is either fixed-with-a-red-test-turned-green-and-retested, or escalated with a recommendation, and no fix is left half-applied.

**Step 8 — Close the round**
- Re-read the round-close checklist in `references/status-and-reporting.md`; map matrix verdicts to tracker enums per `../qa-report/references/state-schema.md`.
- **Exit gate:**
  ```bash
  npm run build:schemas
  node scripts/guardrails/pre-push.mjs
  ```
  Run it once, after the fixes, and record the output verbatim. A green matrix over a red gate is not ready, and Final Status must say so.
- Record the **Root Cause** for every bug closed this round (taxonomy in `../qa-report/references/bug-registry.md`) and mirror it into its GitHub issue before closing it.
- **Done when:** zero matrix rows are `Pending`, scenario-file verdicts and bug statuses are current, every closed bug carries a root cause, every session's debrief is in the report, and the report's Final Status states release readiness with totals by impact tier — backed by fresh evidence from the current build and a recorded gate result.

## Companion skills

- **qa-report** — plans what this skill runs and owns the tree's schemas (tracker, bug registry, charters, personas, journeys). Results written here feed the next cycle's planning.
- **visual-check** — the browser driver for Steps 3-5: scenario scripts via `node scripts/visual/run.mjs` against `npm run dev:web` (http://localhost:5173), screenshots, console and network gating, both themes. It owns the driving conventions, the scenario helper surface (`goto` `shot` `mock` `assert` `resize`), and `DESIGN.md` as the visual authority; this skill's `references/session-protocol.md` maps the QA loop onto it.
- **testing-boss** — how to write the regression test every Step 7 fix ships: placement, real fixtures, the red-first loop.
- **no-workarounds** — how to fix: root cause, not symptom; the seven signals and what blocks each one here.
- **diagnose** — the reproduce → minimise → hypothesise → instrument loop when a finding's cause is not obvious from the walk.
- **The guardrail scripts, not a skill** — `node scripts/guardrails/pre-push.mjs` (the gate), `node scripts/guardrails/lint-changed.mjs` (eslint on changed files, ratcheted against a 30-error backlog), `npm run check-types`, `npm run test:coverage` (ratchet floors, target 70). A session that uncovers one of those files the finding and names the gate; it does not pivot mid-session.

## Error handling

- **Dev servers or browser tooling unavailable:** if `npm run dev:web` will not serve http://localhost:5173, the API is not up on 3333, or the visual runner cannot launch a browser, mark the browser legs `Blocked (needs human verify)` with the exact missing prerequisite, say plainly which screens were **not** visually verified, and continue with MCP/HTTP journeys still walkable in persona. Never skip the browser silently.
- **Database or seed data missing:** `bash db-manage.sh status` first; a stack that is down makes `pgvector` search and the API e2e legs hang rather than fail. Bring it up and re-seed (`seed-all`) or mark those sessions blocked with the exact prerequisite.
- **A flow hangs:** close the session, record it, retry once from a clean session, then mark it blocked. A stall is a finding to file, never a thing to nudge past (`references/persona-fidelity.md`).
- **An import or a search needs a funded `OPENAI_API_KEY`:** those legs (resume PDF parsing, embedding-backed search) are `Blocked (needs human verify)` when no key is available — say so rather than walking a degraded path and calling it a pass.
- **Matrix larger than the window:** cut by risk (disclosure leaks first, then Blocks-Completion candidates, then Data-Loss, then Trust-Damage), mark the cut rows `Skipped` with reasoning, and disclose it in Final Status — coverage shrinks visibly or not at all.
