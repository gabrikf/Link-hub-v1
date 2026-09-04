# Execution Strategy

Internal reference for `#spec-implement` — how to orchestrate the implementation of a spec.

---

## Decision Principles

The ideal strategy is the **fastest** one that does not compromise **quality** or **merge safety**. Token cost matters too — coordination between agents is not free.

### Priority order:
1. **Quality** — never traded for speed
2. **Safety** — zero risk of an undetected merge conflict
3. **Speed** — parallelise once 1 and 2 are guaranteed
4. **Tokens** — minimise context and coordination overhead

**Ahead of all four: the G0 gate.** No strategy starts UI work against an endpoint that has not answered real JSON on `http://localhost:3333`. G0 is a root task in every plan, and parallelism begins after it.

---

## Quick Table (scenario → strategy)

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

---

## Available Strategies

### 1. Sequential — Single Branch (DEFAULT)

```
main ──┬── feat/feature-name ── [G0] ── [T1] ── [T2] ── ... ── [TN] ── PR
```

**When to use:**
- ≤10 tasks total
- Cohesive feature (tasks share context)
- Tasks share files (`router.tsx`, `packages/schemas/`, `container.ts`)
- `--all-default` is on
- First use of the skill (build confidence)

**Advantages:**
- Zero coordination overhead
- Full context available at every task
- No merge-conflict risk
- The harness runs directly
- Fewer tokens

**Disadvantages:**
- Linear speed (one task at a time)
- If context grows (>15 tasks), a fresh session is needed — the spec folder plus
  `IMPLEMENTATION-STATUS.md` is what makes that safe

**Commits:**
- One commit per task, or per logical group
- Conventional Commits in English
- Commits pass through the normal hook (`node scripts/guardrails/pre-push.mjs`); `--no-verify`
  only for a failure demonstrably unrelated to the task

**Example commit series:**
```
feat: add profile-block schema and contract test
feat: add profile-block query hook
feat: add block editor page and route
feat: add block config form
test: cover block variants and business rules
```

**Commit types by task:**

| Task produces | Commit type |
|---|---|
| Contract/schema | `feat: add [resource] schema` |
| Hook/API | `feat: add [resource] query hook` |
| UI | `feat: add [component/screen]` |
| Form | `feat: add [action] form` |
| Tests | `test: cover [feature]` |

---

### 2. Sequential — Single Branch, Grouped Commits

```
main ──┬── feat/feature-name ── [G0] ── [G1: T1+T2] ── [G2: T3+T4+T5] ── [G3: T6] ── PR
```

**When to use:**
- 6-12 tasks
- Tasks group naturally (contract, UI, polish)
- You want meaningful commits rather than one per task

**Advantages:**
- Each commit is a functional increment
- Easier to review in the PR
- Granular revert by capability, not by file

**Grouping rule:**
- A group is a set of tasks that together form a **verifiable increment**
- Each group must leave the app working (no half-done features)
- Max 3-4 tasks per commit
- **Each UI group closes with its visual scenario green** before the next group starts — the
  per-delivery visual gate is not a per-PR gate

---

### 3. Parallel Worktrees (for large features)

```
main ──┬── feat/feature ── [G0] ─────────────── [merge G1] ── [merge G2] ── PR
        │
        ├── feat/feature-g1 ── [T1] [T2] [T3] ─┘
        │
        └── feat/feature-g2 ── [T4] [T5] [T6] ─────────────┘
```

**When to use:**
- >10 tasks with clearly independent groups
- Groups with ZERO shared files
- The dev explicitly asked for parallelism
- Large feature, tight deadline

**NEVER use when:**
- Tasks share `apps/web/src/router.tsx` (routing is code-based — one hand-written file)
- Tasks both touch `packages/schemas/src/` (the contract package; five workspaces consume it)
- Tasks both touch `apps/api/src/infra/di/container.ts` (over 2,200 lines of registration)
- One task imports a type another task is still creating
- <6 tasks (overhead > benefit)

**Setup:**

```bash
# Integration branch
git checkout main && git pull
git checkout -b feat/feature-name

# Run G0 here, once, before branching out
# ... liveness probe ...

git worktree add ../crafthub-wt-g1 -b feat/feature-name-g1
git worktree add ../crafthub-wt-g2 -b feat/feature-name-g2
```

**Each worktree needs its own bootstrap** — npm workspace symlinks and the built `dist/` do not carry across:

```bash
npm install
npm run build:schemas
```

**Dev server ports:**

| Worktree | Branch | Web | API | Command |
|----------|--------|-------|-----|---------|
| main | feat/feature-name | 5173 | 3333 | `npm run dev:web` / `npm run dev:api` |
| Group 1 | feat/feature-name-g1 | 5174 | 3334 | pass the port explicitly |
| Group 2 | feat/feature-name-g2 | 5175 | 3335 | pass the port explicitly |

**Shared local infrastructure is not parallel.** There is one local Postgres (5432) and one Redis (6379), started by `bash db-manage.sh start`. Two worktrees running database-touching tests at once will interfere — and `db-manage.sh reset` in one wipes the other. Either serialise the groups that need the database, or give each its own database.

**Sequential merge (MANDATORY):**

```bash
git checkout feat/feature-name

git merge feat/feature-name-g1 --no-ff
# resolve conflicts if any
# run the harness

git merge feat/feature-name-g2 --no-ff
# resolve conflicts if any
# run the full harness: node scripts/guardrails/pre-push.mjs
```

**Cleanup:**

```bash
git worktree remove ../crafthub-wt-g1
git worktree remove ../crafthub-wt-g2
git branch -d feat/feature-name-g1
git branch -d feat/feature-name-g2
```

---

### 4. Subagents (in-session delegation)

```
[Coordinator]
     │
     ├── [Subagent 1] → task group 1 (worktree)
     ├── [Subagent 2] → task group 2 (worktree)
     └── [Verifier]   → runs the harness on the integration
```

**When to use:**
- Large feature with genuinely independent groups
- Combined with worktrees for isolation
- When the coordinator needs to keep the whole picture

**Limit:** max 3 concurrent subagents (quality degrades beyond that)

**Rules:**
- Each subagent receives: the full spec + its tasks + the harness
- Each subagent works in its own worktree
- The coordinator merges sequentially at the end
- The coordinator runs convergence (SKILL.md Phase 4)
- **G0 is run once by the coordinator, before dispatch** — never delegated per subagent, and
  never assumed

---

## Quick Decision Matrix

| Criterion | Sequential | Grouped | Worktrees | Subagents |
|----------|:----------:|:--------:|:---------:|:---------:|
| Tasks ≤5 | yes | — | — | — |
| Tasks 6-10 | yes | yes | — | — |
| Tasks >10 | — | yes | yes | yes |
| Shared files | yes | yes | no | no |
| Independent groups | yes | yes | yes | yes |
| Needs the local database | yes | yes | serialise | serialise |
| --all-default | yes | yes | — | — |
| Minimum overhead | yes | yes | — | — |
| Maximum speed | — | — | yes | yes |
| First use | yes | — | — | — |

---

## Detecting Conflicts Between Groups

Before choosing parallel worktrees, analyse each group's files.

### HIGH conflict risk (never split across parallel groups):
- `apps/web/src/router.tsx` — code-based routing, one hand-edited file
- `packages/schemas/src/**` — the contract package; api, web, mcp, extractor and training all consume it
- `apps/api/src/infra/di/container.ts` — the 2,200-line registration file
- `apps/web/src/shared-components/**` — shared primitives
- The single Zustand store in `apps/web`
- `package.json` / `package-lock.json` (if groups add different dependencies)
- Any database migration

### LOW risk (safe in parallel):
- Components inside `apps/web/src/features/[feature]/components/`
- Hooks inside `apps/web/src/features/[feature]/hooks/`
- Colocated tests inside the feature folder
- A single `apps/api/src/core/use-case/<name>-use-case/` folder (one use case, one folder)

### Golden rule:
If **any** file appears in more than one group → those groups cannot run in parallel. Move the task into whichever group runs first, or split the conflicting file into its own task executed before the parallel groups.

---

## When to Split Into Multiple PRs

Generally, **one feature = one PR**. Consider splitting when:

| Scenario | Approach |
|---------|-----------|
| Feature > 20 files | PR 1: contract + hooks + route. PR 2: UI + tests |
| Feature depends on an API route that is not live | PR 1: schema + hooks against the mock. PR 2: real integration once G0 passes |
| Feature has a reusable part | PR 1: the shared component. PR 2: the feature that uses it |
| The change touches `packages/schemas` | PR 1: the schema change plus every consumer it affects (api, web, mcp, extractor, training). PR 2: the feature |

**Default:** one PR for small and medium features. Split only when the PR would be too large to review (>500 diff lines) or there is a genuine temporal dependency.

---

## Decision Flow

```
Run G0 first — always.
│
How many tasks?
├── ≤5 → Sequential, single branch
├── 6-10 → Are there independent groups with zero file overlap?
│   ├── No → Sequential, grouped commits
│   └── Yes → Does the dev want parallelism?
│       ├── No → Sequential, grouped
│       └── Yes → Parallel worktrees (2 groups max)
└── >10 → Are there 3+ independent groups with zero overlap?
    ├── No → Sequential grouped + split into 2 PRs
    └── Yes → Parallel worktrees + subagents (max 3)
```
