# Nightly loop memory

Written by each iteration, read by the next. This is prose on purpose:
the things worth carrying forward do not fit a schema.

**Append, do not rewrite.** An iteration that deletes a previous
iteration's note has destroyed the only copy.

Keep it under ~400 lines. When it grows past that, collapse the oldest
entries into a single 'Established facts' bullet list at the top rather
than dropping them.

## Established facts

- Stack: docker postgres (linkhub-postgres-dev) + redis, both healthy.
- DB `linkhub_dev`, user `linkhub_user`, ~307 users / 301 resume embeddings seeded.
- Seed password for every seeded account is `12345678`.
- Dev servers: api :3333, web :5173. The orchestrator keeps them up; do not restart them.
- e2e harness: `playwright.config.ts` + `e2e/support/*` + `e2e/journeys/*.spec.ts`.
- Run the suite with `npx playwright test --project=desktop` (add `--project=mobile` for @responsive).

### Budget the recruiter search quota

`POST /resumes/search` is quota-guarded by `AI_QUOTA_RECRUITER_SEARCH_DAILY`
(default **30/day/user**) and each call costs a query-conversion completion
plus an embedding. Journey 03 alone spends ~3 real searches per desktop run.
A HUNT lane that re-runs the suite in a loop WILL exhaust the recruiter
account's daily quota and every later search will fail for a reason that is
not a product bug. Drive loading/empty/error states with `page.route` mocks
and spend real searches only where relevance itself is under test.

### Known harness facts

- `@repo/schemas` cannot be imported from a Playwright spec: its `exports`
  map declares only an `import` condition and Playwright's TS loader emits
  CommonJS. Specs import `../../packages/schemas/dist/index.js` directly, so
  they depend on `npm run build:schemas` having run first.
- A first-ever visit to `/dashboard/search` makes Vite optimize the
  TensorFlow.js dep and answer with a full page reload; a submit in that
  window is silently discarded. This is a dev-server artifact, NOT a product
  bug — do not file it. `openSearchPage()` in journey 03 handles it.

## Iteration log

### Iteration 1 — BOOTSTRAP (2026-08-22)

**CRITICAL: ports 3333 and 5173 are NOT the LinkHub dev servers.** Both are
being served by an entirely unrelated project, `weg/retro-doc` (package.json
name `"boilerplate"`, page title "Retro Doc — WEG"), running via
`turbo run dev --parallel` from `/home/gabriel/Documents/www/weg/retro-doc`
(pid 945288+ started 13:09, still up). Proof:
- `curl -X POST localhost:3333/auth/login` → 404 `Route POST:/auth/login not
  found`, even though `apps/api/src/infra/http/routes/index.ts:65` registers
  that exact route with no prefix (as well as at `/api/v1/auth/login`).
- `curl localhost:3333/docs/json` → an OpenAPI doc whose paths are
  `/api/v1/products/{productId}/jira/oauth/authorize` etc. — Jira OAuth routes
  that do not exist anywhere in this repo.
- `curl localhost:5173` → HTML titled "Retro Doc — WEG", not LinkHub.
- `ss -tlnp` confirms both ports are bound by node processes whose cwd is
  `weg/retro-doc`, not `linkhub-v.1`. No process anywhere is running
  `linkhub-v.1/apps/api` or `apps/web`.
- The 3333/5173 collision is very likely NOT coincidence tied to LinkHub
  specifically — 5173 is Vite's own default port and 3333 is a conventional
  alt-API port — retro-doc just happens to default to the same two numbers
  this repo's orchestrator also assumes are free.

**Consequence:** the orchestrator's premise ("Dev servers are ALREADY
RUNNING... do not restart them") is false right now. No e2e test, no manual
UI check, no live API call against LinkHub can run tonight. `npx playwright
test --project=desktop` fails at the [setup] step (`authenticate recruiter` /
`authenticate developer`, both HTTP 404 against the wrong app) before a single
real spec runs — 0 of 42 tests are meaningful signal.

**What I did NOT do:** did not attempt to start LinkHub's own dev servers
(the ports are occupied, a bind would just fail; also not this iteration's
job per the standing instruction), and absolutely did not touch or kill the
retro-doc processes — that is unrelated, apparently-live work belonging to
another project entirely, not mine to stop.

**Gate baseline (code-only, does not depend on the dev servers) — GREEN:**
```
npm run build:schemas   → clean tsc build
bash db-manage.sh status → linkhub-postgres-dev + linkhub-redis-dev both "healthy"
node scripts/guardrails/pre-push.mjs → guardrails PASS
  (i18n-parity: skipped, no locales yet, as expected)
```

**Unit/integration baselines (do not depend on the dev servers either — they
spin their own in-memory Fastify instance via build-test-app.ts) — ALL GREEN:**
- api: 104 test files, 869 tests passed, 0 failed.
- web: 47 test files, 436 tests passed, 0 failed.
- @repo/schemas: 6 test files, 105 tests passed, 0 failed.
- training: 9 files / 87 tests passed. extractor: 6 files / 100 tests passed.
  (both ran as part of the gate's turbo affected-test pass)

These numbers are today's real baseline for REGRESSION comparisons — they are
NOT the `seed_baseline` recorded at hand-off (that only covered the e2e
totals). No unit-test regression exists yet; nothing was touched.

**e2e: could not baseline.** Aborted after confirming the auth.setup.ts
failures are a wrong-server artifact, not product bugs — see above. Did NOT
add these as QUEUE candidates (not a LinkHub code issue, zero relation to
`seed_baseline`'s 7 known e2e failures) and did NOT touch any of the 7
already-`confirmed` bugs or the `seed_baseline` block itself.

**docs/qa/ tree: bootstrapped**, since it did not exist. Created per
`.claude/skills/qa-report/references/qa-docs-layout.md`: `README.md` (area
codes, start-the-stack, relationship to `.nightly/`), `personas.md` (the 5
LinkHub seed personas — Nina/Diego/Priya/Atlas/Sam — copied and adapted from
the skill's reference, which already writes them for this exact product),
`templates/{scenario,bug,charter,report}.md` (copied from the skill assets),
and `.gitkeep` placeholders in `scenarios/`, `journeys/`, `charters/`,
`bugs/`, `reports/`, `automation-backlog/`. Appended the
`docs/qa/state.csv` / `docs/qa/evidence/` gitignore block (the repo already
had `docs/qa/sessions/` ignored from an earlier plan — left it, did not
investigate whether it's stale). Deliberately did NOT do Steps 2-7 of the
skill (journey flowcharts, scenario derivation, session charters, bug
registry population) — that's substantial standalone work; scaffolding the
tree so a future cycle can build on it was the right scope for tonight,
especially with the dev-server blocker eating the session.

**Next-phase decision: REPORT, not HUNT.** HUNT is a live-browser/live-API
hunt against the running app; there is no running app to hunt against. Every
minute spent trying would burn the deadline against the wrong target. The
human needs to either stop retro-doc's dev servers or move LinkHub's to
different ports before any further nightly work is meaningful. This is
reported, not filed as a QUEUE candidate, because there is no code fix in
this repo for "a different repo's dev server is running on my dev ports."

**Addendum, same iteration:** partway through, `scripts/nightly/run.sh` and
`scripts/visual/run.mjs` changed on disk (not by me) to add exactly this
protection — a `verify_is_linkhub()` preflight probe (checks
`GET /profile/__nightly_probe__/posts` for a real LinkHub response instead of
Fastify's "Route ... not found"), a FATAL early-exit before the gate even
runs if the wrong app owns the ports, and `--api-port`/`--web-port` overrides
that thread through `PORT`/`WEB_APP_URL`/`VITE_API_URL`/`--port --strictPort`
so LinkHub can run on alternate ports when 3333/5173 are taken. This
iteration's run was launched under the OLD script (no such check), which is
why it reached BOOTSTRAP against the wrong app at all — a fresh `run.sh
start` from here should refuse to launch further iterations until the
conflict is resolved, or should be re-run with `--api-port`/`--web-port` once
someone verifies retro-doc still needs 3333/5173. Left both files uncommitted
— they are someone else's in-progress edit, not this iteration's.

### Iteration 2 — REPORT (2026-08-22)

**Re-verified the blocker before writing about it.** At REPORT time, hours after
iteration 1, ports 3333/5173 were STILL `weg/retro-doc`
(`<title>Retro Doc — WEG</title>`; `GET /profile/__nightly_probe__/posts` → 404
"Route ... not found"). So this was not a transient startup race — the conflict
persisted for the whole run. Worth repeating for any future REPORT: re-probe
rather than restating the previous iteration's finding as current fact.

**Wrote two documents:**
- `docs/qa/reports/2026-08-22-nightly.md` — follows `docs/qa/templates/report.md`
  exactly (that template is the tree's contract; read it before writing, it has a
  fixed section order and a Final Status block with mandatory parity-gaps and
  not-visually-verified lines). Verdict: **not ready**.
- `docs/nightly-loop.md` — APPENDED `## Run 2026-08-22 — results and gains`. Did
  not touch the design sections above it.

**Guard evidence, for anyone comparing future runs:** `history[]` had exactly one
entry (iteration 1, `BOOTSTRAP → REPORT`, `ok`, 9m14s, 2.6643 plan-units). NOT ONE
bounded guard fired — not the cost cap, not the 3600s timeout, not deadline
routing (471 min were still left), not three-strikes fix, not three-strikes
failure, not illegal-transition refusal. The only guard that engaged was the
unbounded "dead dev server" health check, and it engaged WRONG: it asked "is
anything listening?" instead of "is this LinkHub?".

**Honesty call worth carrying forward:** the queue's 7 confirmed + 10 candidates +
1 rejected all predate iteration 1. I reported them as carried-in, with an
explicit "this run neither found nor re-verified any of them" line, rather than
letting the morning table imply the loop found them. A REPORT that inherits a
seeded queue must say so or it takes credit for a hand-off.

**Also could not report:** iteration 2's own cost. `.nightly/STATE.json` is written
before the iteration closes, so a REPORT can never quote its own spend. Said that
in the doc instead of estimating.

**Did NOT touch** the two uncommitted files (`scripts/nightly/run.sh`,
`scripts/visual/run.mjs`) — still someone else's in-progress edit. Recommended in
the report that they be reviewed and committed FIRST, since the
`verify_is_linkhub()` preflight they add is exactly what would have turned this
wasted night into a five-second FATAL. Committed only `docs/` and `.nightly/`.

**QUEUE.json unchanged this iteration** — REPORT observes, it does not triage. The
`counters` block in STATE.json still reads all-zero while QUEUE.json holds 18
entries; that mismatch is pre-existing (the seeded queue never went through
counter-incrementing phases) and I left it rather than hand-editing state.

**Late-breaking, same iteration (REPORT):** while I was writing, commit `60547b7`
("refuse to QA the wrong app, and support alternate ports") landed — a human/other
process committed the two previously-uncommitted files AND swept my
`docs/qa/reports/2026-08-22-nightly.md` into that same commit. So HEAD moved from
`3c2b571` to `60547b7` mid-iteration. **LinkHub is now genuinely up on api 3344 /
web 5273** — verified, not assumed: `GET :3344/profile/__nightly_probe__/posts`
returns LinkHub's own `{"error":"RESOURCENOTFOUND","message":"User with identifier
'__nightly_probe__' not found"}` envelope rather than Fastify's route-not-found,
and `:5273` titles `LinkHub`. 3333/5173 are still retro-doc.

I re-probed and rewrote both documents' recommendations rather than shipping a
morning briefing that told the human to do work already done. **Lesson for any
REPORT iteration: re-verify the blocker and re-check `git log` immediately before
committing.** A report is a snapshot of the world at commit time, not at the time
you started writing it, and on this machine the world moved twice in ten minutes.

`60547b7` also claims two more real bugs found while wiring the ports
(`playwright.config.ts` hardcoding `npm run dev:api` → EADDRINUSE; `scripts/visual/
run.mjs` aborting the app's own requests because `cli.config.json`'s origin
allowlist names 5173/3333 literally) and "12 e2e tests passing on 3344/5273".
I recorded that as reported-not-verified, and flagged that the commit landed
unreviewed. Next run should read it before trusting the harness it changes.

**Next run should use:**
`bash scripts/nightly/run.sh start --hours 8 --fresh --api-port 3344 --web-port 5273`
