# BUG-20260822-layout-vertical-keyboard: blocks cannot be reordered vertically without a mouse

- **Status:** fixed — approved at review (iteration 49)
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
- **Fix commit:** `12a3386` (red `dea5742`), the second attempt. The first,
  `c938e6c` (red `df12cbc`), was rejected at review: it read `dy` as a direction
  with a minimum distance — correct — but accepted the first candidate row where
  *anything* in the layout changed. On a row shared by two half-width blocks that
  is satisfied far too early, because shoving the row-mates aside is itself a
  change, so a single `ArrowUp` left the focused block where it was, flung an
  untouched neighbour to the bottom of the profile, and persisted it. `12a3386`
  changes one condition: a candidate counts only when **the block the user is
  nudging** ends up on a different cell; otherwise the loop keeps walking. When
  no candidate moves it, the input array is returned, so a nudge with nowhere to
  go still writes nothing. `sameGeometry` had no other caller and went with its
  last use.
- **Regression test:** five new cases in `grid-utils.test.ts` — the one-row nudge over a taller neighbour in both directions, the same-array guard for a nudge with nowhere to go, and (in `dea5742`) the shared-row shape plus its bystander/no-write mirror. No existing test was edited: both red commits are insert-only, and the pre-existing `dy: -2` case at `:236` — which passed only because a full block height is a delta the card never sends — is untouched.
- **Gate:** `guardrails PASS` at `12a3386` (web 51 files / 454 tests). At review: `check-types` 8/8, `lint-changed` clean.

## Verification

Reviewed independently at iteration 49 (REVIEW_FIX) and **approved**. Full
transcript: `.nightly/evidence/BUG-20260822-layout-vertical-keyboard/i49-review-approve.md`.

**Red → green, run at the commits rather than taken from the message.** At
`dea5742`: `1 failed | 27 passed`, and the failure is a real geometry assertion —
`expected 6 to be +0` at `grid-utils.test.ts:315`, i.e. the focused block never
moved — not an import error or a bad fixture. At `nightly/qa-hardening`:
`28 passed`.

**The fix cannot make a working nudge worse, and that was measured, not argued.**
The new condition only *narrows* which candidate rows are accepted, so every
nudge that already moved its target is byte-identical. Running one throwaway
probe at **both** commits over three shapes no committed test covers:

| shape | press | red `dea5742` | fix `12a3386` |
|---|---|---|---|
| mobile 4-col `a@x0y0w2h4 / b@x2y0w2h4 / c@x0y4w4h4` | `ArrowUp` on `c` | `a@y0 c@y4 b@y8` — c stuck, b flung | `c@y0 a@y4 b@y4` ✅ |
| three in a row `p/q/r@y0w4 / s@y6w12` | `ArrowUp` on `s` | `p@y0 s@y6 q@y12 r@y12` | `s@y0 p/q/r@y6` ✅ |
| `T@y0w12 / L@y6w6 / R@y6w6` | `ArrowUp` on `L` | `L@y0 T@y6 R@y12` | identical |

So the fix also repairs the **4-column mobile grid**, which no test asserts. The
last row is the known rough edge — nudging one half of a row above a full-width
block drops its row-mate below that block — and it is **pre-existing and
unchanged**, matching what react-grid-layout's own drag maths produce for a drop
on that row.

**Re-walked in a real browser.** The bug's own reproduction (journey 05,
desktop, live app) passes and prints `1 position PATCH(es) for 10 ArrowUp
presses` — the bug filed **eight** byte-identical writes for those same presses.
The shared-row shape had never been in a browser at all; a review probe built it
through the API and drove the real editor: `ArrowUp` on the full-width block
gives `work_experiences@x0y0w12` with `links@x0y6` and `resume@x6y6` still side
by side (1 PATCH), `ArrowDown` puts it back (1 PATCH) — **the first browser
press of `ArrowDown` for this bug** — and `ArrowUp` on the top block writes
nothing at all (0 PATCH). Zero console errors.

**Read back out of Postgres mid-move**, since the journey restores its baseline
in `afterAll` and psql after the suite proves nothing: `work_experiences 0/0/12/6`,
`links 0/6/6/6`, `resume 6/6/6/6`, all at `updated_at 2026-08-23 07:17:10.341`.
The developer's original geometry was then restored from `i40-snapshot.json` and
re-checked in psql.

**Not applicable:** nothing visual changed — no markup, class string or
component — so `DESIGN.md`, the `SURFACE*` constants, `dark:` counterparts,
`--profile-accent-*` and the four-state rule have nothing to answer here. No
boundary shape changed, so there is no contract drift and nothing was widened.

**Still not verified:** dark theme and 390px were not looked at (nothing visual
changed; the 4-column grid is measured only at the unit layer). The
pinned-blocks zone is still exercised by nothing. No screen reader.
`Shift+Arrow` resize was not re-walked in a browser. The `deep-review` skill's
full artifact pipeline was not run — it is a multi-agent round sized for
hundreds of files and this diff is one file / 30 lines; its rubric was applied
by hand and its linter lanes (`build:schemas`, `check-types`, `lint-changed`)
were run.
