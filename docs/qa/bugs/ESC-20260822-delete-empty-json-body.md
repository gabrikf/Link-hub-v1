# ESC-20260822-delete-empty-json-body: a DELETE with `content-type: application/json` and no body is answered `400` on every api route

- **Status:** escalated — deliberately **not** fixed by the nightly loop. Re-affirmed at iteration 53 (TRIAGE) with fresh evidence.
- **Impact (user-side):** none observed in the shipped product today; latent for third-party API clients
- **Severity if confirmed:** Low (`minor`) · **Priority:** P3 — its own task, not a deploy-eve change
- **Persona Affected:** none of the three shipped personas. The exposure is an agent author writing against `/docs/json` with an HTTP client that sets a JSON content-type on every request.
- **Journey Step:** n/a — request parsing, below all five journeys
- **Theme:** n/a
- **Scenarios:** none
- **Found:** 2026-08-22 (run `2026-08-22T18:58:46.702Z`, iteration 4) · **Re-checked:** 2026-08-23, iteration 53
- **GitHub:** none — found by the autonomous nightly loop; not yet filed
- **Origin:** `.nightly/QUEUE.json` `escalated[]`, was `CAND-0109`

## Summary

Fastify answers `FST_ERR_CTP_EMPTY_JSON_BODY` — *"Body cannot be empty when
content-type is set to `application/json`"* — with a `400` whenever a request
declares a JSON content-type and carries no body. Because `DELETE` routes take
no body, any client that sets the header unconditionally gets an opaque `400`
instead of the real `200`/`404`.

This is global request-parsing behaviour, not a bug in one route.

## Reproduction

- **Environment:** nightly stack, api `:3344`, authenticated as
  `seed.go-sre.026@crafthub.local`. (The ports in `AGENTS.md` — 3333/5173 — are
  the daytime ports; `:3333` on this machine answers for an unrelated project.)

```
A  DELETE /links/<uuid>  -H 'authorization: Bearer <jwt>' -H 'content-type: application/json'
   → 400 "Body cannot be empty when content-type is set to 'application/json'"

B  same as A plus -H 'content-length: 0'          → 400 (identical)

C  same as A without the content-type header      → 404 RESOURCENOTFOUND  ← correct
```

`B` matters: adding an explicit zero content-length does **not** avoid it, so a
client cannot dodge the `400` by being well-behaved about length.

Unauthenticated, the same call returns `401`, not `400` — the auth hook runs
before body parsing, so this is not a pre-auth surface.

Iteration 4 reproduced the same behaviour on `/me/posts/:id`, `/me/tokens/:id`,
`/me/links/:id` and `/me/layout/blocks/:id`. Iteration 53 re-reproduced `/links/:id`
only; the other four were taken on iteration 4's word because the cause is the
shared parser.

## Who is actually hurt — corrected at iteration 53

Iteration 4 wrote *"the web app does not set the header on DELETE"*. **That claim
is wrong as a statement about the code** and should not be relied on: the shared
axios instance declares a default JSON content-type for **every** request —

```ts
// apps/web/src/lib/auth-api.ts
const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { "Content-Type": "application/json" },
});
```

and all six web delete callers (`deletePost`, `revokeToken`, `deleteConnection`,
`deleteLink`, `deleteTab`, `deleteBlock`, `deleteWorkExperience`) go through
`fetchWithTokens`, which passes no data and never clears that header.

The conclusion survives anyway, but on evidence rather than on a code reading:
**a real browser deleting a real link through the real UI succeeds.**

```
npx playwright test --project=desktop e2e/journeys/04-link-sharing.spec.ts \
  -g "removing a link removes it from the public profile"
→ 3 passed (7.4s)
```

That journey clicks *Delete link* in the dashboard and then asserts the link is
gone from the public profile, so the request reached the api and was accepted.
The browser XHR adapter therefore does not emit the content-type on a bodyless
`DELETE`, whatever the instance default says. `apps/mcp` has no delete tool at
all (zero `DELETE` calls).

**So: nobody in the shipped product is hurt today.** The exposure is entirely
third-party clients — and it is a confusing `400`, not data loss.

## Why it stays escalated rather than confirmed

The fix is a **global** change to request parsing: an
`addContentTypeParser("application/json", …)` that maps an empty body to
`undefined`, or per-route body relaxation. That touches the parse path of every
`POST`/`PUT`/`PATCH` on the api in order to remove a `400` that no shipped
client hits. On the eve of a deploy the fix is riskier than the symptom. Two
nights running, triage has reached the same conclusion.

## Direction, when it is picked up as its own task

1. Add the content-type parser, or relax the affected routes — one mechanism,
   not both.
2. Regression test at the HTTP layer via `build-test-app.ts` + `server.inject`:
   `DELETE` with `content-type: application/json` and no body must return
   `200`/`404`, never `400`. Add the same assertion for **one** `POST` route to
   prove an empty JSON body is still rejected where a body is genuinely required
   — that is the behaviour the current parser is protecting.
3. Re-run the whole `apps/api` suite: the risk of this change is parser
   regressions elsewhere, not the DELETE routes themselves.
4. Consider dropping the blanket `Content-Type` default from the web's axios
   instance while in there. It is currently harmless only because the browser
   adapter ignores it on bodyless requests — a fragile thing to depend on, and
   `fetchWithTokens` already needs a special case to undo it for `FormData`
   uploads.

## Evidence

- Iteration 4: live reproduction on four routes, recorded in `.nightly/MEMORY.md`.
- Iteration 53: the A/B/C matrix above, re-run against `:3344` with a fresh JWT;
  the passing real-browser delete journey; the axios default read out of
  `apps/web/src/lib/auth-api.ts`. The probe link created for the A/B/C run was
  deleted and its absence confirmed with
  `psql -tAc "SELECT count(*) FROM links WHERE title = 'i53 triage probe'"` → `0`.
