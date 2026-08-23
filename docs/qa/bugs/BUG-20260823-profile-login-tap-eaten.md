# BUG-20260823-profile-login-tap-eaten: the theme toggle sits over the top of the public profile's Login link and eats the tap — on phones and on 1024–1152px laptops

- **Status:** fixed (approved at review, iteration 60)
- **Impact (user-side):** Friction (wrong action fires; recoverable in one more tap — but the wrong action persists to `localStorage`)
- **Severity:** Low · **Priority:** P3
- **Persona Affected:** Sam, the reader who arrives cold — on a phone **or on a 1024/1152-wide laptop**
- **Journey Step:** J-public-profile, the step where a visitor decides to sign in
- **Theme:** both (geometry, not colour — the tap is eaten in light and in dark alike)
- **Scenarios:** none yet — PROF has no signed-out geometry scenario
- **Found:** 2026-08-23 · **Report:** docs/qa/reports/2026-08-23-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` CAND-0115 (HUNT iteration 54, lane `responsive-dark`), confirmed in run `2026-08-22T18:58:46.702Z`, iteration 55 (TRIAGE), **re-reproduced and widened at iteration 58 (TRIAGE)**

## Summary

Sam reads a developer's public profile on a phone and decides to sign up. The
only sign-in call to action on the page is the **Login** pill in the top-right
corner. He taps the top of it — and the colour theme flips instead. The page
does not navigate.

The floating theme toggle is `position: fixed; right-4; top-3; z-40` and occupies
y 12–48. The Login pill occupies y 40–78, so the toggle covers the top **8px of a
38px target — 21% of it**. `App.tsx` already knows this hazard exists: the signed-in
`TopBarNav` reserves `pr-28` for exactly this toggle, and there is a comment
explaining why. The public profile's own Login link, which renders only when
signed out and therefore never appears next to `TopBarNav`, reserves nothing.

Low severity because it costs one extra tap and the theme flip is obvious and
undoable — but it is 21% of the conversion control on the product's most
mobile-heavy page, and the fix is a padding reservation the codebase has already
made once.

### Correction at iteration 58 — this is not a phones-only bug

Iteration 55 measured 390 and 1440 only, and 1440 happens to be one of the
widths that escapes. A width sweep at iteration 58 found **two** dead bands, not
one, because the two elements are anchored to different things: the toggle to
the **viewport** (`right-4`), the Login pill to the **container**
(`mx-auto max-w-6xl|max-w-md px-4`). They collide at every width where the
container's right edge reaches the viewport gutter — that is, whenever the
viewport is no wider than the container's max-width.

| Viewport width | Layout | Result |
|---|---|---|
| 360 / 390 / 448 | mobile (`max-w-md`) | **centre of the pill's top edge is dead** |
| 520 / 600 | mobile | clear at centre; 44×8 / 4×8 corner still covered |
| 620 – 1023 | mobile | clear |
| **1024 / 1152** | **pc (`max-w-6xl`)** | **centre of the pill's top edge is dead** |
| 1280 / 1300 | pc | clear at centre; 16×8 / 6×8 corner still covered |
| 1320 + | pc | clear |

`MOBILE_QUERY` switches the two layouts at 1024, which is exactly why the pc
band opens there. **1024×768 and 1152×864 are ordinary laptop sizes**, so the
affected population is much larger than "phones".

Also new at 58: the accidental flip is **written to `localStorage`**
(`theme: "dark"`), so it outlives the page — Sam's colour preference is changed
until he changes it back.

Severity stays **Low**. What changed is how many people meet it, not what
happens to them: still one extra click 10px lower, still visibly wrong, still
self-evidently undoable, journey not blocked, no data lost, nothing exposed.

## Reproduction

- **Charter:** none yet · **Tour:** the-mobile tour
- **Environment:** Chromium 390×844, **signed out** · nightly stack web http://localhost:5273 (dev stack 5173) · any seeded profile (`bash db-manage.sh seed-all`)

1. Open `/profile/seed-react-frontend-003` with no session, in a **390×844**
   viewport **or a 1024×768 one** — both are dead, and picking only one of them
   is how iteration 55 came to believe this was mobile-only.
2. Tap 1–7px below the top edge of the **Login** pill, at the pill's centre-x.

**Expected:** the whole Login pill receives the tap and the app navigates to `/`.
**Actual:** the theme flips to dark; the URL does not change.

## Evidence

- **Reproduced from scratch at triage (iteration 55)** with a **real Playwright click**, not only `elementFromPoint` — `elementFromPoint` is a model of a tap, and triage wanted the tap. Probe: `.nightly/probes/i55-triage-repro.mjs` (section B). Screenshot after the tap: `.nightly/evidence/i55-triage/B-390-after-tap.png`.
- Geometry at 390×844: Login `{top:40, bottom:78, left:287, right:374}`; theme toggle `{top:12, bottom:48, left:294, right:374}`; overlap 80px wide × **8px** tall.
- Hit testing at the Login pill's centre-x: `+1 / +3 / +5 / +7` → `BUTTON[Switch to dark theme]`; `+9 / +12 / +19` → `A[Login]`.
- Real click at `(centreX, login.top + 4)`: theme `"" | none` → `"dark" | dark` — **flipped** — and `page.url()` unchanged. Both halves of the harm proved in one action.
- No overlap at 1440×900 (i54 measured zero overlapping control pairs on this route).

**Iteration 58, re-reproduced from scratch on the current branch head**, three
commits after i55 measured it — probes `.nightly/probes/i58-triage-repro.mjs`
and `.nightly/probes/i58-triage-widths.mjs`, report
`.nightly/evidence/i58-triage/report.json`, screenshots
`.nightly/evidence/i58-triage/{390,430,1024}-{light,dark}-after-tap.png`.

- **Real Playwright clicks, four combinations, all four broken the same way:**
  390 light, 390 dark, 430 light, 1024 light → theme flipped, `page.url()`
  unchanged. Dark→light flips too, so it is not a light-mode-only artefact.
- Geometry is **identical at every affected width**: Login `{top:40, bottom:78,
  h:38}`, toggle `{top:12, bottom:48, h:36}` → 8px vertical overlap; the
  horizontal overlap is 80px whenever the container's right edge reaches the
  gutter. The vertical overlap never changes — only whether the two boxes share
  an x-range.
- Hit testing across the pill's full height at its centre-x: 4 of 19 sampled
  rows belong to `BUTTON[Switch to … theme]` at 390, 430 and 1024; 0 of 19 at
  768 and 1440.
- `localStorage` after the accidental click: `theme: "dark"` (was unset).
- Zero console errors and zero page errors in all six runs.
- Exactly **one** sign-in CTA exists on the page at every width measured, which
  is what makes 21% of it being dead worth recording at all.

## Fix

- **Root cause:** *symptom* — the top 8px of the Login pill is dead to taps. *Cause* — the two controls are anchored to **different boxes**. `apps/web/src/App.tsx:43-47` renders the theme toggle `fixed right-4 top-3 z-40` against the **viewport**, on every route. `apps/web/src/features/profile/pages/public-profile-page.tsx:225-232` places the signed-out Login link `self-end` in normal flow inside the `mx-auto … max-w-6xl|max-w-md px-4 py-10` `<main>` at `:174-177`, against the **container**. Whenever the viewport is no wider than that max-width, the container's right edge lands in the viewport's gutter and the two boxes share an x-range — which is why the breakage comes in two bands rather than one, `MOBILE_QUERY` at 1024 being the seam between them. `apps/web/src/shared-components/top-bar-nav.tsx:147` solves the same collision with `pr-28`, but `TopBarNav` returns `null` when there is no session, so the public profile never inherits that reservation.
- **Root Cause (taxonomy):** layout/geometry — two overlapping controls anchored to different containing blocks, with no reservation between them.
- **Fix commit:** `f310b7c` — one utility class, `mt-3` on the signed-out Login pill in `apps/web/src/features/profile/pages/public-profile-page.tsx`, plus the comment explaining the constraint. The toggle's bottom edge is `top-3 + h-9` = 3rem; `py-10` put the pill's top at 2.5rem; `mt-3` moves it to 3.25rem. Every term is rem-based, so the clearance is 0.25rem (4px at the default root size) and survives zoom and a changed root font size. Deliberately **not** breakpoint-gated, so the 1024–1152 band is covered by construction rather than by a second gate that could rot.
- **Regression test:** `e2e/journeys/04-link-sharing.spec.ts` — "the whole Login pill is tappable on a public profile at 390px / at 1024px", red commit `31ba821`. Hit-tests a 3×3 grid over the pill, with the columns **inset by the corner radius** because `elementFromPoint` honours `border-radius` and the literal box corners of a `rounded-full` pill belong to nobody; then performs a real click at `top+3` and asserts both halves of the harm are gone (URL becomes `/`, saved theme unchanged).
- **Gate:** `guardrails PASS` at the fix commit; re-checked independently at review — `build:schemas` OK, `check-types` 8/8, `lint-changed` clean (39 files, 2 known recorded findings ignored).

### Test plan agreed at triage

jsdom has no layout, so a `@testing-library/react` test cannot see this. It
belongs in a **visual scenario** for `/profile/$username`, signed out, asserting
that `document.elementFromPoint` over the Login link resolves to the Login link
across its full height — the assertion the probes already make, promoted out of
`.nightly/` into `scripts/visual/scenarios/`.

Run that assertion at **390 and at 1024**, both themes. A 390-only assertion
passes against a still-broken laptop, which is precisely the hole iteration 55's
evidence left.

**Fix guidance, corrected at iteration 58.** The reservation must be
**width-independent**.

- **Do not gate it behind a `sm:` / `max-sm:` prefix.** That is the mobile-only
  fix the original wording invites, and it leaves the 1024–1152 band broken.
- A plain horizontal reservation on the Login row (`mr-24`, 96px) is *provably*
  always clear: the pill is anchored to a container whose right edge is at most
  `viewport − 16`, while the toggle's left edge is at `viewport − 96`.
- `pr-28` copied literally from `TopBarNav` also works visually, but it widens
  the `<a>` itself, leaving a dead 8px sliver of the link under the toggle. The
  text clears; the element does not.
- A **vertical** gutter — pushing `login.top` past the toggle's bottom edge at
  y=48 — is the other correct option, and it keeps the pill in the corner at
  every width. Cost: page content shifts down ~12px.
- **Do not move the shared toggle.** That changes all eight routes and would
  need all of them re-walked the night before a deploy. Changing the Login row
  touches one signed-out element on one page.

## Verification

**Reviewed at iteration 60 by an agent that did not write the fix. Verdict:
approved.**

**Red/green proved mechanically, in the stronger form.** The fix commit touches
no test, so instead of checking out `31ba821` wholesale (which would also run
yesterday's test text), today's test file was kept and only the one source file
was reverted to its red state. Against that source the two committed checks fail
2/2 for the bug's **own** reason — top-left, top-centre and top-right of the pill
at `y=41` all resolve to `button:Switch to dark theme`, at **390 and at 1024** —
not an import error and not a bad selector, and the six non-top probe points
still resolve to `a:Login`. Source restored; 2/2 pass on the branch head. Full
journey 4 is green on both projects (17 passed).

**Re-walked with a probe written at review, not reused from the fix**
(`.nightly/probes/i60-review-verify.mjs`, evidence `.nightly/evidence/i60-review/`).
It asks three things neither the fixer's probe nor the committed test does:
the profile this bug was *filed* against (`seed-react-frontend-003`; the fixer
walked `seed-go-sre-026`), the two band edges nobody had sampled (**1100** and
**1152**), and a real click at `top+3` in **both** themes rather than light only.
Ten widths × two themes: **20/20 pass** — no stolen hit-test point anywhere,
every click navigates to `/`, and the saved `linkhub-theme` survives it.
`login.top=52` against `toggle.bottom=48` on every row, with no dependence on
width. Both themes were looked at, not just asserted
(`.nightly/evidence/i60-review/i60-390-dark.png`, `i60-1024-light.png`): the
pill now sits directly under the toggle, right-aligned to the same edge, and
reads as an intentional stack. No horizontal scroll at either width.

**The "one profile" caveat below is retired.** The `<main>` max-width is chosen
by `pickViewport(matchMedia("(max-width: 1023px)"))` alone
(`public-profile-page.tsx:23–67`) and never by the profile's saved layout —
`resolveViewportLayout` applies that to the blocks *inside* the card. The
geometry this bug lives in is profile-independent by construction, which is why
two different seeded profiles measure identically.

**Deviation from the agreed test plan, judged and accepted.** Triage asked for a
visual scenario. The regression went into `e2e/journeys/` instead, because
`scripts/visual/scenarios/` is gitignored except `public-profile.scenario.mjs`
and the visual runner is a camera with no pass/fail report — so a scenario
cannot satisfy the red-then-green protocol. The e2e home is stronger, not
weaker: it asserts, and it runs in the gate.

**Unrelated harness defect found while reviewing, recorded not fixed.**
`npm run visual:run -- scripts/visual/scenarios/public-profile.scenario.mjs`
fails at its LOADING step, and fails **identically with this fix reverted** —
its `PROFILE_API` glob is `**/profile/<username>**`, which also matches the
*page* URL, so `mock(…, { delay: Infinity })` hangs the document navigation and
the app never boots (`net::ERR_ABORTED` on the HTML). That is a bug in the QA
camera, not in the product — no user impact — but it does mean the repo's
committed four-state proof for this page is currently unusable.

### Still not verified after the fix

- **No real device and no real touch.** A Playwright mouse click at a point
  remains the model of a thumb.
- **Signed-out only** — correctly, since the pill does not render otherwise, so
  the ~12px downward shift cannot reach a signed-in visitor.
- **No screen-reader check.** This is hit testing, not announcement.
- **The signed-in public profile was not re-walked.** With the pill absent the
  card top returns to `y=40` and the toggle's bottom edge at 48 sits over the
  card's top-right 8px. Pre-existing, unchanged by this fix, and no interactive
  control is there (the cover's Share button is ~28px lower) — but it is
  untested.
- **Widths between the sampled ones** are covered by the geometry argument
  (`top=52 > bottom=48`, width-independent), not by sampling.

---

**Not verified at triage (updated at iteration 58).** The width bound i55 left
open is now closed — 17 widths from 360 to 1920 were swept, so the affected
range is bounded on both sides in both layouts. What is still open:

- **No real device and no real touch.** A Playwright mouse click at a point is
  the model used. A finger is ~9mm wide and its contact centroid is not a point,
  so on a real phone the dead strip is likely to be felt as *worse* than 8px,
  not better — but that is an argument, not a measurement.
- **Signed-out state only.** Signed in, `TopBarNav` renders and this Link does
  not, so the signed-in path was not measured.
- **One profile.** `seed-react-frontend-003` renders the `pc` layout, which is
  what opens the 1024–1152 band. A profile saved with the `mobile` layout keeps
  `max-w-md` at every width, and its own collision band (≤448, partial to ~608)
  was derived from the same sweep rather than measured on such a profile.
- **The 1152→1280 boundary is not pinned.** 1152 is dead at centre and 1280 is
  not; nothing between them was sampled. It does not change the fix.
- **The other seven routes were not re-checked.** i54 reported zero overlapping
  control pairs elsewhere at 390; that measurement was not repeated at 1024,
  where this bug shows the 390-only sweep can miss a whole band.
