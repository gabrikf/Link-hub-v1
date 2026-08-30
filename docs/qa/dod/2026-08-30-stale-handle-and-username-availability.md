# DoD — stale profile handle, legacy `/profile/:username`, and username availability

Source: a production report on 2026-08-30, plus three follow-up requirements from
the same conversation. Written to be checked by somebody who did not do the work:
every line is a claim about the repository at `HEAD`, with the file that should
prove it. **"Tests exist" is not the claim — "the test fails without the fix" is.**

Production evidence for the original report (Grafana Cloud Loki,
`{service_name="crafthub-api"}`, 2026-08-30):

| Time (UTC) | Request | Status |
|---|---|---|
| 03:22:08 | `GET /profile/marianamanfrinn` | 404 ← the reported screen |
| 03:23:47 | `PUT /profile` (rename) | 200 |
| 03:25:30 | `GET /profile/marianamanfrinn` | 404 |
| 03:25:36 | `GET /profile/marianamanfrinn` | 404 |
| 03:30:28 | `GET /profile/marianamanfrin/posts` | 200 |

---

## 1. "Public profile" must open the owner's profile, not a 404

- [ ] **1.1** The cause is named and fixed at the root: `userInfo` in
  `localStorage` was written at sign-in and never reconciled, while the nav
  builds `/$username` out of it. → `apps/web/src/lib/user-info-store.ts`
  exposes `syncUserInfo`, which merges the server's `username`/`name`/`userPhoto`
  onto the stored identity and **does nothing when signed out**.
- [ ] **1.2** Boot reconciles, so a device that is ALREADY stale heals on its
  next load with no sign-out. → `apps/web/src/lib/app-boot.ts` `resolveSession`.
- [ ] **1.3** A failed `/me` must NOT blank the stored identity.
- [ ] **1.4** Tests. Only the first goes red without the fix; the rest are
  guards, and are listed as guards rather than dressed up as regressions:
  - RED BEFORE / GREEN AFTER: `apps/web/src/lib/app-boot.test.ts` — "adopts the
    handle the server currently reports"
  - GUARD: same file, "keeps the stored identity when /me cannot be fetched" —
    passes with the fix removed, and exists so a future reconciliation cannot
    start blanking the identity on a failed request
  - `apps/web/src/lib/user-info-store.test.ts` — merge, preserved `id`/`email`,
    signed-out no-op

## 2. A rename must change the handle EVERYWHERE, at once

Reported symptom: the dashboard said `@mariana` while the drawer still said
`marianamanfrinn`.

- [ ] **2.1** Saving the profile updates the persisted identity immediately, in
  the same session. → `apps/web/src/features/dashboard/pages/dashboard-page.tsx`,
  `updateProfileMutation.onSuccess`.
- [ ] **2.2** Every reader of the stale value is covered — the nav link, the
  nav's active-state comparison, the drawer identity block, and the Sentry user
  context. `grep -rn "userInfo\." apps/web/src` should surface no reader that
  still shows a pre-rename handle.
- [ ] **2.3** Tests. They do NOT carry equal weight and are not presented as if
  they do:
  - RED BEFORE / GREEN AFTER:
    `apps/web/src/features/dashboard/pages/dashboard-rename-syncs-identity.test.tsx`
    — drives the real UI (open Edit profile → change username → Save) against
    the REAL store
  - CHARACTERISATION: `apps/web/src/shared-components/top-bar-nav-handle-sync.test.tsx`
    — calls `syncUserInfo` directly and asserts the link href, drawer text and
    `aria-current` all move. Nothing in this change could break it except
    deleting the action; it documents which readers are rename-sensitive

## 3. Links shared before the short-URL change must keep working

- [ ] **3.1** `/profile/:username` resolves the profile again, by redirecting to
  `/:username` with `replace: true`. → `apps/web/src/router.tsx`,
  `legacyProfileRoute`.
- [ ] **3.2** The redirect cannot deposit a visitor on an app route: a reserved
  handle 404s instead (`/profile/dashboard` must not open the dashboard), in any
  case, and with a slash or percent in the handle.
- [ ] **3.2b** The redirect carries the QUERY STRING and the FRAGMENT. A link
  shared two months ago is exactly the kind with `?utm_source=` on it or an
  `#anchor` in it, and `redirect()` drops both unless passed explicitly.
- [ ] **3.3** The old assertion that pinned `/profile/ada` to the 404 screen was
  REPLACED, with the reversal explained in the test — not deleted silently.
  → `apps/web/src/router.test.tsx`.
- [ ] **3.4** The redirect test fails without `legacyProfileRoute`.

## 4. Tell the user whether a username is free, while they type

- [ ] **4.1** Contract first: `usernameAvailabilityQuerySchema` /
  `usernameAvailabilitySchema` live in `@repo/schemas`
  (`packages/schemas/src/profile/index.ts`), not in the api or the web.
- [ ] **4.2** The check agrees with the SAVE: same `findByLogin` predicate, plus
  the reserved-name rule the save's schema enforces. A name reported free must
  survive `PUT /profile`. → `CheckUsernameAvailabilityUseCase`.
- [ ] **4.2b** …including whitespace. The handle is trimmed on the SHARED schema
  (`updateProfileSchemaInput`, `usernameAvailabilityQuerySchema`,
  `createUserSchemaInput`), so the check cannot answer about `ada` while the
  save stores `" ada "` — a login whose profile would live at `/%20ada%20`.
- [ ] **4.3** `reason` distinguishes `taken` from `reserved`.
- [ ] **4.4** The owner's OWN handle reads as available to them (viewer-aware),
  so an untouched form is never told its own name is taken.
- [ ] **4.5** The route answers anonymous callers, and an unusable token
  degrades to the anonymous answer rather than 401.
  → `GET /username-available` in `profile-controller.ts`.
- [ ] **4.5b** It carries a per-route rate limit. It leaks nothing
  `GET /profile/:username` does not, but it is a far cheaper oracle — one
  indexed lookup against that endpoint's whole layout assembly — so the global
  limit alone is not the right ceiling.
- [ ] **4.6** The browser debounces — one request for a handle typed in one go,
  not one per keystroke. → `use-username-availability.ts`.
- [ ] **4.7** A FAILED check reads as "unknown", never as "available".
- [ ] **4.8** Every new user-visible string goes through `t()` and exists in all
  three locales.
- [ ] **4.9** Tests, api and web:
  - `check-username-availability.use-case.test.ts` (10)
  - `username-availability.e2e.test.ts` (6, hermetic, parses the response
    through the shared schema)
  - `dashboard-profile-username-availability.test.tsx` (7) — verified 6 red
    before the feature existed

## 5. Deployment questions asked with the report

- [ ] **5.1** Migrations in production: answered with evidence, not assumption.
- [ ] **5.2** Pipeline gaps: answered, and the answer distinguishes gaps that
  caused this bug (none) from gaps that exist anyway.

## 6. The gate

- [ ] **6.1** `node scripts/guardrails/pre-push.mjs` prints `guardrails PASS`.
- [ ] **6.2** No `.skip`, no `eslint-disable`, no `any`, no widened schema, no
  `--no-verify` anywhere in the diff.
- [ ] **6.2b** No comment in the diff's blast radius still describes the OLD
  behaviour. Reversing the `/profile/:username` decision falsified two
  docblocks that were written to explain it (`router.tsx`,
  `packages/schemas/src/reserved-usernames/index.ts`); in a codebase that
  carries its reasoning in comments, leaving those is a defect.
- [ ] **6.3** Existing tests were not edited to make the change pass. The two
  exceptions are declared: the router assertion in §3.3 (a behaviour reversal
  the user asked for) and a QueryClientProvider added to two form test harnesses
  (no assertion changed).

---

## Verified independently

An agent that did not do the work checked every item above against the tree,
including reverting each source fix to confirm its test actually goes red. What
it found — a redirect that dropped query strings and fragments, a check/save
whitespace divergence, two comments left describing the reversed behaviour, a
mock that made a passing test silently exercise a failure path, a false
justification in a docblock, and an unrated-limited new endpoint — is fixed
above and folded into the items as 3.2b, 4.2b, 4.5b and 6.2b. Two of its
findings were about the CHECKLIST overclaiming rather than the code (items 1.4
and 2.3), and are corrected in place rather than argued with.
