# BUG-20260822-layout-vertical-keyboard: blocks cannot be reordered vertically without a mouse

- **Status:** open
- **Impact (user-side):** Blocked — a keyboard-only user cannot arrange their profile
- **Severity:** High · **Priority:** P2
- **Persona Affected:** Diego, the curating developer — Accessibility-Reliant axis
- **Journey Step:** J-profile-appearance, the step where the developer arranges blocks in `/dashboard/layout`
- **Theme:** both (the defect is behavioural, not visual)
- **Scenarios:** none yet
- **Found:** 2026-08-22 · **Report:** docs/qa/reports/2026-08-22-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` `BUG-20260822-layout-vertical-keyboard`, carried in from the QA hand-off, confirmed into run `2026-08-22T18:58:46.702Z` at iteration 4 (TRIAGE)

## Summary

Reordering blocks is the one thing a layout editor is for, and vertically it is
mouse-only. Sideways works — `ArrowRight` moves a block, `shift+ArrowLeft`
resizes it — which makes the vertical dead end read as a bug rather than a
missing feature. A keyboard or assistive-tech user cannot arrange their profile
at all.

Each futile press is also not free: it fires a debounced `PATCH
/me/layout/blocks/positions` that persists byte-identical geometry. Ten presses
produced **eight** writes that changed nothing (measured at iteration 39; the
hand-off's "four" was wrong).

## Reproduction

- **Charter:** none yet · **Tour:** the-keyboard-only tour
- **Environment:** any seeded developer with a layout (`bash db-manage.sh seed-all`). At iteration 39 the run used **web :5173 · api :3333** — the pair `apps/web/.env` points at (`VITE_API_URL=http://localhost:3333`), which authenticated the seeded developer and served the real layout. Both that pair and **:5273 / :3344** were listening; the earlier note that 5173/3333 belonged to a different project did not hold tonight, so check what is actually up before assuming either pair.

1. Open `/dashboard/layout` and focus the bottom block card.
2. Press `ArrowUp` ten times.
3. `gridY` never changes (observed 16 → 16).
4. Confirm sideways still works: `ArrowRight` moves `x` 0 → 1, `shift+ArrowLeft` resizes `w` 12 → 11.

**Expected:** arrow keys move a block vertically — the app's own documented
keyboard substitute for drag.
**Actual:** `ArrowUp`/`ArrowDown` are permanent no-ops, plus eight no-op writes.

## Evidence

- `e2e/journeys/05-profile-appearance.spec.ts:767` — the assertion that recorded it.
- **Re-reproduced at the unit layer** at run `2026-08-22T18:58:46.702Z`, iteration 36 (TRIAGE), with the delta the ArrowUp handler actually sends. Ten `dy: -1` presses against an `h: 6` neighbour: `gridY [6,6,6,6,6,6,6,6,6,6]` — `AssertionError: expected 6 to be less than 6`. Transcript: `.nightly/evidence/BUG-20260822-layout-vertical-keyboard/`. That probe file was deleted after the run on purpose — writing the real regression test is the fix's job, and it owns the red commit.
- **Re-reproduced in a real browser** at iteration 39 (TRIAGE), closing the gap iterations 36 and 38 both recorded as unverified. `npx playwright test e2e/journeys/05-profile-appearance.spec.ts --project=desktop -g "reordered vertically"` against the running app printed `[journey-05] PERF vertical nudge → 8 position PATCH(es) for 10 ArrowUp presses` and failed with `Expected: < 16 / Received: 16`. Also re-run at the unit layer with my own throwaway probe (`gridY [6,6,6,6,6,6,6,6,6,6]`, sideways control `gridX 0 → 1` passing), deleted afterwards for the same reason as iteration 36's.
- **The no-op writes were read back out of Postgres**, not inferred from a 200. After the ten presses, all five `profile_blocks` rows for that developer's `pc` viewport carry `updated_at 2026-08-23 03:12:48.827` — the run's own timestamp, so the PATCHes really did rewrite them — while the moved `posts` block is still at `grid_y 16` under a `work_experiences` neighbour at `grid_y 10, grid_h 6`. Writes landed, geometry unchanged. Full transcript: `.nightly/evidence/BUG-20260822-layout-vertical-keyboard/i39-triage-repro.md`.
- **The path in the original entry was wrong.** The file is `apps/web/src/features/profile-layout/grid-utils.ts:241-272`; there is no `lib/` directory in this feature. `grid-block-card.tsx:34` is literally `ArrowUp: [0, -1]`.
- **Blast radius re-measured, and it is smaller than the hand-off claimed.** `grep -rn "moveBlockBy" apps/web/src` outside `grid-utils` returns exactly two lines — an import and `profile-layout-page.tsx:783`, the keyboard `onMove` handler. The mouse drag goes through react-grid-layout directly and never enters this function, so a fix confined to `moveBlockBy` cannot regress mouse dragging, and `verticalCompactor` does not need modifying. What keeps this second in the queue is that the correct behaviour must be *decided* (does `ArrowUp` swap with the neighbour above, or jump to that neighbour's `y`?), not that it is dangerous.

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — vertical arrow keys do nothing. *Cause* — `moveBlockBy` in the layout feature's `grid-utils.ts` nudges by exactly ±1 row and then re-runs `verticalCompactor.compact`, which floats the block straight back. A single row can never clear a 4–6 row neighbour, and nothing accumulates because state is recompacted from the original `gridY` on every press.
- **Root Cause (taxonomy):** algorithm — the nudge and the compactor fight each other
- **Fix commit:** —
- **Regression test:** a unit test beside `grid-utils.test.ts` using `dy: -1` against a realistically tall neighbour. **The existing test at `grid-utils.test.ts:236` passes only because it uses `dy: -2` against an `h: 2` block** — a full block height, which the card handler never sends. Add the missing case; do **not** edit that existing test to make a fix pass. The e2e assertion in journey 05 covers the user-visible half.
- **Gate:** —

## Verification

<!-- filled when status moves to verified -->
