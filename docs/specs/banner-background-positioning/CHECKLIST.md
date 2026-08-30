# DoD checklist — banner positioning + background image

Source of truth for the verification pass. Every box must be provably true in
the code, in a test, or in a Playwright run.

## A. Contract (`@repo/schemas`)

- [ ] A1. `imagePlacementSchema` exists: `{ x: 0..100, y: 0..100, scale: 1..3 }`,
      all numbers, all bounded and all required.
- [ ] A2. `profileAppearanceSchema` exists with `bannerPlacement`
      (nullable), `backgroundPlacement` (nullable), `backgroundOverlay` (0..100)
      and `backgroundBlur` (0..24 px).
- [ ] A3. `DEFAULT_PROFILE_APPEARANCE` is exported and used as the schema
      default, so a payload written before this feature parses cleanly.
- [ ] A4. `profileSchema` (public + `/me` read shape) carries `appearance`.
- [ ] A5. `updateProfileSchemaInput` accepts `appearance` (optional — absent
      leaves it untouched) and `updateProfileSchemaOutput` returns it.
- [ ] A6. No local re-declaration of these shapes in `apps/web` or `apps/api`;
      every consumer imports from `@repo/schemas`.
- [ ] A7. A contract test `.parse()`s a real captured API payload (banner +
      background + placements) through the shared schema.

## B. API

- [ ] B1. `users.profile_appearance` column exists with a generated drizzle
      migration checked in (`apps/api/drizzle/*.sql` + journal entry).
- [ ] B2. `UserEntity` carries `appearance`, normalised to the default when
      absent, with an `updateAppearance` mutator.
- [ ] B3. `DrizzleUserRepository` maps the column on EVERY read path and on
      insert/update, and validates the stored JSON through the shared schema
      (a hand-edited row can never crash a profile render).
- [ ] B4. `UpdateProfileUseCase` applies `appearance` only when provided
      (`undefined` = leave alone) and returns it.
- [ ] B5. `GetMeProfileUseCase` and `GetPublicProfileUseCase` both return it.
- [ ] B6. The profile controller passes it through, typed, no `any`.
- [ ] B7. Unit tests cover: default when absent, round-trip of a set value,
      untouched when omitted, and rejection of out-of-range values.

## C. Banner positioning (the actual complaint)

- [ ] C1. After uploading a banner the user is taken straight into a
      reposition step — they never have to discover it.
- [ ] C2. The reposition surface is DRAG-based (pointer/touch), and the frame
      shown is a REAL published banner aspect ratio, not a square and not an
      invented one. The banner is published at TWO shapes (2.13:1 on a phone,
      6.36:1 on a desktop); the editor must make both legible — dragging in one
      and publishing in the other reproduces the original bug downstream.
- [ ] C3. Zoom is available (slider + two buttons), bounded 1x..3x.
- [ ] C4. Keyboard operable: the frame is focusable and arrow keys nudge the
      image; every control has an accessible name.
- [ ] C5. A reset control returns the image to centred, 1x.
- [ ] C6. The editor preview uses the SAME rendering code as production, so
      what is dragged is what ships.
- [ ] C7. The placement is applied on: the public profile cover, the dashboard
      live preview, the in-form preview, and the dashboard thumbnail.
- [ ] C8. Placement survives a save + reload (persisted, not local state).
- [ ] C9. The rendering is responsive-safe: the same stored placement keeps the
      chosen subject visible at mobile and desktop cover heights (a focal
      point, not a baked crop at one aspect ratio).
- [ ] C10. A profile with a banner but no placement renders exactly as before
      (centred), so nothing regresses for existing accounts.

## D. Background image (the "it never appeared" bug)

- [ ] D1. The background image renders on the PUBLIC profile and is actually
      visible — the veil over it is no longer ~85% opaque by default, the layer
      is genuinely PAINTED (not sitting behind an opaque wrapper), and it is
      visible on a PHONE, where the profile card leaves no gutter to hide in.
- [ ] D2. The background image renders in the dashboard LIVE PREVIEW.
- [ ] D3. The background image renders in the in-form appearance preview.
- [ ] D4. The background is configurable: reposition (drag + zoom), overlay
      strength, and blur — each with a live preview of the result.
- [ ] D5. Overlay + blur are bounded and have sane defaults that keep the
      profile card readable in BOTH themes.
- [ ] D6. Config changes are visible in the preview before saving — with the
      preview actually ON SCREEN at the moment the control is used.
- [ ] D7. Background settings survive a save + reload.

## E. Design + i18n

- [ ] E1. `SURFACE*` / `BADGE*` / `FOCUS_RING*` imported from
      `shared-components/surface.ts`; no hand-written forks of those strings.
- [ ] E2. Every colour utility has a `dark:` counterpart; violet accent, zinc
      neutrals only; no `slate`/`gray`/`blue`/`indigo`; no hardcoded hex.
- [ ] E3. Icons from `react-icons/fi` only.
- [ ] E4. `Button` used with `fullWidth={false}` in rows; no reimplemented
      loading/confirm behaviour.
- [ ] E5. Every new user-visible string goes through `t()` and exists in
      `pt-BR.json`, `en-US.json` and `es-ES.json`.
- [ ] E6. `npm run i18n:check` passes.

## F. Tests

- [ ] F1. Unit tests for the placement math (drag delta -> percentage, clamping,
      zero-overflow axis, scale bounds).
- [ ] F2. Component tests for the reposition dialog: drag changes the value,
      zoom changes the value, reset restores, cancel discards, save commits.
- [ ] F3. Component tests proving the background layer renders in the preview
      and on the public profile, and that overlay/blur reach the DOM.
- [ ] F4. API unit tests (B7).
- [ ] F5. Contract test (A7).
- [ ] F6. e2e journey: set a banner, reposition it, set a background, tune it,
      save, reload, and assert the values on the PUBLIC profile.
- [ ] F7. `node scripts/guardrails/pre-push.mjs` prints `guardrails PASS`.
- [ ] F8. No test was weakened, skipped or deleted to get green.

## G. Proven in a real browser (Playwright CLI)

- [ ] G1. The e2e journey passes against a real api + web (`npx playwright test`).
- [ ] G2. Screenshots exist showing: the banner reposition dialog, a
      repositioned banner on the public profile, and a visible background image
      on the public profile.
- [ ] G3. No console errors and no unexpected 4xx/5xx during the run.
- [ ] G4. Both themes checked (light + dark).
- [ ] G5. The drag journey runs at a phone viewport, not only at 1440x900.
- [ ] G6. "Is it visible" is proven by PIXELS, not by `isVisible()` — which
      only means "in the DOM with a box" and passed throughout the whole time
      the background was painted underneath an opaque wrapper.

---

## Evidence recorded during implementation

- `node scripts/guardrails/pre-push.mjs` → `guardrails PASS`
- `npm run test --workspace=web` → 77 files, all tests passing
- `npx playwright test --project=desktop e2e/journeys/05-profile-appearance.spec.ts`
  → 12 passed
- `npm run visual:run -- scripts/visual/scenarios/banner-background-position.scenario.mjs`
  → 11 assertions passed, 9 screenshots, 0 console errors, 0 bad requests
- Two defects were found by those runs and fixed, both with regression tests:
  1. an `<img>` is natively draggable, so the drag fired `pointercancel` two
     moves in — `draggable={false}` on `PlacedImage`;
  2. the public profile's `<main>` established no stacking context, so the
     `-z-20` background layer painted underneath the opaque page wrapper and had
     never been visible at all — `isolate` on `<main>`, plus a `fixed` layer so
     the photo covers the viewport rather than a 1152px column.

### Known failures that are NOT this change

- `apps/api` `search.e2e.test.ts` (5 tests) and e2e journey 03 (2 tests) fail on
  this machine: the seeded resume embeddings do not clear
  `SEARCH_MIN_SIMILARITY`. Verified by running the same test at the base commit
  `39c3c4e` in a throwaway worktree — it fails there too.
- `scripts/visual/scenarios/public-profile.scenario.mjs` reports the 404 it
  deliberately provokes (an unknown username) as a bad request. Pre-existing;
  that scenario is untouched here.


---

## Second pass — fixes applied after the first audit

The first verification pass found three blocking defects. All three are fixed,
each with a regression test:

1. **The editor frame was 3:1, which is not a shape the banner is ever
   published at.** The cover is `h-44` (176px) across a card whose width is the
   viewport's: 6.36:1 on a desktop, 2.13:1 on a 390px phone. A subject placed at
   the top of a 3:1 frame was cropped clean out of the desktop cover — the
   reported bug, one step downstream. The editor now drags in the taller of the
   two shapes and draws the narrower one over it as a labelled **safe area**
   that moves with the photograph (`safeAreaRect`, `visibleImageRect`).
2. **The profile card is `w-full` inside the page column, so the background
   photo only showed in the gutters** — 160px on a desktop, nine pixels on a
   phone. With a background set the card is now frosted glass in both themes,
   and the phone case is proven by a pixel diff taken *inside* the card.
3. **The veil and blur sliders sat ~370px below the bottom of the "live"
   preview**, so the preview was off screen at the moment either was used. The
   preview is now `sticky` at the top of the dialog's scroll container.

Also addressed: the visual scenario is un-ignored in `.gitignore` (it carries
the only paint-proof in the repo), the e2e imports `ProfileAppearance` from
`@repo/schemas` instead of re-declaring it, the drag journey is tagged
`@responsive` so it also runs on a Pixel 7, arrow-key nudges announce the new
position through an `aria-live` read-out, the hint pill moved off the centre of
the photo, and the two floating overlay controls share one class definition.


---

## Third pass — fixes applied after the second audit

The second verification pass confirmed fixes 1 and 2 and found fix 3 had not
landed. Three more defects, all fixed:

1. **The sticky preview was painted UNDER the two upload tiles.** `FileUpload`'s
   drop zone is `relative`, so it is a positioned sibling later in the DOM with
   `z-index: auto` — and two such siblings paint in document order. 0% of the
   preview reached the screen at 1440px. Fixed with `z-[5]`: above the tiles,
   below the dialog's `z-10` close button. The scenario now HIT-TESTS the
   preview's whole rectangle with `elementFromPoint` while the veil slider is in
   view (100.0% unobstructed) and separately checks the close button is still
   clickable.
2. **The frosted card dropped the profile's two weakest text lines under AA.**
   `@handle` and the location line are `zinc-600`/`zinc-500`, measured at 4.83:1
   against the SOLID card — no headroom to spend on translucency, and 2.6:1 at
   the worst composite. They now step up to `STRONG_META`
   (`text-zinc-700 dark:text-zinc-200`) whenever there is a photo underneath,
   which holds >= 5.1:1 across the entire veil range in both themes against a
   pure-black or pure-white photograph. The scenario measures it through a 1x1
   canvas (Tailwind v4 emits `oklch(...)`, which a numeric regex reads as
   near-black and turns every contrast number into fiction) and stops the
   composite at the frosted card so the photograph's extremes are what the text
   is judged against. **Verified to fail** when the colour is reverted.
3. **The phone paint-proof proved nothing.** It compared "background set"
   against "background removed", which also swaps the card's own material from
   frosted to opaque — so it would have passed even if nothing showed through
   the card. Replaced with a same-card A/B: two different photographs, identical
   appearance, same clip inside the card.

Also: the frosted material is now `SURFACE_PROFILE_GLASS` in
`shared-components/surface.ts` rather than a fourth inline fork, and the two
stale "3:1" doc comments are gone.


---

## Fourth pass — fixes applied after the third audit

The third pass confirmed the safe area and the contrast work, and found three
more defects:

1. **The in-form live preview had no frosted card at all** — the name and handle
   were painted straight onto the photograph, 1.19:1 against a dark one, on the
   one screen the veil slider lives on. It now builds the same stack the
   published page does (photo → frosted card → content) and uses the same
   `SURFACE_PROFILE_GLASS` and the same stronger metadata grey.
2. **`FileUpload`'s floating controls escaped onto the sticky preview.** The
   drop zone was `relative` with `z-index: auto` — no stacking context — so its
   `z-10` Remove and Reposition buttons painted over the preview above them
   (94.2% survived at 390px, the rest was two pills on the owner's face).
   `isolate` on the drop zone contains them.
3. **The phone paint-proof was a timing race that measured the wrong thing.**
   Its hardcoded probe landed on an opaque block and only "passed" because the
   screenshot caught the blocks' entrance animation mid-fade. It now waits for
   every finite animation to finish and locates a patch of card that no block
   covers by hit-testing for an unbroken transparent path. **Verified to fail**
   when the card is made opaque.

Also: the header description steps up with the rest of the metadata over a photo
(`zinc-300` measured 4.42:1, just under AA); `hasBackground` is decided by
`safeImageUrl` in all four places rather than three different truthiness checks;
the in-form preview shell uses the house `SURFACE`; and the banner help text now
says plainly what the dimmed edges mean.

The scenario ends with the user story asserted directly, from an independent
derivation off the live DOM: after dragging the subject into the lit band, the
published cover shows image rows 0–10.5% on a desktop (6.35:1) and 0–31.5% on a
phone (2.11:1) — both containing the subject, from one stored focal point.
