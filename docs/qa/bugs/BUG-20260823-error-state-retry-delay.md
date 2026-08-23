# BUG-20260823-error-state-retry-delay: a failed dashboard or layout load freezes on its skeleton for 7.7 seconds before the designed error state appears

- **Status:** confirmed — **claimed for FIX at iteration 76**, reproduced from scratch in a real browser at 250ms resolution (see "Reproduction")
- **Impact (user-side):** A signed-in developer whose `/me` or `/me/layout` request fails sees an unmoving loading skeleton for ~7.7s with no feedback at all. The screen reads as frozen, not as failing — the exact impression the two approved four-state fixes were meant to remove
- **Severity:** Minor · **Priority:** P3
- **Persona Affected:** Diego (curating developer) and any signed-in developer on a flaky connection or during an api hiccup
- **Journey Step:** J-dashboard-open, J-profile-appearance (the error state of each)
- **Theme:** both — the skeleton and the error copy are theme-agnostic; the delay is timing, not styling
- **Scenarios:** none dedicated. `e2e/journeys/05-profile-appearance.spec.ts:893` already asserts this and already fails for exactly this reason
- **Found:** 2026-08-23 (run `2026-08-22T18:58:46.702Z`, REGRESSION iteration 75; reproduced independently at TRIAGE iteration 76)
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` `candidates[]`, was `CAND-0121`

## Summary

Both screens render a correct, designed error state. Neither renders it in time.

`apps/web/src/lib/query-client.ts` sets only `staleTime` and
`refetchOnWindowFocus`; it never overrides `retry`. So every query in the app
inherits TanStack Query's default — **3 retries with exponential backoff
(~1s / 2s / 4s)** — and `isError` does not become true until the fourth attempt
fails. The two queries that gate a whole-panel error branch inherit it too:

- `apps/web/src/features/dashboard/pages/dashboard-page.tsx:138` — `meQuery`,
  read by the error branch at `:757` (`DashboardProfileDisplayError`)
- `apps/web/src/.../profile-layout-page.tsx:338` — `layoutQuery`, read by the
  error branch at `:841` (`layoutQuery.isError && !full` → `LayoutLoadFailed`)

Both error components already offer the user an explicit **Retry** button, so
the silent retry storm is buying a recovery the user is separately offered — at
the cost of nearly eight seconds of a screen that looks hung.

This is **not** a regression from tonight's diff. `05-profile-appearance.spec.ts:822`
and `:893` were 2 of the 7 confirmed baseline e2e failures at iteration 1, before
either four-state fix existed, and neither page's query config was touched by
commits `91963b9` or `9ec1639`.

## Reproduction

**Environment:** nightly stack, web `:5273`, api `:3344`, signed in as
`seed.python-data.042@linkhub.local` / `12345678`. (The ports in `AGENTS.md` —
3333/5173 — are the daytime ports.)

Probe: `.nightly/probes/i76-triage-retry-delay.mjs` — a headless Chromium that
intercepts one route, fulfils it `500`, and samples `document.body.innerText`
every 250ms for the loading copy and the error copy.

```
node .nightly/probes/i76-triage-retry-delay.mjs

=== dashboard-me-500 — /dashboard, /me → 500 ===
skeleton visible at:   573ms
error copy visible at: 7730ms
/me requests: 4 at 542, 1577, 3582, 7587 ms

=== layout-me-layout-500 — /dashboard/layout, /me/layout → 500 ===
skeleton visible at:   434ms
error copy visible at: 7513ms
/me/layout requests: 4 at 382, 1406, 3410, 7414 ms
```

Four requests, not one — the initial attempt plus three retries at ~1s / 2s / 4s,
and the error copy lands immediately after the fourth fails. The measured gap
between "the skeleton is on screen" and "the user is told anything" is
**7.16s** on the dashboard and **7.08s** on the layout editor.

## Expected vs observed

- **Expected:** the failure is communicated within the few seconds a user will
  wait — or, failing that, the screen distinguishes "still trying" from "loading".
- **Observed:** an unchanging skeleton for ~7.7s, then the correct error state.

## Evidence

- `.nightly/probes/i76-triage-retry-delay.mjs` (this iteration's probe, re-runnable)
- `.nightly/evidence/i76-dashboard-me-500.png`,
  `.nightly/evidence/i76-layout-me-layout-500.png` — the screen at the moment
  the error copy finally appeared
- `e2e/journeys/05-profile-appearance.spec.ts:893` — the project's own
  pre-existing four-state regression, failing today at line 939 on
  `toBeVisible({ timeout: 5000 })` with the panel still showing its skeleton.
  Re-run in isolation at iteration 76: `2 failed, 2 passed`, and `:893`'s
  reported failure is that assertion verbatim
- Iteration 61's earlier probe of the same two routes
  (`.nightly/probes/i61-me-500-dashboard.mjs`) measured the same shape at 1s
  resolution, before the error states existed

## Judgement at triage (iteration 76)

**Who is hurt, and how much.** A signed-in developer, on any normal dashboard
visit, when the api 5xxs or the network blips. They are not blocked, lose no
data and nothing leaks — after 7.7s they get an accurate error and a Retry
button. The harm is that for those 7.7s the product looks broken rather than
honest, and a user who reloads or leaves in that window never sees the message
the team designed. Real, noticed, survivable: **minor**.

Not recorded debt (`AGENTS.md`'s debt list does not mention query retry policy),
and not a harness problem — the delay was measured in a browser against the
running app, independently of the failing e2e specs.

**Why this is confirmed when `CAND-0116` was rejected.** Iteration 61 triaged
`CAND-0116` — *"the two screens render no error state at all"* — and rejected it
`harness`, correctly: the error states exist. That verdict recorded `t=7.7s` in
passing as proof the state was reached, and never judged the delay itself
against the bar. This candidate is the narrower, separate claim, and it is the
delay that is being judged here.

**Is the fix riskier than the symptom?** Only if it is done globally. Changing
`query-client.ts`'s defaults would alter retry behaviour for search, posts,
links, tokens and every other query on the eve of a deploy — out of proportion
to a 7-second wait. Scoped to the two queries that gate a full-panel error
branch, it is a two-line change with an existing failing regression to prove it.

## Correction to the candidate as filed (CAND-0121, iteration 75)

Iteration 75 recorded that **both** `:822` and `:893` fail on the 5s error-copy
timeout. Re-run in isolation at iteration 76, that is true of `:893` only. The
two tests fail for two unrelated reasons:

| Test | Fails at | Cause |
|---|---|---|
| `:893` dashboard profile panel | line 939, `toBeVisible({ timeout: 5000 })` on the error copy | **this bug.** Its `Loading profile → toHaveCount(0)` gate is satisfied at ~0.1s (the frame before React mounts the skeleton), so the 5s error window opens immediately and closes at ~5.1s, while the error copy lands at 7.7s |
| `:822` layout editor | line 879, `toHaveCount(1)` on `Profile header block`, expected 1 / received 0 | **not this bug.** The spec still asserts the fabricated-defaults behaviour that `BUG-20260822-layout-error-fabricated` intentionally removed. It never reaches its own error assertion. Already triaged and rejected as `harness` at iteration 61 (`CAND-0116`) |

So the retry fix will turn `:893` green and will **not** turn `:822` green.
Anyone reading a post-fix run must expect `:822` to stay red until the stale
assertion at lines 875–879 is separately corrected — which is a harness task,
not this bug.

## Test plan agreed at triage

Red already exists and must be re-run first, unchanged, to prove it:

```
npx playwright test --project=desktop e2e/journeys/05-profile-appearance.spec.ts \
  -g "the dashboard profile panel renders all four states"
```

It fails today at line 939 while the skeleton is still up. **FIX must not edit
this test** — it is the pre-existing contract and its blast radius is exactly
this bug. Do not touch `:822` either; making it pass is a different task with a
different justification.

**Direction (FIX decides, this is the recommendation):** prefer a *bounded*
retry over none. `retry: false` shows an error on the first transient blip that
today recovers invisibly; `retry: 1` with a short fixed `retryDelay` keeps one
recovery attempt and still puts the error on screen in well under a second.
Apply it to `meQuery` in `dashboard-page.tsx` and `layoutQuery` in
`profile-layout-page.tsx` only — **not** to the shared `QueryClient`.

Additionally, re-run `.nightly/probes/i76-triage-retry-delay.mjs` after the fix
and record the new `error copy visible at` numbers. A green test is not the same
evidence as a measured screen.

---

## Review — iteration 78, independent. Verdict: **approved**

Reviewer did not write the fix. Reviewed `2ad3193` (red) → `77511b6` (fix).

### Red proved, not taken on trust

Detached checkout of `2ad3193`, the bug's two tests run there:

```
× DashboardPage … reaches the error state in about a second   expected 7068.469578 to be less than 1500
× ProfileLayoutPage … reaches the error screen in about a second  expected 7024.552406 to be less than 1500
  Tests  2 failed | 6 passed (8)
```

On `nightly/qa-hardening`: `367ms` / `320ms`, **8 passed (8)**.

Both red failures print the bug's own symptom — elapsed-time-to-error — so
neither is an import, selector or fixture artefact. The four pre-existing
error-state tests in the same two files pass on **both** sides, so the fix could
not have gone green by breaking the error state it was supposed to reach faster.

The red commit is **+104 / −2**; the two deletions are a prettier re-wrap of one
existing `mockRejectedValue(...)` call. No assertion was edited.

### The fix itself

`+22 / −0` across three files. No reformatting, no renames, no drive-bys, no
`.skip`, no `eslint-disable`, no type assertion, no swallowed error, no monkey
patch. `packages/schemas/**` is untouched, so no boundary shape moved and
nothing was widened. `build:schemas` + `check-types` (8/8) + `lint-changed`
(51 files, clean) all pass.

**Blast radius searched.** `queryKey: ["me"]` has two observers —
`dashboard-page.tsx:140` (policy applied) and `profile-layout-page.tsx:334`
(deliberately not) — and `["layout"]` has one. Both error branches are guarded
by absent data (`meQuery.isError && !meQuery.data`,
`layoutQuery.isError && !full`), so the shorter retry **cannot** flash an error
panel over already-loaded data when a background refetch fails.

### The user-visible harm, re-walked

The bug's own repro, `.nightly/probes/i76-triage-retry-delay.mjs`, re-run by the
reviewer:

```
/dashboard,        /me        → 500 : error copy 1125ms (was 7730), 2 requests (was 4)
/dashboard/layout, /me/layout → 500 : error copy  942ms (was 7513), 2 requests (was 4)
```

The acceptance e2e the FIX iteration never ran —
`05-profile-appearance.spec.ts:893` — passes in 5.2s.

### The fix's central claim, tested independently

`retry: 1` was chosen over `retry: false` on the argument that one quick retry
still heals a transient blip invisibly. That argument was never tested, so a new
probe tested it: `.nightly/probes/i78-review-retry-delay.mjs` fails only the
**first** request and lets every later one through.

```
/dashboard        first /me → 500, rest OK : error never shown, content at 673ms, 2 attempts
/dashboard/layout first /me/layout → 500   : error never shown, content at 409ms, 2 attempts
```

No lingering skeleton at 8s on either route. The fix did not trade a slow error
for a spurious one.

**Dark theme**, both error screens (`html.dark` true): error copy at 830ms and
749ms, console clean apart from the two intentional 500s. Evidence
`.nightly/evidence/i78-dark-dashboard-me.png`,
`.nightly/evidence/i78-dark-layout-me-layout.png`.

### Accepted with the fix — not blockers

- `meQuery` on `/dashboard/layout` still inherits the library default and made
  **4** attempts when probed. Correctly left alone: that route has no designed
  error state for a failed `/me`, and the probe shows no user-visible harm —
  the editor renders at 517ms, no skeleton lingers, no error copy ever appears.
  Applying the policy there would only make blank fields arrive sooner.
- The same query key now behaves differently per route. Harmless today (the two
  observers never mount together), worth knowing before a third observer of
  `["me"]` is added.
- Nothing **enforces** the policy for the next screen that gates an error state
  on `isError` — the exported constant and its doc comment are the whole
  mechanism. A lint rule or a shared hook is a refactor with its own blast
  radius.
- `05-profile-appearance.spec.ts:822` stays red on the stale fabricated-defaults
  assertion (`CAND-0116`, rejected `harness` at i61). Not this fix; not re-run.
