# BUG-20260822-links-keyboard-reorder: a keyboard user cannot reorder their profile links — the drag lifts, announces itself, and then goes nowhere

- **Status:** open
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
  `docker exec linkhub-postgres-dev psql -U linkhub_user -d linkhub_dev -tAc 'SELECT title, "order" FROM links ...'`
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
- **Fix commit:** —
- **Regression test:** a Playwright spec in `e2e/journeys/04-link-sharing.spec.ts` — focus the first grip, Space / ArrowDown / Space, assert the rendered link order changed **and** that a `PATCH /links/reorder` fired. Seen failing first. dnd-kit's `KeyboardSensor` reads real layout boxes, so jsdom + `@testing-library/react` is the wrong layer here; a component test would have to fake the geometry and would pass for the wrong reason.
- **Gate:** —
- Consult **context7** before writing the sensor code — this repo runs recent majors and dnd-kit's sensor API is easy to get wrong from memory.

## Verification

<!-- filled when status moves to verified -->
