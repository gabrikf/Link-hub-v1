# BUG-20260823-handle-slash-breaks-profile: the web drops the URL encoding of a handle, so a profile the api serves happily is permanently unreachable from its own page

- **Status:** confirmed (triaged at iteration 69, queued behind BUG-20260823-email-case-splits-account)
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
