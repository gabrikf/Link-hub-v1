# Templates

Internal reference for `#spec-implement` — the message and document templates
used across the phases. SKILL.md points here by name; fill the brackets in,
never invent a different shape on the spot.

---

## Execution Plan Message (Phase 1.3)

Presented after Phase 1 planning, before any code is written. Wait for the
dev's answer before proceeding — this is a hard stop, not a formality.

```markdown
**Execution plan — [feature-name]**

**Strategy:** [sequential | parallel-worktrees | subagents]
**Branch:** `feat/[feature-name]` from `main`
**Tasks:** N total, M groups
**G0:** [endpoints to probe, or "n/a — contracts inferred"]

**Order:**
1. G0: endpoint liveness probe (blocking)
2. [Group 1]: Task 1, 2 (contract + hooks)
3. [Group 2]: Task 3, 4, 5 (UI)
4. [Group 3]: Task 6 (tests)

**Planned commits:**
- `feat: add [resource] schema and contract test`
- `feat: add [resource] query hook`
- `feat: add [feature] page and route`
- `feat: add [feature] form`
- `test: cover [feature] business rules and variants`

Approve and start?
- **1** — yes, implement
- **2** — adjust (say what)
- **3** — use parallel worktrees (if applicable)
```

---

## Implementation Status Document (Phase 5.1)

Written/updated at `docs/specs/[feature]/IMPLEMENTATION-STATUS.md` once every
task is implemented. This file is what makes it safe to pick the feature back
up in a fresh session — without it, the next session has the code but not the
reasoning, and re-derives the same wrong turns.

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

Every decision from `decisions.md` that reality contradicted gets re-stamped
here as **SUPERSEDED** with a one-line reason — never edited away or deleted.

---

## Present-the-Result Message (Phase 5.2)

Presented once Phase 4 convergence is green, before pushing.

```markdown
**Implementation complete — [feature-name]**

**Harness:**
- `pre-push.mjs` — green
- `check-types` — zero errors
- Tests — [N] passing ([M] new)
- `lint-changed` — zero new findings
- Coverage ratchet — no package below its floor
- G0 — [endpoints probed, real payloads frozen | n/a, contracts inferred]
- Contract sensor — real payload parses through `@repo/schemas`
- Schema ⟷ UI — [N] modes/tabs verified, every required field mounted
- Visual scenario — [N] screens × [M] states, no open diff
- Console and network — clean
- Acceptance criteria — all verified

**Commits:** [N] on branch `feat/[feature-name]`

**Files created/modified:**
- [list]

**How to test:**
- `bash db-manage.sh start && npm run dev:api && npm run dev:web`
- [http://localhost:5173/[route]](http://localhost:5173/[route])
- Sign in as `recruiter.seed@crafthub.local` / `12345678` (or a `seed-*` candidate)
- Actions to try: [list]

**Screens you need to check** (one per usage shape — only if shared code changed):

| Screen | Route | Shape (props) | What to look at |
|---|---|---|---|

**Next:**
- **1** — push and open the PR
- **2** — review before finalising
- **3** — implement adjustments
```

---

## QA Findings Document (Phase 6)

Written/updated at `docs/specs/[feature]/qa-findings.md` — one item per
finding, recorded before opening a new session to fix it.

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
