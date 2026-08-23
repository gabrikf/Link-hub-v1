# BUG-20260823-handle-slash-breaks-profile: the web drops the URL encoding of a handle, so a profile the api serves happily is permanently unreachable from its own page

- **Status:** confirmed — **claimed for FIX at iteration 72**, re-reproduced there from scratch with a third independent account (see "Re-reproduction at iteration 72"). Was queued behind BUG-20260823-email-case-splits-account, which is now fixed and approved.
- **Impact (user-side):** A developer whose handle contains a path-significant character has a public profile nobody can open — including from the dashboard's own Share link
- **Severity:** Minor · **Priority:** P3
- **Persona Affected:** any developer at registration; the Login field is a bare text box with no charset rule, no hint and no example
- **Journey Step:** J-auth-register → J-public-profile
- **Theme:** both — the page never renders, so theme is irrelevant
- **Scenarios:** `public-profile.scenario.mjs` covers the route but only with ordinary handles
- **Found:** 2026-08-23 · **Report:** docs/qa/reports/2026-08-23-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` CAND-0120 (HUNT iterations 67/68, lane `journey-probe`), reproduced from scratch with triage's own account at iteration 69

## Summary

The api is innocent. It serves the profile correctly when the handle is encoded:

```
GET http://localhost:3344/profile/i69%2Fslash%2Fi699718   -> 200
GET http://localhost:3344/profile/i69/slash/i699718       -> 404   (three path segments)
```

The web page is where it breaks. The router hands the route param over already
decoded, and every public read interpolates it raw into the api path:

- `apps/web/src/lib/auth-api.ts:371` — `apiClient.get(\`/profile/${username}\`)`
- `apps/web/src/lib/auth-api.ts:675` — `/profile/${username}/resume`
- `apps/web/src/lib/auth-api.ts:874` — `/profile/${username}/work-experiences`
- `apps/web/src/lib/post-queries.ts:81` — `/profile/${username}/posts${suffix}`

None wraps `username` in `encodeURIComponent`, so the `%2F` the browser sent is
decoded away and the outgoing request changes shape.

Nothing stops the handle being chosen in the first place: the shared contract is
`login: z.string().min(1, "Login is required")` with no pattern, and the register
form adds no rule of its own.

## Reproduction

- **Charter:** none · **Tour:** the-data tour
- **Environment:** Chromium 1440×900 · nightly stack web `http://localhost:5273` · api `http://localhost:3344` (dev stack: 5173 / 3333)

1. `POST /auth/register` with `login: "i69/slash/i699718"` → **201**. Nothing
   rejects the slash.
2. `curl "http://localhost:3344/profile/i69%2Fslash%2Fi699718"` → **200** with
   the profile.
3. Open `http://localhost:5273/profile/i69%2Fslash%2Fi699718` in a browser
   (`node .nightly/probes/i69-slug-profile.mjs "i69/slash/i699718"` does exactly
   this).

**Expected:** the profile renders — or, if the handle is not allowed, the
register form says so inline the way it already does for a duplicate login.
A profile the api can serve must not be unreachable from its own page.

**Actual:** the page renders `Profile not found. Back to login`, and the network
log shows the outgoing call as
`404 GET http://localhost:3344/profile/i69/slash/i699718`.

**Controls (both from the earlier hunt, both re-checked):** an ordinary handle
renders with zero failed requests, and a handle containing a **space** renders
correctly — `%20` survives the round trip. Only path-significant characters
break, which is what points at the interpolation rather than at "unusual
handles" generally.

## Evidence

- Reproduced at triage (iteration 69) with a new account of triage's own:
  probe `.nightly/probes/i69-slug-profile.mjs`, screenshot
  `.nightly/evidence/i69-triage/slash-profile.png`, and the transcript above.
  The 404 line is the probe's own captured response, not a reading of the page.
- The four raw-interpolation call sites were re-read at triage, and the
  permissive schema (`login: z.string().min(1)`) confirmed in `@repo/schemas`.
- Earlier evidence, kept: `.nightly/evidence/i68-slug-profile/` — `README.txt`,
  `slash.png`, `space.png`, `control.png`.
- Accounts left in the dev database on purpose: `i69/slash/i699718` (triage),
  and from the hunt `i68/slash/i68b9347`, `i68 space i68b9347`,
  `i68-normal-i68c9368`.

## Re-reproduction at iteration 72 (third account, nothing taken on trust)

Triage does not inherit a verdict. The whole chain was walked again with a brand
new account, `i72/slash/i72slash18071`
(`769c48d8-f9aa-473e-87ab-642b675eeb38`), read back out of Postgres by id before
anything else was believed:

```
POST /auth/register  login "i72/slash/i72slash18071"          -> 201
psql  SELECT id, login FROM users WHERE id='769c48d8-…'       -> 769c48d8-… | i72/slash/i72slash18071
GET  /profile/i72%2Fslash%2Fi72slash18071                     -> 200   (api serves it)
GET  /profile/i72/slash/i72slash18071                         -> 404   (three segments)
GET  /profile/i72%2Fslash%2Fi72slash18071/posts               -> 200
GET  /profile/i72%2Fslash%2Fi72slash18071/work-experiences    -> 200
```

Then the page itself, `node .nightly/probes/i72-slug-profile.mjs
"i72/slash/i72slash18071" slash-profile`:

- body: `Profile not found. Back to login`
- captured response: `404 GET http://localhost:3344/profile/i72/slash/i72slash18071`
- console: one `Failed to load resource … 404`

**Control, same probe, same run:** `seed-javascript-fullstack-001` renders the
full profile with **zero** failed requests and **zero** console errors. So the
probe is sound and the difference is the handle.

Evidence: `.nightly/probes/i72-slug-profile.mjs`,
`.nightly/evidence/i72-triage/slash-profile.png`,
`.nightly/evidence/i72-triage/control-normal.png`.

Scope re-read at i72: the four raw interpolations are still the only ones. Two
neighbours were checked and are **not** in scope — `search-results.tsx:295` uses
TanStack Router's `to="/profile/$username"` with params, which encodes for you,
and `public-profile-page.tsx:156` builds the Share URL from
`window.location.href` (already encoded); its `/profile/${username}` branch is a
non-browser fallback this app never takes.

## Judgement at triage

- **Who is hurt, doing what:** a developer who typed a slash into an unlabelled
  "Login" box at signup. The product's entire point — a public profile you can
  share — is then unreachable, and the dead page explains nothing.
- **Would they notice?** Immediately, and they have no way to diagnose it. But
  reaching this needs a deliberately odd handle, which is why it is **minor**
  and not major: real reach is small.
- **Recorded debt?** No.
- **Harness problem?** No — reproduced in a real browser against the running
  stack, with the api proved correct at the same handle.
- **Is the fix riskier than the symptom?** Only if it grows. Encoding the
  handle at the four api-client call sites is a contained, testable change with
  no schema movement. **Constraining the handle at registration is a separate,
  larger decision** — it needs a documented charset and a plan for accounts that
  already hold such handles — and must not be attempted tonight.

## Test plan agreed at triage

The honest, cheapest layer is the api-client itself, where the URL is built.

1. **A unit test beside `apps/web/src/lib/auth-api.ts`** — stub the shared
   `apiClient` and assert the requested path for a username containing `/`, `?`
   and `#` is the **encoded** form (`i69%2Fslash%2Fi699718`). Cover all four
   readers: `fetchPublicProfile`, `fetchPublicResume`,
   `fetchPublicWorkExperiences` and `fetchPublicPosts` — a fix that encodes only
   the first leaves the profile's resume, work-experience and posts panels
   broken, which is exactly the failure mode this test exists to catch. Fails
   today at every one of the four.
2. Re-run `.nightly/probes/i69-slug-profile.mjs` against the account already in
   the dev database to confirm the page renders and the captured request is the
   encoded one. Not a substitute for (1); the proof that the user-visible
   symptom is gone.

**Scope discipline for FIX:** encode the handle where the URL is built. Do not
add a `login` pattern to `@repo/schemas`, do not touch the register form, and do
not migrate existing handles.

---

## Review — iteration 74, independent. **APPROVED**

Reviewed `1eed39a` (red) → `d288779` (fix). Verdict: **approved**.

### Red/green proved mechanically, not read off the commit message

Detached checkout of `1eed39a`, then `npx vitest related src/lib/auth-api.ts
src/lib/post-queries.ts --run` in `apps/web`:

```
red  1eed39a            4 failed | 195 passed (199)
green nightly/qa-hardening       199 passed (199)
```

Every red failure prints the bug's own symptom — the raw handle in the outgoing
path (`/profile/dev/with?path#chars…` where `/profile/dev%2Fwith%3Fpath%23chars…`
was expected) at all four readers. No import error, no bad fixture, no missing
mock: the tests fail for the reason the bug describes.

The control (`leaves an ordinary handle untouched`) passes on **both** sides, so
the fix could not have gone green by over-encoding every handle.

### The commits themselves

- Red commit: **107 insertions, 0 deletions** across the two test files. No
  existing test was edited to let the fix through.
- Fix commit: **2 files, +28/−6**, and nothing else — `encodeURIComponent` at the
  four URL builders plus the two comments explaining why the router link and the
  Share URL are deliberately left alone. No reformatting, no renames, no
  drive-bys.
- No `no-workarounds` signal: no type assertion, no `eslint-disable`, no `.skip`,
  no swallowed error, no timing hack.
- `@repo/schemas` untouched — no boundary shape moved and nothing was widened.
  `npm run build:schemas` then `npm run check-types` clean;
  `lint-changed.mjs` clean (6 known recorded findings ignored).

### Root cause, and blast radius

The defect is the missing **re-encode at the boundary where a decoded value goes
back into a URL**, and the fix sits exactly there. Every caller was searched:
`fetchPublicProfile` / `fetchPublicResume` / `fetchPublicWorkExperiences` have
one consumer (`public-profile-page.tsx:49,94,111`) and `fetchPublicPosts` one
(`usePublicPosts` → `profile-blocks.tsx:663`). Both receive the handle from
`useParams({ from: "/profile/$username" })`, i.e. **decoded** — so no caller
hands these functions an already-encoded value and nothing can double-encode.
The three neighbours that look similar and must stay untouched were re-read and
agreed with: `search-results.tsx:295` and `top-bar-nav.tsx:128` pass `params` to
TanStack Router (which encodes), and `public-profile-page.tsx:156` reads
`window.location.href` (already encoded).

### The user-visible symptom, re-walked on an account the fix never saw

Rather than re-run the fix author's own account, review registered a **third
independent account** carrying all three dangerous characters at once —
`i74/q?hash#i7441`, id `8107e2b6-09a2-4295-a7e1-79924fe786e6`, read back by id in
psql — and drove the real browser on **both sides of the fix**:

```
at 1eed39a  body "Profile not found. Back to login"
            bad  404 GET http://localhost:3344/profile/i74/q?hash
                 (# truncated the URL, ? opened a query string)
at d288779  body "I74 Qmark @i74/q?hash#i7441", links / resume / work-history
            panels in their proper empty states
control seed-javascript-fullstack-001  bad=[]  errs=[]
```

That closes the gap the fix commit itself flagged: `?` and `#` had been covered
only by the unit test, and are now proved end to end in a browser.

The one request still failing on those profiles —
`404 GET /profile/<encoded>/resume` — is **not** this bug and not a regression.
Verified independently rather than taken on trust: the same encoded URL 404s
straight from `curl` with no browser involved, the seed account's resume returns
200 at the same time, and psql reports **0** resume rows for the account. The
page renders the correct "has not published resume details yet" empty state.

### Not applicable, and why

Design, dark mode and the four-state rule: the diff touches two api-client
`.ts` files and contains no markup, no class string and no colour utility, so
there is nothing that could regress a `dark:` variant. The profile page's four
states are unchanged — the fix moves this profile out of the not-found state and
into the filled one.

### Accepted with the fix, not a blocker

Nothing enforces the re-encode for a *fifth* reader added later; the rule lives
in a JSDoc comment rather than in a shared `publicProfilePath(handle)` helper.
The regression test pins all four current readers, which is the agreed scope. A
helper would be a refactor with its own blast radius and is not this fix's job.

Registration still accepts any handle (`login: z.string().min(1)`), untouched on
purpose — triage ruled a signup charset a product decision for a human. This fix
stays correct whichever way that lands.
