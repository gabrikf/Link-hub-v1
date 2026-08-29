# BUG-20260822-links-url-scheme: a profile link can be saved as `javascript:` or `data:` — the public profile stores and serves it unchecked

- **Status:** verified (fixed `66db662`, independently reviewed at iteration 15)
- **Impact (user-side):** Trust-Damage
- **Severity:** High · **Priority:** P1
- **Persona Affected:** Sam, the reader who arrives cold (the person a stored-XSS payload would land on); Diego owns the surface that stores it
- **Journey Step:** J-link-sharing, the step where the developer adds a link that strangers will click
- **Theme:** n/a (validation, not visual)
- **Scenarios:** none yet
- **Found:** 2026-08-22 · **Report:** docs/qa/reports/2026-08-22-nightly.md
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` `confirmed[]`, carried in from a prior hand-off; **re-reproduced from scratch** in run `2026-08-22T18:58:46.702Z`, iteration 7 (TRIAGE), which also **re-rated it from `blocker` to `major`** — see "Severity, argued" below.

## Summary

Nothing stops a user from saving `javascript:alert(1)`, `data:text/html,…` or
`vbscript:…` as a profile link. The api accepts it, the database keeps it
verbatim, and the public profile serves it to every stranger as the `href` of a
link they are invited to click.

Today nobody is actually harmed: React 19 refuses to render a `javascript:`
href as a live URL, and mainstream browsers have blocked top-level navigation to
`data:` URLs for years. The defence is therefore entirely other people's code.
The moment this profile is rendered by anything that is not React 19 — a
server-rendered preview, an email digest, a mobile client, a `dangerouslySetInnerHTML`
somewhere in a future block type — the stored payload becomes live stored XSS
against every visitor to that profile.

## Severity, argued

Triage re-rated this from `blocker` to `major`, deliberately, and the reasoning
should survive the re-rating:

- Nothing private leaks today, no journey is blocked today, no data is lost
  today — the three things the nightly loop calls a blocker. Rating it a blocker
  would have been severity inflation used to force queue position.
- It is still worth fixing the same night, because the fix is three one-line
  changes to a schema and the repo **already contains the correct validator**.
  The cost of fixing is far below the cost of being wrong about which renderer
  touches this data next.

## Reproduction

- **Charter:** none yet · **Tour:** the-hostile-input tour
- **Environment:** schema level, no browser needed · `packages/schemas/dist` built from branch tip `dae39f4`

1. `npm run build:schemas`
2. Parse a link payload with a dangerous scheme:
   ```js
   createLinkSchemaInput.safeParse({ title: "x", url: "javascript:alert(1)" }).success
   ```
3. It returns `true`. So does `JaVaScRiPt:`, `data:text/html,<script>alert(1)</script>`,
   `vbscript:msgbox(1)` and `ftp://x.com/a`. `updateLinkSchemaInput` accepts all five too.
4. The same five strings through `httpUrlSchema` — the validator that already
   exists in this repo — are **rejected**, and `https:`/`http:` are accepted.
5. End to end: sign in, add a link with url `javascript:alert(1)`, `POST /links`
   returns `201` and stores it; `GET /profile/:username` serves it;
   `apps/web/src/features/profile/components/profile-blocks.tsx:247` renders
   `href={link.url}` with no filtering.

**Expected:** only `http(s)` URLs are accepted for anything that reaches an
`<a href>` on a public page.
**Actual:** every scheme is accepted, at create and at update.

> ⚠️ When re-running step 2, the field is **`title`**, not `label`. A wrong field
> name makes every case reject for the wrong reason and looks like the bug is
> gone. That cost triage one cycle.

## Evidence

- `.nightly/evidence/BUG-20260822-links-url-scheme/i7-schema-accepts-dangerous-schemes.json` — the seven-case matrix: `createLinkSchemaInput` / `updateLinkSchemaInput` / `httpUrlSchema` side by side.
- `.nightly/evidence/BUG-20260822-links-url-scheme/i13-schema-accepts-dangerous-schemes.json` — the same matrix reproduced **independently** at iteration 13, against `packages/schemas/dist` built from the current branch tip. Both input schemas still accept all five dangerous schemes; `httpUrlSchema` still rejects all five.
- Iteration 13 also traced the write path with no server needed and found **no sanitiser at any layer**: `apps/web/src/features/dashboard/lib/link-form-schema.ts` derives the browser resolver from `createLinkSchemaInput` (so the client gate is literally the same broken one), `apps/api/src/infra/http/controllers/links/links-controller.ts` validates with it, and `apps/api/src/core/use-case/links/create-link-use-case/create-link.use-case.ts` passes `input.url` straight into `LinkEntity.create`. Fixing the schema therefore fixes the browser and the api in one change.
- Independent read path: `SELECT count(*) FILTER (WHERE url !~* '^https?://') FROM links` → **0 of 1** rows in the dev database are non-http today, so no existing row would start failing when the response schema tightens. Re-run this against production data before shipping.

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** *symptom* — dangerous URL schemes are storable and publicly served. *Cause* — `packages/schemas/src/links/index.ts` validates with a bare `z.string().url()` in three places (`linkSchema.url`, `createLinkSchemaInput.url`, `updateLinkSchemaInput.url`), and `z.string().url()` accepts any scheme. The repo already has the right validator thirty lines away in `packages/schemas/src/profile-blocks/index.ts` — `httpUrlSchema` — whose own doc comment says *"Every user-supplied URL that reaches an href or media src must use this."* The links module simply never adopted it. `packages/schemas/src/posts/index.ts` already does, which is why a post's `externalUrl` is safe and a link's `url` is not.
- **Root Cause (taxonomy):** api-contract
- **Direction for the fix (decided at triage):** `url: httpUrlSchema` on the two **input** schemas — `createLinkSchemaInput.url` and `updateLinkSchemaInput.url` — then `npm run build:schemas`. Do **not** hand-roll a scheme regex. **Leave `linkSchema.url` alone for now.** It is the **response** schema: tightening it turns any pre-existing non-http row into a failed serialization, so one bad row would 500 the whole profile — a strictly worse harm than the latent one being fixed. The dev database has zero such rows, but this run cannot see production data, and the two input schemas are the entire path by which a *new* bad row can be created. Tightening `linkSchema` is a separate task that starts with a production data check.
- **What actually shipped:** `createLinkSchemaInput.url` and `updateLinkSchemaInput.url` now use `httpUrlSchemaWith("Invalid URL format")`. The message argument exists because dropping in the bare `httpUrlSchema` replaced the user-visible *"Invalid URL format"* wording that `apps/web/src/features/dashboard/components/dashboard-link-form.test.tsx` already asserts — so `packages/schemas/src/profile-blocks/index.ts` grew an `httpUrlSchemaWith(invalidUrlMessage?)` factory and `httpUrlSchema` became `httpUrlSchemaWith()`, leaving every existing caller (posts, profile, blocks, mcp) byte-identical. That existing test was **not** edited. `linkSchema.url` was left alone as triage directed, and now carries a comment saying why.
- **Fix commit:** `66db662` (red `9981b0c`)
- **Regression test:** contract test in `packages/schemas` — assert `createLinkSchemaInput` and `updateLinkSchemaInput` **reject** `javascript:`, `JaVaScRiPt:`, `data:`, `vbscript:` and accept `https:`. That test fails today. Then an api-level test via `build-test-app.ts` + `server.inject`: `POST /links` with a `javascript:` url expects `400`. `e2e/journeys/04-link-sharing.spec.ts` already asserts no live non-http(s) href renders.
- **Gate:** `guardrails PASS` (re-run independently at review).

## Verification

Reviewed at iteration 15 by an agent that did not write the fix. **Verdict:
approved.**

**Red-then-green, proved rather than read off the commit message.** At
`9981b0c` — with `npm run build:schemas` run *there* first, because `apps/api`
resolves `@repo/schemas` through `packages/schemas/dist` and a stale `dist`
would have made the api test lie:

| | red `9981b0c` | tip `66db662` |
|---|---|---|
| `packages/schemas/src/links/url-scheme.test.ts` | 12 failed \| 2 passed | 14 passed |
| `apps/api/…/links/test/links.e2e.test.ts` | 8 failed \| 1 passed | 9 passed |

The failures at red are `expected true to be false` (the schema **accepted** the
dangerous URL) and `expected 201/200 to be 400` — the symptom itself, not an
import error or a bad selector. The tests that pass at red are the `http(s)`
positive controls, which is what rules out the `title`-vs-`label` trap.

**Reviewed by hand as well as by test.**

- *Root cause, not symptom.* No type assertion, no `eslint-disable`, no `.skip`,
  no swallowed error, no timing hack. No schema widened; two narrowed.
- *The `httpUrlSchemaWith` extraction was checked, not assumed.* Against the
  built `dist`, `httpUrlSchema` still emits `"Invalid URL"` + `"Only http(s)
  URLs are allowed"`, still trims and still accepts `https:` —
  `z.string().url(undefined)` is identical to `z.string().url()`. Only the links
  inputs differ, and only in the first message.
- *No import cycle:* `profile-blocks/index.ts` imports nothing local.
- *Blast radius on the write path is complete.* `POST /links` and
  `PUT /links/:id` are the only routes carrying a `url` (reorder and
  toggle-visibility carry none), and in production code only
  `create-link.use-case.ts` calls `LinkEntity.create` / `linksRepository.create`.
  The two tightened input schemas are the whole surface by which a new row is
  written.
- *No edited tests, no scope creep.* Fix commit is 2 files, +24/−9.

**The user-visible harm is gone at a real entry point, not just in a unit test.**
Port 3333 is still the unrelated "Retro DOC API" (see iterations 11–13), so no
live curl was possible. Instead the review rendered the real `DashboardLinkForm`
with the real `zodResolver(linkFormSchema)` and typed each dangerous URL into the
URL field: the user now sees **"Only http(s) URLs are allowed"**, submit is
blocked for `javascript:`, `JaVaScRiPt:`, `data:text/html` and `vbscript:`, and
`https://github.com/gabrielk` still submits. That throwaway file was deleted.
The api side is covered by the committed `app.inject()` test, which asserts the
**repository contents** (zero rows / the unchanged https URL), not just a 400.

### Residual — accepted, and its own task

`linkSchema.url` (the **response** shape) is still a bare `z.string().url()`, and
`apps/web/src/features/profile/components/profile-blocks.tsx:247` still renders
`href={link.url}` with no render-time filter. A row written *before* this gate
existed would therefore still reach the public profile's `href`. Triage is right
that tightening the response schema instead would turn one legacy row into a
**500 on the entire profile**, which is strictly worse than the latent harm.
`crafthub_dev` is clean (`0` of `1` rows non-http, re-queried at review). Closing
this needs a production data audit plus a render-time guard — a separate task,
not a reason to hold the fix.
