# BUG-20260822-layout-error-fabricated: when /me/layout fails, the editor shows a fabricated default layout as if it were the user's own

- **Status:** open — re-reproduced at tip `6281fb6` and claimed for fix (iteration 22, TRIAGE)
- **Impact (user-side):** The layout editor silently shows a fabricated default arrangement on a failed load, so a user with a customised layout cannot tell a network failure from their profile having been reset — and every edit they then make is refused
- **Severity:** High · **Priority:** P1
- **Persona Affected:** Diego, the curating developer
- **Journey Step:** J-profile-appearance, opening `/dashboard/layout`
- **Theme:** both
- **Scenarios:** none yet
- **Found:** 2026-08-22 · **Report:** docs/qa/reports/2026-08-22-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` `BUG-20260822-layout-error-fabricated`, carried in from the QA hand-off, confirmed into run `2026-08-22T18:58:46.702Z` at iteration 4 (TRIAGE)

## Summary

On a 5xx from `GET /me/layout` the editor does not fail — it invents. The user
gets a full grid of blocks they never created, an enabled toolbar, and the
status line "Changes save automatically". Nothing anywhere says a request
failed.

That is worse than a blank screen. Someone who has arranged their profile opens
the editor after a transient 5xx and sees the stock arrangement — header, links,
resume, work history, posts — with the reassurance that changes save
automatically. The screen's own copy tells them their work is gone and safely
saved at the same time. This is the four-state rule `AGENTS.md` makes mandatory.

**Correction to the original write-up (made at re-reproduction, iteration 22).**
The first report claimed the autosave then *overwrites the real layout*. It does
not, and FIX should not go looking for that path. `buildDefaultLayout` mints
synthetic ids (`default-pc-links`, …), and
`apps/api/src/core/use-case/profile-layout/update-block-positions-use-case/update-block-positions.use-case.ts:16`
rejects any payload containing an id the user does not own in that viewport with
a `400`. So dragging a fabricated block cannot damage stored data — it fails.
The harm is the lie plus a dead-end screen: the user is told nothing failed, is
shown an arrangement that reads as a reset, and every repair they attempt is
refused for a reason they were never given. That is still `major`; it is not
data loss, and calling it data loss would send the fix at the wrong target.

## Reproduction

- **Charter:** none yet · **Tour:** the-broken-network tour
- **Environment:** web :5173 · api :3333 · any seeded developer, with `GET /me/layout` intercepted and returned as 500

1. Open `/dashboard/layout` with `GET /me/layout` mocked to 500.
2. The page renders a complete default layout (e.g. a "Profile header block" card) with a working toolbar.
3. No error copy appears anywhere.

**Expected:** an error state that says the layout could not be loaded, and does
not offer editing.
**Actual:** `buildDefaultLayout(viewport)` is rendered as though it were saved
data.

## Evidence

- `e2e/journeys/05-profile-appearance.spec.ts:822` — the assertion that recorded it.
- **Re-reproduced at tip `6281fb6`** on 2026-08-22 (iteration 22, TRIAGE) at the
  render layer, not through the browser: the live api on :3333 belongs to another
  project this week, so the Playwright lane is closed. Evidence:
  `.nightly/evidence/BUG-20260822-layout-error-fabricated/` — `triage-probe.test.tsx.txt`
  (the throwaway probe, deleted from `apps/web/src` afterwards) and
  `probe-output.txt`. It renders `ProfileLayoutPage` with `fetchLayout` rejecting
  and reports: five fabricated block groups (`Profile header block`, `Links
  block`, `Resume block`, `Work history block`, `Posts block`), the string
  `Changes save automatically` present, and **zero** error copy matching
  `/couldn.?t|could not|unable|try again|failed|error/i`.
- Cause read at tip: `profile-layout-page.tsx:319-343` — `const full =
  layoutQuery.data`, then `full ? full[viewport] : buildDefaultLayout(viewport)`.
  Only `layoutQuery.isLoading` is consulted (line 342, to blank the tab row);
  `layoutQuery.isError` appears nowhere in the file. The one `isError` at line
  574 is over the *mutations*, not the query.
- `persistPositions` (line 494) has no guard on query state, so the fabricated
  grid is fully draggable and does fire the debounced write — which the api then
  refuses, per the correction above.

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — a fabricated layout presented as the user's own. *Cause* — `layoutQuery.isError` is never read in `apps/web/src/features/profile-layout/pages/profile-layout-page.tsx`; on failure `full` is `undefined` and the code falls through to `buildDefaultLayout(viewport)`.
- **Root Cause (taxonomy):** missing-state — error is folded into the empty/default path
- **Fix commit:** `905fcee` — REJECTED at review (see "Review of attempt 1" below).
- **Regression test:** component test with `@testing-library/react` at
  `apps/web/src/features/profile-layout/pages/profile-layout-page.test.tsx`. The
  harness is proved to work — copy it from
  `.nightly/evidence/BUG-20260822-layout-error-fabricated/triage-probe.test.tsx.txt`:
  mock `@tanstack/react-router`, `lib/auth-tokens`, `lib/user-info-store`,
  `lib/profile-queries` and `lib/auth-api` (with `fetchLayout` rejecting), and
  render inside a `QueryClientProvider` whose queries have `retry: false`. Assert
  the three things the probe measured, inverted: error copy present, no
  `Profile header block` group, and the "Changes save automatically" promise
  gone. That test fails today — the probe asserts exactly the opposite and passes.
  Keep a filled-state case in the same file so the fix cannot buy its green by
  breaking the editor.
- **Intended primitives:** `RouteErrorState` in `apps/web/src/shared-components/route-states.tsx:28`.
- **Gate:** —

## Verification

<!-- filled when status moves to verified -->

## Review of attempt 1 (`905fcee`) — REJECTED, 2026-08-22 (loop iteration 24)

**Red-then-green: proved.** At `9d4d7a9` the two error-path cases fail for the
right reason — the page text is `Editing the desktop layout — desktop …` with no
error copy, and there is no `/try again/i` button — while the filled-state
positive control passes. At `905fcee` all three pass.

**Why it was rejected.** The early return is guarded on `layoutQuery.isError`
alone, with no check that the layout data is absent:

```ts
if (layoutQuery.isError) { return <LayoutLoadFailed … /> }
```

`invalidateLayout()` invalidates `["layout"]` after every successful mutation
(five call sites: 426, 506, 608, 656). TanStack Query keeps `data` and still
reports `status: "error"` when a *background refetch* fails, so a transient api
failure after a successful save now replaces a fully working editor with the
error screen — the user's real layout is in the cache, nothing is fabricated,
and their save went through. That is a new regression the bug never had.

Proved mechanically with
`.nightly/evidence/BUG-20260822-layout-error-fabricated/review-refetch-probe.test.tsx.txt`
(load the layout, then reject `fetchLayout` and invalidate `["layout"]`):

| commit | error screen | editor | block groups |
|---|---|---|---|
| `9d4d7a9` (before the fix) | no | yes | 5 |
| `905fcee` (after the fix) | yes | no | 0 |

**What attempt 2 must change.** Guard on the absence of data too —
`if (layoutQuery.isError && !full)` — since the fabrication is only possible when
`full` is `undefined`; and add a case to the existing test file asserting the
editor survives a failed refetch after a successful load. No banner or toast for
the stale-refetch case: out of scope for this bug.

**Reviewed clean otherwise:** root cause correct (`isLoading` consulted without
`isError`; `buildDefaultLayout` reused as a failure fallback), the exit sits
below every hook (no hook call after line 826), no scope creep (67 insertions,
one file), no test edited, no schema widened, no `eslint-disable` / assertion /
`.skip`, `SURFACE` imported rather than hand-written, `Button fullWidth={false}`
with `isLoading`, and every colour utility carries a `dark:` counterpart. The
only caller of the page is `src/router.tsx`.

**Not verified by this review:** nothing was walked in a real browser — port 3333
serves an unrelated api, so Playwright and the visual runner were not run and the
error state's `dark:` variants were read from class strings, not looked at. No
psql: this bug lives entirely in the web client's handling of a failed response.
`e2e/journeys/05-profile-appearance.spec.ts:874-877` still asserts the fabricated
`Profile header block` group is present on a 500 — still open, still for a human.

**Minor, non-blocking:** `LayoutLoadFailed` hand-duplicates the `RouteShell`
markup from `shared-components/route-states.tsx` (acceptable — `RouteErrorState`
is the router's `defaultErrorComponent` and reloads rather than refetches), and
`role="alert"` on the `<h1>` costs it its heading role.
