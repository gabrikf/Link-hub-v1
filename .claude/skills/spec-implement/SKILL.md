---
name: spec-implement
description: Use when IMPLEMENTING a CraftHub spec produced by #spec-writer. Reads the spec in docs/specs/[feature]/, plans the execution (sequential, or parallel via worktrees/subagents), implements task by task with continuous harness verification against this repo's real commands (build:schemas, check-types, lint-changed, vitest, visual scenarios), and delivers code ready for a GitHub PR. Supports --all-default.
---

## Spec Implement — From Spec to Finished Code

This skill **implements** a spec produced by `#spec-writer`. The goal: read the spec plus its harness, plan the most efficient execution strategy (speed and safety), execute task by task with continuous verification, and deliver code ready for a pull request.

**Principles:**
- **The spec is the source of truth** — implement exactly what is specified, nothing more
- **The harness is the guardrail** — verify after every task, never advance on a failure
- **Pixel-perfect** — UI faithful to the design, expressed in Tailwind 4 and the `DESIGN.md` language
- **Reuse** — use the existing `shared-components/` and `@repo/schemas` modules; create new only when genuinely needed and reusable
- **Safe speed** — parallelise when possible, never at the cost of quality

Follow the phases below strictly.

---

### `--all-default` mode

If the user types `--all-default` at any point, ask:

> Are you sure you want to enter all-default mode?

If confirmed, keep it until the end. In this mode:
- **Ask no questions** — run every phase automatically.
- Always take the documented default; where there is none, take the most efficient option.
- Report every step (action + decision) without waiting for a reply.
- Use the **sequential, single-branch** strategy (the safest for all-default).

**`--all-default` cannot skip the G0 gate.** If G0 blocks, the run stops and reports; it does not proceed on an assumption.

---

### Phase 0: Loading the Spec

Ask (if not supplied):

> Which spec should I implement?
> - **1** — list the specs available under `docs/specs/`
> - Or give the path: `docs/specs/[feature-name]/`

#### 0.1: Full read

Read **every** artefact of the spec:

1. `docs/specs/[feature]/SPEC.md` — the main spec
2. `docs/specs/[feature]/definitions.md` — entities, states, business rules, copy
3. `docs/specs/[feature]/contracts/` — zod schemas + fixtures (check `Provenance`/`Status` on each)
4. `docs/specs/[feature]/variants.md` — the variant/mode matrix (if the feature renders a discriminated set)
5. `docs/specs/[feature]/tasks.md` — the tasks
6. `docs/specs/[feature]/harness.md` — the verification harness
7. `docs/specs/[feature]/decisions.md` — decisions taken, and any already marked SUPERSEDED
8. `docs/specs/[feature]/design/` — visual references
9. `docs/specs/[feature]/refs/` — the dev's original inputs (product specs, designs, API contracts).
   **Check the contract lifecycle in `refs/api/`:** if only `<endpoint>.draft.md` (mutable) exists,
   the schemas in `contracts/` derive from it and stay `Status: PENDING`. If an
   `<endpoint>.final.md` (validated/tested) exists, **diff it against the draft and apply the
   delta to the schemas before starting** — record the delta as a table
   (field → before → after → tasks affected). Reconciling two contract versions by hand,
   later, without that table, is how a small API change becomes a day of rework.

#### 0.2: Spec validation

Before implementing, verify the spec is complete:

- [ ] Every file exists
- [ ] SPEC.md has clear acceptance criteria
- [ ] tasks.md has a "done" criterion per task
- [ ] harness.md has both feedforward and feedback checks
- [ ] The design is available (in `design/` or linked)
- [ ] If the feature renders a discriminated set → `variants.md` exists and covers every enum member
- [ ] Every contract in `contracts/` has a `Provenance`/`Status` header; every `Status: PENDING` has a validation task in `tasks.md`
- [ ] Every task that builds a form carries its **field table** (field → schema key → payload path → tab/mode). A form task without one is incomplete — go back to `#spec-writer` rather than guessing the fields.
- [ ] `tasks.md` opens with a **G0 task** for every endpoint claimed to exist

If something is missing, tell the dev and ask whether to proceed or complete the spec first.

---

### Phase 1: Execution Planning

Analyse the tasks and choose the **execution strategy**. See [references/execution-strategy.md](references/execution-strategy.md) for the detailed criteria.

#### 1.1: Dependency analysis

Read `tasks.md` and identify:
- **Root tasks** — no dependencies (can start immediately, after G0)
- **Sequential tasks** — depend on earlier ones
- **Parallelisable tasks** — independent of each other (disjoint files)
- **Shared-file tasks** — touch `router.tsx`, `packages/schemas/`, `container.ts` (conflict-prone)

#### 1.2: Strategy choice

| Scenario | Strategy | Rationale |
|---------|-----------|---------------|
| ≤5 tasks, small feature | **Sequential, single branch** | Least overhead, most control |
| 6-10 tasks, independent groups | **Sequential, single branch, grouped commits** | Commits organised by group |
| >10 tasks, 3+ independent groups | **Parallel worktrees** | Maximum speed with isolation |
| Complex coordination | **Subagents (max 3)** | Delegation with isolation |

**Default:** for most features here, **sequential on a single branch** is the most efficient — it avoids merge/rebase overhead, keeps context, and the harness runs directly.

**Parallel worktrees** only when:
- There are 3+ task groups with zero shared files
- The feature is large (>10 tasks)
- The dev confirmed they want parallelism

#### 1.3: Present the plan

> **Execution plan — [feature-name]**
>
> **Strategy:** [sequential | parallel-worktrees | subagents]
> **Branch:** `feat/[feature-name]` from `main`
> **Tasks:** N total, M groups
> **G0:** [endpoints to probe, or "n/a — contracts inferred"]
>
> **Order:**
> 1. G0: endpoint liveness probe (blocking)
> 2. [Group 1]: Task 1, 2 (contract + hooks)
> 3. [Group 2]: Task 3, 4, 5 (UI)
> 4. [Group 3]: Task 6 (tests)
>
> **Planned commits:**
> - `feat: add [resource] schema and contract test`
> - `feat: add [resource] query hook`
> - `feat: add [feature] page and route`
> - `feat: add [feature] form`
> - `test: cover [feature] business rules and variants`
>
> Approve and start?
> - **1** — yes, implement
> - **2** — adjust (say what)
> - **3** — use parallel worktrees (if applicable)

---

### Phase 2: Setup

After approval:

#### 2.1: Branch

```bash
git checkout main
git pull
git checkout -b feat/[feature-name]
```

If the dev names a different base branch or branch name, adjust. Confirm the remote with `git remote -v` rather than assuming.

#### 2.2: Build the contract package first

```bash
npm run build:schemas
```

Everything types against `packages/schemas/dist/`. Skipping this makes `check-types` fail on a fresh tree for reasons that have nothing to do with your code, and you will chase a ghost.

#### 2.3: Bring up what the feature needs

```bash
bash db-manage.sh start          # Postgres 5432 + Redis 6379, if the feature touches data
npm run dev:api                  # http://localhost:3333  (Swagger /docs, health /health)
npm run dev:web                  # http://localhost:5173
node scripts/visual/session.mjs login   # seed an authed storageState for the visual runner
```

Seed users if you need them: `bash db-manage.sh seed-all` — recruiter `recruiter.seed@crafthub.local`, candidates `seed-<blueprint-slug>-<NN>` (e.g. `seed-react-frontend-003`), password `12345678` for all. Public profile: `/profile/seed-react-frontend-003`.

#### 2.4: G0 — the blocking liveness probe

**Run this before writing a single line of UI against any endpoint someone claims already exists.** Do not skip it because the route "obviously" works. Two traps make a dead route look alive here:

- **Dual registration.** Every module in `apps/api` is registered **twice** — at the bare path and under `/api/v1`. A route can be live at one and 404 at the other.
- **The dev-server proxy.** A request routed through the web dev server at `http://localhost:5173` can come back as the SPA's `index.html` with HTTP 200. **A 200 is not proof of an endpoint.** Probe port 3333 directly.

```bash
# 0. Is the API up at all?
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3333/health

# 1. What does Swagger actually declare? (the authoritative route list)
curl -sS http://localhost:3333/docs/json | jq -r '.paths | keys[]' | grep -i '<resource>'

# 2. Probe BOTH registrations and demand real JSON
for base in "http://localhost:3333" "http://localhost:3333/api/v1"; do
  echo "--- $base/<resource>"
  curl -sS -D- -o /tmp/probe-body.json \
       -H 'Accept: application/json' \
       -H "Authorization: Bearer $TOKEN" \
       "$base/<resource>" \
    | grep -iE '^(HTTP/|content-type:)'
  jq -e . /tmp/probe-body.json >/dev/null \
    && echo "OK: body is valid JSON" \
    || echo "BLOCKED: body is not JSON — this route is not live"
done

# 3. Freeze the real payload as the fixture
cp /tmp/probe-body.json docs/specs/[feature]/contracts/fixtures/<endpoint>.example.json
```

**Pass** requires all four: 2xx status, `content-type: application/json`, a body that parses as JSON, and a body the schema in `contracts/` accepts.

**On failure, BLOCK.** Do not start any dependent UI task. Report which of the four demands failed and on which registration, then either:
- the route is genuinely not live → flip that contract to `Provenance: INFERRED / Status: PENDING`, drive the hook from the mock, and add the validation task; or
- the route is live on the other registration → correct the spec's §6.2 table and proceed.

An endpoint with an **INFERRED** contract does not block: it follows the mock flow, and the probe runs when the route ships.

#### 2.5: Internalise the feedforward

Before writing code, internalise the harness feedforward:

1. FF-01 (mandatory context) — confirm you read all of it
2. FF-02 (explicit rules) — follow throughout
3. FF-03 (component map) — the reference for every element
4. FF-04 (code examples) — follow the existing patterns
5. FF-05 (scope boundary) — never exceed it
6. FF-06 (anti-patterns) — know what not to write

Read `DESIGN.md` at the repo root for the design language, and `apps/web/src/shared-components/surface.ts` for the `SURFACE*` constants.

**The visual gate runs during implementation, not at the end.** Every UI task ends with its scenario run, screenshots compared to the design, console clean and network clean.

---

### Phase 3: Implementation (per-task loop)

For each task, run the cycle:

```
┌─── READ (task + design) ───┐
│                             │
│   IMPLEMENT (code)          │
│                             │
│   VERIFY (harness FB-01)    │
│         ↓                   │
│   PASS? ── yes ──→ COMMIT   │
│     │                       │
│    no ──→ FIX ──→ VERIFY    │
│              ↑        │     │
│              └── no ──┘     │
└─────────────────────────────┘
```

#### 3.1: Read (start of each task)

1. Read the task in `tasks.md` — scope, files, done criterion
2. Consult the relevant design in `design/`
3. Check the component map (harness FF-03)
4. If the task builds a form, **read its field table** — it is the contract for what must be mounted
5. Find comparable code already in the repo to follow

#### 3.2: Implement

Implement strictly according to:
- **`AGENTS.md`** (root, plus the per-workspace files) — structure, naming, conventions
- **The component map** — `shared-components/` and the Radix primitives first
- **`DESIGN.md`** — violet/zinc palette, `SURFACE*` constants, button hierarchy, focus rings. Zero hardcoded hex.
- **Repo patterns** — follow existing hooks, schemas and use cases
- **Context7** — consult it for external libraries (TanStack Query/Router, zod, react-hook-form, Drizzle, Fastify) to use current APIs

**Implementation rules:**
- One file at a time — write it complete, not partial
- Types first — always type before use; `z.infer`, never a parallel hand-written interface
- Hooks separated — logic never inside JSX
- Focused components — one component, one responsibility
- Typed props — an exported type per component
- **No i18n.** User-visible strings are hardcoded English, matching the copy table in `definitions.md`. The `i18n` skill documents the future plan — **do not invent `t()` calls** or a locale file.
- **Mock flow** — where the spec marks an endpoint as not live, drive the hook from a local mock (an MSW handler or a typed stub in the feature's `lib/`), seeded from the "full" fixture. Check what neighbouring features already do before introducing a new mocking mechanism. Never silently skip an unready endpoint — mock it so the UI works end to end.
- **Never edit `packages/schemas/src/**` or `apps/*/src/**` outside the files the task names.** If a task needs a file it does not list, stop and say so.
- Do not touch the known, deliberate debt: `packages/ui` (dead scaffolding), the pre-existing eslint backlog, `apps/mcp` having no tests, `eslint-plugin-only-warn`, the `pluguins/` typo directory.

#### 3.3: Verify (after every task)

Run the harness feedback checks (**Level 1 — mandatory after EVERY task**):

```bash
npm run build:schemas                       # always first
npm run check-types                         # the real CI gate
node scripts/guardrails/lint-changed.mjs    # ratchet: fails on NEW findings only
npx vitest related <changed-file> --run     # only the suites touching what you changed
```

**On failure:**
1. Identify the error
2. Fix it (without changing scope)
3. Re-verify
4. Repeat until green — **max 3 cycles**, then stop and escalate with a diagnosis

**Feature sensors, also per task where they apply:**

- **Contract sensor** — `.parse()` the **REAL captured payload** from `contracts/fixtures/` through the schema in `packages/schemas/src/<module>/`. A fixture you hand-wrote agrees with the code you hand-wrote; it proves nothing.
- **Schema ⟷ UI sensor, per applicable mode/tab** — two halves, both required:
  1. the real payload parses through the zod schema;
  2. a UI test renders the component from **that same parsed fixture**, not a separate hand-written object.

  Plus the field-coverage assertion: **every required field of the schema has a mounted input in every mode/tab where it applies**, per the task's field table. A required field with no input in the mode that requires it is a dead Save button by construction — the form can never validate, and clicking around will not tell you which field is missing.
- **Variant matrix** — a table-driven test over every row of `variants.md`, plus the unknown-variant case (renders an "unsupported" notice, never a crash, never a blank screen).
- **Write-landed check for mutations** — after an action that writes, query the target table through **postgres-mcp** (restricted, pointed only at the local dev database) by a correlation id from the response, and assert the row landed with the expected values. A 200 is not proof of persistence.

**Visual verification (mandatory when the task produces UI) — per delivery, script-first:**

1. Keep **one scenario for the feature** at `scripts/visual/scenarios/[feature].scenario.mjs` and add this task's states to it: loading, empty, error, filled, each variant, each mode/tab from `variants.md`, modal/drawer open, and both colour schemes if the surface constants are involved
2. Run it in one command:
   `node scripts/visual/run.mjs scripts/visual/scenarios/[feature].scenario.mjs`
   (one browser launch, one authed session, every state in sequence)
3. Compare each screenshot against the design in `design/` and the FB-02 checklist — layout, spacing, typography, colour tokens, components, states, focus rings, dark mode
4. Read the console + network gate the run prints: zero React errors/warnings, zero unexpected 4xx/5xx, no request loops
5. List each difference concretely ("title is 24px in the design, renders at 16px"), fix the cause, and **re-run the scenario** until the list is empty
6. Driving a browser step by step is only the exploration fallback (when the next action depends on seeing the previous result) — never the default driver

Never call a UI task done without having looked at the screenshot. `check-types` and green tests do not prove the screen is right — a blank screen and clipped text pass both.

#### 3.4: Commit (after a task verifies)

```bash
git add [the task's files]
git commit -m "[type]: [description]"
```

Conventional Commits, in **English** (the whole repo is English). Let the pre-push/Stop-hook gate run — `node scripts/guardrails/pre-push.mjs` is the same script husky runs. `--no-verify` only when the hook fails for something **demonstrably unrelated** to the task (and say so in chat); never as a default.

Commit types by task:
- Contract/schema → `feat: add [resource] schema`
- Hook/API → `feat: add [resource] query hook`
- UI → `feat: add [component/screen]`
- Form → `feat: add [action] form`
- Tests → `test: cover [feature]`

#### 3.5: Next task

After the commit, move to the next task in the `tasks.md` order.

If context is getting large (>10 tasks implemented), tell the dev a fresh session may be needed to continue — the spec folder is what makes that safe.

---

### Phase 4: Convergence

After implementing ALL tasks, run the final verification.

#### 4.1: The one-shot gate

```bash
node scripts/guardrails/pre-push.mjs
```

This is the gate — the same script husky's pre-push hook and the Claude Code Stop hook run. If you want the individual sensors:

```bash
npm run build:schemas
npm run check-types
node scripts/guardrails/lint-changed.mjs
npm run test --workspace=web
npm run test --workspace=api          # 3 files need docker Postgres up
npm run test --workspace=@repo/schemas
npm run test:coverage                 # ratchet — floors may only go UP
```

**Note on the suites that need real infrastructure** — they hang for 60-90s rather than failing fast when it is missing, so bring it up or expect the wait:
- Need docker Postgres/pgvector (`bash db-manage.sh start`):
  `apps/api/src/infra/di/container-wiring.test.ts`,
  `apps/api/src/infra/database/drizzle/search-indexes.e2e.test.ts`,
  `apps/api/src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts`
- Need a funded `OPENAI_API_KEY` (excluded from CI by name):
  `apps/api/src/infra/http/controllers/resume/test/search.e2e.test.ts`,
  `apps/api/src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts`,
  `apps/api/src/infra/database/drizzle/search-indexes.e2e.test.ts`

#### 4.2: Acceptance criteria

Check every acceptance criterion in SPEC.md §3 against the implementation:

- Re-read each FR-XX and its EARS criteria
- Confirm the code implements each "WHEN...THEN...SHALL"
- Anything missing → implement it as an additional task

#### 4.3: Visual diff (browser)

A final pass with the whole feature assembled:

1. Walk the **complete flow** in the browser (not isolated screens): arrive, filter, open the modal/drawer, submit, see the result
2. Run the full feature scenario:
   `node scripts/visual/run.mjs scripts/visual/scenarios/[feature].scenario.mjs`
   covering every screen in all four states, every mode/tab, and both colour schemes
3. Compare against the design and the FB-02 checklist
4. Console and network clean across the entire flow
5. Fix discrepancies and re-capture

#### 4.3.1: Shared-code impact check

If the feature changed anything in `apps/web/src/shared-components/`, `apps/web/src/lib/`, `packages/schemas/src/`, or `apps/api/src/infra/di/container.ts`, do this before closing:

1. Map the consumers (grep the import). **`packages/schemas` is consumed by api, web, mcp, extractor and training** — a change there reaches all five.
2. Group them by **usage shape** (distinct combination of props/variants)
3. Assess the blast radius of each change (new required prop, changed default, DOM/class changes, hook return shape, event signature, removed prop/export, a schema field made stricter)
4. Fix the broken consumers **in this same PR** — or preserve compatibility with an opt-in prop whose default keeps current behaviour
5. Screenshot one screen per usage shape, before × after: a shape that should not have changed and did is a regression — fix it now
6. Hand the dev **one screen per usage shape** (route + how to get there + props exercised + what to look at) — never the full list of screens sharing the same props

#### 4.4: Copy check

There is no i18n and no locale parity to verify. `node scripts/guardrails/i18n-parity.mjs` exists but is a **no-op until locales exist** — running it proves nothing today.

Check instead:
- Every user-visible string matches the copy table in `definitions.md`
- No invented `t()` calls, no new locale file, no translation helper
- No leftover placeholder or lorem text
- No raw enum value or id leaking where a human-readable label belongs

#### 4.5: Variant verification (if the feature renders a discriminated set)

1. Run the table-driven test over `variants.md`
2. Check against the matrix: every variant marked "appears on this screen" has a green test
3. Explicitly test the **unknown** variant → shows "unsupported", never crashes, never blanks
4. **Report the matrix** as `variant × (parse | render | submit)` — and **refuse the delivery** if an affected variant was not covered

#### 4.6: Resilience verification (every new screen)

1. A test that forces a `throw` in the component → the error boundary fallback appears, `body` is not empty
2. A test with the API returning 500 → the error state with a retry affordance
3. A test with the API returning an empty list → the empty state
4. A test with a payload that does not match the schema → it does not crash; the drift is reported and the screen stays up

#### 4.7: Final checklist — before opening the PR

- [ ] `node scripts/guardrails/pre-push.mjs` — green
- [ ] `npm run build:schemas && npm run check-types` — zero errors
- [ ] `node scripts/guardrails/lint-changed.mjs` — zero NEW findings (the backlog is not yours)
- [ ] `npm run test:coverage` — no package below its ratchet floor
- [ ] G0 passed for every endpoint claimed to exist, with a real payload frozen in `contracts/fixtures/`
- [ ] Contract sensor green: the REAL captured payload parses through `@repo/schemas`
- [ ] Schema ⟷ UI sensor green per applicable mode/tab; every required field has a mounted input
- [ ] Variant matrix green and reported, including the unknown case
- [ ] Resilience tests green
- [ ] Visual scenario green: every screen × every state, no open diff
- [ ] Console clean, network free of unexpected 4xx/5xx across the full flow
- [ ] Shared code: consumers mapped, fixed and tested (§4.3.1)
- [ ] Every business rule in `definitions.md` has a test
- [ ] Inferred contracts still marked `Status: PENDING`, with their validation task open
- [ ] Copy matches `definitions.md`; no invented `t()`
- [ ] `git diff` reviewed line by line for `any`, `catch {}`, hardcoded hex, and unparsed API responses

---

### Phase 5: Wrap-up

#### 5.1: Update the spec status

Edit `docs/specs/[feature]/SPEC.md` — change the status from "Ready" to "Done".

Generate/update `docs/specs/[feature]/IMPLEMENTATION-STATUS.md`: what was implemented per delivery/group, what is still pending (and why), and every decision from `decisions.md` that reality contradicted — **re-stamped as SUPERSEDED with a one-line reason**, never edited away or deleted.

This file is what makes it safe to pick the feature back up in a fresh session. Without it, the next session has the code but not the reasoning, and re-derives the same wrong turns.

```markdown
# Implementation Status — [feature]

## Delivered
| Group | Tasks | Commit(s) | Verified by |
|---|---|---|---|

## Pending
| Item | Why | Blocking? |
|---|---|---|

## Superseded decisions
| ID | Original decision | What reality showed |
|---|---|---|
```

#### 5.2: Present the result

> **Implementation complete — [feature-name]**
>
> **Harness:**
> - `pre-push.mjs` — green
> - `check-types` — zero errors
> - Tests — [N] passing ([M] new)
> - `lint-changed` — zero new findings
> - Coverage ratchet — no package below its floor
> - G0 — [endpoints probed, real payloads frozen | n/a, contracts inferred]
> - Contract sensor — real payload parses through `@repo/schemas`
> - Schema ⟷ UI — [N] modes/tabs verified, every required field mounted
> - Visual scenario — [N] screens × [M] states, no open diff
> - Console and network — clean
> - Acceptance criteria — all verified
>
> **Commits:** [N] on branch `feat/[feature-name]`
>
> **Files created/modified:**
> - [list]
>
> **How to test:**
> - `bash db-manage.sh start && npm run dev:api && npm run dev:web`
> - [http://localhost:5173/[route]](http://localhost:5173/[route])
> - Sign in as `recruiter.seed@crafthub.local` / `12345678` (or a `seed-*` candidate)
> - Actions to try: [list]
>
> **Screens you need to check** (one per usage shape — only if shared code changed):
>
> | Screen | Route | Shape (props) | What to look at |
> |---|---|---|---|
>
> **Next:**
> - **1** — push and open the PR
> - **2** — review before finalising
> - **3** — implement adjustments

#### 5.3: Push and PR

If the dev picks option 1:

```bash
git push -u origin feat/[feature-name]
gh pr create --base main --fill
```

Confirm the remote with `git remote -v` rather than hardcoding it. The commits are already made; this step only pushes and opens the PR. Link the spec in the PR body: `docs/specs/[feature]/SPEC.md`.

---

### Phase 6: Post-implementation adjustments (manual-test findings)

The spec folder is the feature's **persistent context** — it is what makes continuing in a new session safe. When the dev finds bugs, inconsistencies or needed changes while manually testing the branch:

1. **Record the findings** in `docs/specs/[feature]/qa-findings.md` — one item per finding:
   route, steps, expected × observed, screenshot if there is one.
2. **Open a NEW session on the same branch** — do not stretch the implementation session. The
   new session loads: `SPEC.md` + `decisions.md` + `IMPLEMENTATION-STATUS.md` +
   `qa-findings.md`. That is enough context; the rest is in the code and in git.
3. **A real defect** (behaviour wrong versus the spec) → failing test first, then root cause,
   never a workaround.
4. **An adjustment or scope change** (not a bug — a new decision) → a new task in `tasks.md`
   plus a decision recorded in `decisions.md`, implemented through the Phase 3 loop.
5. **Closing the cycle:** update `IMPLEMENTATION-STATUS.md`, mark the findings resolved in
   `qa-findings.md`, and re-stamp as **SUPERSEDED** any decision reality contradicted.

`qa-findings.md` template:

```markdown
# QA Findings — [feature]

## F-01: [short title]
- **Route:** /[route]
- **Steps:** 1. ... 2. ... 3. ...
- **Expected:** ...
- **Observed:** ...
- **Evidence:** [screenshot path / console output]
- **Type:** defect | adjustment
- **Status:** open | fixed (commit [sha]) | won't fix (reason)
```

---

### Strategy: Parallel Worktrees (when applicable)

If Phase 1 selected the parallel strategy:

#### Worktree setup

```bash
git worktree add ../crafthub-wt-1 -b feat/[feature]-group-1
git worktree add ../crafthub-wt-2 -b feat/[feature]-group-2
```

Each worktree needs its own `npm install` and its own `npm run build:schemas` — the workspace symlinks and the built `dist/` do not carry across.

#### Parallel execution

- Dispatch **subagents** (max 3), each in its own worktree
- Each subagent implements one group of tasks
- Each worktree runs its own dev servers on distinct ports

| Group | Worktree | Web port | API port | Branch |
|-------|----------|-------|--------|--------|
| 1 | `../crafthub-wt-1` | 5174 | 3334 | `feat/[feature]-group-1` |
| 2 | `../crafthub-wt-2` | 5175 | 3335 | `feat/[feature]-group-2` |
| main | repo root | 5173 | 3333 | `feat/[feature]` (integration) |

Only one worktree at a time may hold the shared local Postgres/Redis. Groups that need the database must either be serialised or given their own database.

#### Sequential merge

1. Merge group 1 → the feature's main branch
2. Resolve conflicts (if any)
3. Merge group 2 → the feature's main branch
4. Resolve conflicts (if any)
5. Run the full harness on the integrated branch
6. Clean up the worktrees

**Rule:** merge always sequentially, never in parallel. Resolve conflicts one group at a time.

#### Cleanup

```bash
git worktree remove ../crafthub-wt-1
git worktree remove ../crafthub-wt-2
```

---

### Rule: Pixel-Perfect

The supplied design is the visual reference. The implementation should be as faithful as possible:

1. **Spacing** — the Tailwind scale
2. **Colours** — the `DESIGN.md` violet/zinc tokens and the `SURFACE*` constants from `surface.ts`; never a hardcoded hex
3. **Typography** — the Tailwind scale, weights per `DESIGN.md`
4. **Icons** — `react-icons`, the Feather `fi` set
5. **Components** — `shared-components/` and the Radix primitives first; raw HTML only when no equivalent exists
6. **Dark mode** — real, and carried by the surface constants; check both schemes
7. **Focus rings** — per `DESIGN.md`, on every interactive element

If the design needs something the primitives cannot do → build a reusable component with Tailwind, following `DESIGN.md`.

**Pixel-perfect is proved by a screenshot, not by reading code.** Every fidelity claim must come from a scenario screenshot compared against the design. Without that, it is a guess.

---

### Rule: Implement Only the New Feature

The design often shows the **whole application shell** — top bar, nav, layout wrapper, and other components that **already exist**.

**Do not touch existing components.** Implement only what is new:
- Design shows the top bar (`top-bar-nav.tsx`) → it already exists, ignore it
- Design shows the dashboard layout wrapper → already exists, ignore it
- Design shows avatar/button/input primitives → already in `shared-components/`, reuse, do not restyle

**Focus exclusively** on the new content inside the page's main content area.

**Pixel-perfect applies ONLY to the new feature** — the rest is visual context for position and proportion.

If a shared component genuinely must change, the spec must say so, and §4.3.1 applies.

---

### Rule: English Everywhere

Every file, variable, component, hook, type and test name is in English. User-visible copy is English too — there is no i18n layer. File naming is `kebab-case` throughout. Commit messages follow Conventional Commits in English.

---

### Rule: Do Not Invent

- **Do not** add features that are not in the spec
- **Do not** create abstractions "for the future"
- **Do not** refactor existing code outside the scope
- **Do not** add error handling beyond what is specified
- **Do not** change existing repo patterns
- **Do not** fix the known, deliberate debt as a side quest

If something ought to exist but is not in the spec → stop and ask the dev.

---

### Rule: An Inferred Contract Is Always Marked

> **Never implement against an inferred contract without marking it.** If the API has not
> confirmed the shape, the schema stays in `contracts/` with `Status: PENDING`, the hook runs
> against a mock, and `tasks.md` carries an explicit validation task. Implementing against a
> silent assumption is how "it worked on my machine" bugs are born.

---

### Rule: Clickable Links

| Resource | Format |
|---------|---------|
| Spec | `[SPEC.md](docs/specs/[feature]/SPEC.md)` |
| GitHub issue/PR | `[#123](https://github.com/<owner>/<repo>/pull/123)` — read `git remote -v` |
| Swagger | `[/docs](http://localhost:3333/docs)` |
| Local screen | `[http://localhost:5173/route](http://localhost:5173/route)` |

---

### Quick reference

| Parameter | Value |
|-----------|-------|
| Input | `docs/specs/[feature-name]/` (from `#spec-writer`) |
| Branch pattern | `feat/[feature-name]` from `main` |
| Commits | Conventional Commits in English, one per task or group |
| Verification | The harness (`harness.md`) after every task |
| One-shot gate | `node scripts/guardrails/pre-push.mjs` |
| Contract package | `@repo/schemas` — build it first with `npm run build:schemas` |
| Design language | `DESIGN.md` + `apps/web/src/shared-components/surface.ts` |
| i18n | none — hardcoded English; see the `i18n` skill; do not invent `t()` |
| Visual gate | `node scripts/visual/run.mjs scripts/visual/scenarios/<name>.scenario.mjs` |
| API / Web | `http://localhost:3333` (`/docs`, `/health`) / `http://localhost:5173` |
| Delivery | `gh pr create --base main` |
| Max parallel worktrees | 3 |
| Max subagents | 3 |
