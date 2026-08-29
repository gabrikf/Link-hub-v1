# BUG-20260822-links-keyboard-reorder: a keyboard user cannot reorder their profile links — the drag lifts, announces itself, and then goes nowhere

- **Status:** fixed — `14a550e`, review APPROVED 2026-08-23 (run `2026-08-22T18:58:46.702Z`, iteration 35)
- **Impact (user-side):** Blocks-Completion
- **Severity:** High · **Priority:** P1
- **Persona Affected:** Diego, the curating developer — specifically the Accessibility-Reliant axis folded into Sam (see `docs/qa/personas.md`, Notes)
- **Journey Step:** J-link-sharing, the step where the developer arranges the links on their public profile
- **Theme:** both (the defect is behavioural, not visual)
- **Scenarios:** none yet
- **Found:** 2026-08-22 · **Report:** docs/qa/reports/2026-08-22-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` CAND-0105, confirmed in run `2026-08-22T18:58:46.702Z`, iteration 4 (TRIAGE)
- **Re-reproduced:** 2026-08-23, iteration 33 (TRIAGE) — in a real browser, with a passing mouse control and the resulting order read back from Postgres. Claimed as the next fix.

## Summary

A keyboard-only or screen-reader developer wants to put their GitHub link above
their LinkedIn link. They tab to the "Drag to reorder" grip and press Space. Their
screen reader confirms the drag has begun. They press ArrowDown. Nothing happens —
but nothing *says* nothing happened either. They press Space to drop, and the list
is exactly as it was.

The list is arrangeable with a mouse, so the gap is invisible to anyone testing
with a pointer. And because the lift genuinely works and dnd-kit's live region
genuinely announces it, assistive technology tells the user the feature is
functioning while every arrow press is a no-op. That is worse than a control that
is plainly unreachable: they will conclude they are doing it wrong.

**The original candidate said the drag "does not lift". That is not what happens
and it matters for the fix:** the lift is fine, the *movement* is missing.

## Reproduction

- **Charter:** none yet · **Tour:** the-keyboard-only tour
- **Environment:** headless Chromium, 1440×900 · web http://localhost:5273 · api http://localhost:3344 · the e2e developer account (`.playwright/e2e-developer.json`; any seeded developer works)

1. Sign in as a developer and open `/dashboard`.
2. Make sure the links list has at least two entries (`POST /links` twice if the account has none — note the route is `/links`, **not** `/me/links`).
3. Tab to a link's grip — `button` with accessible name **"Drag to reorder"** — and press **Space**.
4. dnd-kit's `aria-live` region announces `Draggable item <id> was moved over droppable area <id>`. The lift worked.
5. Press **ArrowDown**. The announcement does **not** change: the droppable is still the dragged item's own id, so it never travelled over its neighbour.
6. Press **Space** to drop.

**Expected:** Space lifts, ArrowUp/ArrowDown move the item past its neighbours,
Space drops and persists — the documented dnd-kit sortable keyboard path.
**Actual:** the rendered order is byte-identical before and after, and no
`PATCH /links/reorder` is sent.

## Evidence

- `.nightly/evidence/BUG-20260822-links-keyboard-reorder/i33-reproduction.txt` — **the re-reproduction at iteration 33 (2026-08-23)** and the strongest of the two, because it adds a control and a persistence check. Probe: `i33-kbd-probe.mjs`.
- `.nightly/evidence/BUG-20260822-links-keyboard-reorder/kbd-drag-probe.txt` — the first run (iteration 4), including both live-region announcements and `ORDER CHANGED: false`.
- Independent read path: the assertion is on the re-read DOM order after the drop, not on an event handler firing.
- **Mouse control, same page and session:** dragging the same grip with the pointer changes the order *and* fires `PATCH /links/reorder`.
- **Persistence read back from Postgres, not inferred from a 2xx:**
  `docker exec crafthub-postgres-dev psql -U crafthub_user -d crafthub_dev -tAc 'SELECT title, "order" FROM links ...'`
  returns `I30-Bravo|0`, `I30-Alpha|1`, `I30-Charlie|2` after the mouse drag.
  So `handleDragEnd`, the mutation, the route, the use case and the write are all
  healthy end to end. The keyboard path simply never reaches them: the live
  region still names the dragged item as its own droppable, so `onDragEnd` sees
  `active.id === over.id` and the `oldIndex === newIndex` guard returns early.

### Harness notes for whoever writes the regression test

Two things cost this investigation four wasted runs:

1. The nightly servers are **web :5273 / api :3344**, exported as `E2E_WEB_URL`
   and `E2E_API_URL`. Something else on **:3333** answers `GET /health` with
   `{"status":"ok"}` but 404s every real route, so a probe pointed there looks
   like "this account has no links" rather than like a connection error. Read
   the env vars; never hardcode a port.
2. `page.waitForLoadState("networkidle")` is **not** a safe wait on this
   dashboard — it resolves before `GET /links` returns, and a vite HMR update
   can reload the page underneath afterwards. Wait for the control itself:
   `await grips.first().waitFor({ state: "visible" })`.

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — arrow keys do not move a lifted item. *Cause* — `apps/web/src/features/dashboard/pages/dashboard-page.tsx:562` renders `<DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>` with **no `sensors` prop**, so dnd-kit falls back to a default `KeyboardSensor` with no coordinate getter. A vertical sortable list needs `useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))` — `sortableKeyboardCoordinates` comes from `@dnd-kit/sortable`. Without it, arrow keys translate by a fixed offset that never crosses the neighbour's collision threshold.
- **Related but separate:** `BUG-20260822-layout-vertical-keyboard` is the profile-layout **block** editor, which uses **react-grid-layout**, a different library in a different file. Same harm, different cause. Do not merge them.
- **Root Cause (taxonomy):** third-party
- **Fix commit:** `14a550e` (red: `43ea606`). `dashboard-page.tsx` now declares `useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))` and passes it to the one `<DndContext>`. `PointerSensor` is declared with **no options**, which is byte-for-byte the default the mouse path already used.
- **Regression test:** `e2e/journeys/04-link-sharing.spec.ts:645` — "links can be reordered with the keyboard alone". Focus the grip, Space / ArrowDown / Space, then assert three separate things: the rendered order flipped, exactly one `PATCH /links/reorder` fired (which separates "the keyboard never started a reorder" from "the server refused it"), and the api read-back returns the new order rather than the optimistic cache. It waits on dnd-kit's own `role="status"` live region between keystrokes, not on a delay. Seen failing first.
- **Gate:** `guardrails PASS` (iteration 34). Re-run independently at review: `build:schemas` OK, `check-types` 8/8, `lint-changed` clean over 29 files, journey 04 12/12.
- ~~Consult **context7** before writing the sensor code~~ — no MCP is loaded in the nightly loop. The API was verified against the installed bundle instead (`node_modules/@dnd-kit/core/dist/core.cjs.development.js:2465`), which proves what *this* version does in a way a doc page cannot.

## Verification

**Review APPROVED — 2026-08-23, loop iteration 35 (REVIEW_FIX).**
Full transcript: `.nightly/evidence/BUG-20260822-links-keyboard-reorder/i35-review.txt`.

**Red-then-green, proved mechanically.** HEAD was not moved (the loop forbids
checking out a ref); instead the one product file the fix touches was restored to
its `43ea606` content with the final test file left in place — a narrower and
equivalent proof.

| lane | dashboard-page.tsx at `43ea606` (red) | at tip `14a550e` |
|---|---|---|
| `playwright --project=desktop e2e/journeys/04-link-sharing.spec.ts -g "keyboard alone"` | **1 failed** — `ArrowDown never moved the lifted link over its neighbour — it is still its own droppable`, `Expected: "travelled" / Received: "stuck"` at `:710` | passes (31.2s) |
| the whole of journey 04 | — | **12 passed**, including `:580`, the pre-existing **mouse** reorder test |

The red failure is the bug's own symptom at the bug's own assertion, not an
import error or a bad selector.

**The harm is gone from the real entry point, re-walked independently of the
committed test.** A hand-written probe seeded three links under a prefix I
control and drove `/dashboard` with the keyboard only:

```
rendered before : i35rev-Alpha | i35rev-Bravo | i35rev-Charlie
after Space     : Draggable item 0250…1bae was moved over droppable area 0250…1bae.
after Arrow↓    : Draggable item 0250…1bae was moved over droppable area 4e59…f8b2.   <-- travelled
rendered after ↓: i35rev-Bravo | i35rev-Alpha | i35rev-Charlie
after Arrow↑    : … droppable area 4e59…f8b2.
rendered after ↑: i35rev-Alpha | i35rev-Bravo | i35rev-Charlie
PATCH /links/reorder: 2   ·   console errors: []
```

**ArrowUp works too** — the bug's *expected* names both arrows and the committed
test only presses ArrowDown, so the up direction is proved here instead.

**Persistence read back from Postgres, not inferred from a 2xx.** A second probe
made exactly ONE keyboard move so the stored order differs from the seed:

```
SELECT title, "order" FROM links WHERE title LIKE 'i35rev%' ORDER BY "order";
 i35rev-Bravo   | 0
 i35rev-Alpha   | 1
 i35rev-Charlie | 2
```

**Checked and clean.** No schema change and nothing widened; no type assertion,
no `eslint-disable`, no `.skip`, no swallowed error, no monkey patch, and
explicitly no timing hack (the test waits on dnd-kit's live region, which is
observable state and the same string a screen-reader user hears). No edited test
— the red commit is 100 added lines and 0 removed, and the fix commit touches no
test. No scope creep. `grep "DndContext|useSensors"` over `apps/web/src` returns
this file and nothing else, so the blast radius is one component; the new hook is
at component top level and every `return` above it is inside a callback, so there
is no conditional-hook hazard. No markup and no colour utility added, so
`DESIGN.md` and the `dark:` rule do not bite, and the four-state rule is
unaffected — the `<DndContext>` already sat inside the `!isLoading` branch.

**Not verified, and none of it is a defect:** only the `desktop` project was run
(the test has no `@responsive` tag and a keyboard drag on a touch viewport is not
a real journey); no visual scenario and no dark capture, justified above; no
actual screen reader — the live-region string is asserted, but whether NVDA or
VoiceOver reads it usefully is unproven and always was.

**Environment note for the next reviewer, not a product fault.** The api runs
under `tsx watch` and its pid changed three times during this iteration: two red
runs died with `connect ECONNREFUSED 127.0.0.1:3344`, and because their
`finally { sweepE2eLinks }` never ran they left two `e2e-share` rows behind,
making the *next* run fail at the pre-condition `toHaveCount(2)` with
"Received: 4" instead of at the bug. That count is scoped to the shared
`E2E_PREFIX` rather than to a test's own unique titles, which is the pre-existing
convention of every test in this spec — so **one crashed run makes the whole file
fail for the wrong reason until somebody sweeps by hand.** Worth fixing spec-wide
one day; not this bug's problem.

**Related but still open:** `BUG-20260822-layout-vertical-keyboard` is the
profile-layout block editor, which uses **react-grid-layout**. This fix does not
touch it. Do not assume it went away.
