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
produced four writes that changed nothing.

## Reproduction

- **Charter:** none yet · **Tour:** the-keyboard-only tour
- **Environment:** web **:5273** · api **:3344** (5173/3333 are a different project on this machine) · any seeded developer with a layout (`bash db-manage.sh seed-all`)

1. Open `/dashboard/layout` and focus the bottom block card.
2. Press `ArrowUp` ten times.
3. `gridY` never changes (observed 16 → 16).
4. Confirm sideways still works: `ArrowRight` moves `x` 0 → 1, `shift+ArrowLeft` resizes `w` 12 → 11.

**Expected:** arrow keys move a block vertically — the app's own documented
keyboard substitute for drag.
**Actual:** `ArrowUp`/`ArrowDown` are permanent no-ops, plus four no-op writes.

## Evidence

- `e2e/journeys/05-profile-appearance.spec.ts:767` — the assertion that recorded it.
- **Re-reproduced at the unit layer** at run `2026-08-22T18:58:46.702Z`, iteration 36 (TRIAGE), with the delta the ArrowUp handler actually sends. Ten `dy: -1` presses against an `h: 6` neighbour: `gridY [6,6,6,6,6,6,6,6,6,6]` — `AssertionError: expected 6 to be less than 6`. Transcript: `.nightly/evidence/BUG-20260822-layout-vertical-keyboard/`. That probe file was deleted after the run on purpose — writing the real regression test is the fix's job, and it owns the red commit.
- Not re-run in a browser this round; the unit result matches the original browser observation (`gridY` 16 → 16) exactly.
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
