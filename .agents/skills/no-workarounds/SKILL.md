---
name: no-workarounds
description: >-
  Fix problems at their root cause instead of patching symptoms. Use when
  debugging, fixing bugs, resolving vitest failures, planning a solution, or
  reviewing a change — especially where a fix would silence a signal: a cast or
  widened zod schema hiding @repo/schemas contract drift, an inline eslint-disable
  slipping past the lint-changed ratchet, a swallowed error bypassing the global
  error handler, a .skip on a test that needs `bash db-manage.sh start`, or a
  setTimeout papering over a React Query race. Not for formatting- or docs-only
  edits.
metadata:
  author: Pedro Nauck
  github: https://github.com/pedronauck
  repository: https://github.com/pedronauck/skills
---

# No Workarounds

A workaround is any change that makes a problem stop manifesting without addressing why it exists. It makes the symptom disappear while the disease spreads — a deferred failure that compounds. **Fix the source, not the signal.**

## The gate — run before any fix

```
1. State the problem, then trace it to its root cause — and write the failing test that
   proves you reproduced it before you touch the fix.
2. Does the fix repair that root cause, or only stop the symptom from showing?
3. Am I silencing a signal, or fixing a source?

Silencing a signal → redesign the fix against the root cause.
Root cause is external or genuinely unfixable → take the escape valve.
```

The fix is done when it would have been unnecessary had the code been correct in the first place — and it needs no cast, suppression, delay, or empty catch to pass.

## The seven signals

Each row is the compiler, linter, runtime, or reviewer telling you something true. Fix what it points at.

| Category | The signal it silences | Fix the source by… |
|---|---|---|
| **TYPE** — `as`, `any`, `!`, `as unknown as` | The type system found the code wrong | Making types truthful: correct the definition, or validate genuinely-unknown data at the boundary (Zod / Schema / type guard) |
| **LINT** — `eslint-disable`, `@ts-ignore`, `@ts-expect-error` | Static analysis found a real problem | Fixing what the rule flagged; if the rule is truly wrong for this repo, disable it in config, not inline |
| **SWALLOW** — empty catch, `.catch(() => null)`, catch-and-default | Something failed and the code pretends it didn't | Handling each error: log with context, then re-throw or map it to a typed result |
| **TIMING** — `setTimeout`, `sleep`, blind retry loops | Code runs in the wrong order | Coordinating on the real readiness event; in tests, wait on a condition, not the clock |
| **PATCH** — prototype / global / library-internal mutation | The API doesn't do what the code needs | Composing around it: wrapper, adapter, or the library's official extension point |
| **SCATTER** — deep `?.` / `??`, fallback chains | The data is unreliable at its source | Validating once at the boundary, then trusting the shape everywhere downstream |
| **CLONE** — copy-and-tweak of similar code | An abstraction doesn't fit but gets forced | Extracting the shared pattern, or writing purpose-built code |

**When any category's signal fires, read `references/workaround-catalog.md` in full before choosing the fix** — 6 named patterns (W-31…W-36), the CraftHub-specific set, with before/after code: contract casts, widened zod schemas, docker-skipped tests, swallowed use-case errors, `setTimeout` race "fixes", and inline eslint disables.

## The escape valve

Not every root cause is yours to fix. A workaround is allowed only when ALL hold:

```
1. The root cause is in external code the team does not control.
2. The proper fix needs upstream changes on an uncertain timeline.
3. The business cost of not shipping exceeds the debt incurred.
4. The workaround is isolated — it does not leak into other code.
```

When all four hold, contain it:

```
1. Mark it: // WORKAROUND: [reason] — see [issue-link]
2. File a tracking issue for its removal.
3. Add a test that pins the current behavior.
4. Add a canary test that FAILS once the upstream fix lands.
5. Set a review date (max 90 days).
```

If any condition fails, fix the root cause. No exceptions.

## Foundations & rationalizations

The principle converges from Toyota's Jidoka, Fowler's debt quadrant, Torvalds' "good taste," and Broken Windows — and every excuse for skipping it has a known answer. Read `references/philosophical-foundations.md`.

---

# CraftHub binding — where each signal actually fires in this repo

The doctrine above is general. Below is the concrete shape each category takes in this
codebase: which sensor catches it, and what the fix at the source looks like here.
Everything here is verifiable — run the command and see.

| Signal | What catches it here | The fix at the source |
|---|---|---|
| **TYPE** | `npm run check-types` (turbo, the real CI gate) plus the changed-file eslint pass. Run `npm run build:schemas` first or a fresh tree fails against a missing `packages/schemas/dist/` | Make the type truthful. For anything crossing a boundary — HTTP response, MCP tool input, webhook body, LLM output — that means `.parse()` through the matching `@repo/schemas` zod schema, never a cast. See W-31 and W-32 |
| **LINT** | `node scripts/guardrails/lint-changed.mjs` — eslint over changed files only, ratcheted against the recorded 30-error baseline in `apps/web`. It fails on **new** findings | Fix what the rule flagged. An inline `eslint-disable` is invisible to the ratchet by construction (W-36). If the rule is genuinely wrong here, disable it in the flat config, where the decision is reviewable |
| **SWALLOW** | Judgment, plus `apps/api/src/infra/http/middleware/global-error-handler.ts` never seeing the error, plus Sentry/OTel showing a clean trace for a broken request | Let it reach the global error handler, or map it to a typed domain failure and throw that. A `catch` inside `apps/api/src/core/**` routes around the one place that assigns status codes, log context and spans (W-34) |
| **SCATTER** | Judgment. A deep `?.` chain in `apps/web` almost always traces back to a response that was never parsed | Parse **once** at the boundary through `@repo/schemas`, then trust the shape downstream. `packages/typescript-config/base.json` is strict with `noUncheckedIndexedAccess` — note that `apps/api` and `apps/training` do not extend it yet, which is recorded debt, not permission to index blindly |
| **TIMING** | The visual scenario runner (`node scripts/visual/run.mjs …`) fails on console errors and uncaught exceptions, which is where a timing hack surfaces first; flaky vitest suites are the other tell | Coordinate on the real event: React Query's `onSuccess`/`onSettled`, not a timer (W-35). In tests wait on the condition — `findBy*` / `waitFor` in `@testing-library/react`, web-first assertions in Playwright. Seed through `bash db-manage.sh seed-all` or the API, never by driving the UI |
| **PATCH** | Judgment — no automated rule. Reviewers and the `deep-review` skill catch it | Compose around the library: wrapper, adapter, or its official extension point. For UI that means a primitive under `apps/web/src/shared-components/` built on the Radix primitive, following `DESIGN.md` — never a mutation of a vendor's internals. Check the current API through the `context7-usage` skill first |
| **CLONE** | Judgment. Duplication across `apps/api`, `apps/web` and `apps/mcp` is the common case, since all three speak the same HTTP contract | If the duplicated thing is a **shape**, it belongs in `packages/schemas` and nowhere else. If it is UI, promote it to `apps/web/src/shared-components/`. Note `packages/ui` is dead scaffolding — do not revive it as the destination |

## Sensors, in the order worth running

```bash
npm run build:schemas                       # ALWAYS first — everything types against dist/
npm run check-types                         # the real gate
node scripts/guardrails/lint-changed.mjs    # ratcheted, changed files only
npx vitest related <file> --run             # focused: only the suites touching your change
node scripts/guardrails/pre-push.mjs        # the full gate — same script husky pre-push runs
```

If the gate fails, **the failure is the signal**. Read what it points at before you touch
the fix. `--no-verify` is not an escape valve: it skips the local hook, not the problem,
and converts a fast local failure into a broken `main`.

## The escape valve in this repo

The four conditions in the doctrine still all have to hold. On top of them, this repo
requires the containment to be **real and checkable**:

1. **Mark it** — `// WORKAROUND: <reason> — see <issue-url>` on the line. No marker, no
   workaround.
2. **File the GitHub issue** on `gabrikf/Link-hub-v1` (`gh issue create`) and put its URL
   in the marker. "I'll open it later" means the workaround is now permanent. Read
   `git remote -v` rather than assuming the remote.
3. **Add the canary test** that FAILS once the upstream fix lands, so removal is triggered
   by CI rather than by memory. Co-locate it like any other test — see the `testing-boss`
   skill for where a test belongs in this repo.
4. Record it where the number is visible and ratcheted, the way the 30 `apps/web` eslint
   errors are recorded. Visible, ratcheted, attributed — or it is hidden debt, not a
   decision. The PR description carries the justification.

See the closing section of `references/workaround-catalog.md` for why that distinction is
the whole difference between deferring a fix honestly and pretending you fixed it.
