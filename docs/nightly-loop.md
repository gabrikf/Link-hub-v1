# The nightly QA loop

An autonomous overnight loop that hunts **real, user-impacting bugs** in
LinkHub, proves each one with a failing test, fixes it, and has an independent
agent review the fix before it counts.

It exists because a release-eve QA pass is bounded by two things a single agent
handles badly: **time** (nobody watches it for eight hours) and **context** (one
conversation degrades long before the work is done).

---

## The shape: a state machine on disk, a fresh agent per step

```
                    ┌──────────────────────────────────────────┐
                    ▼                                          │
BOOTSTRAP ──▶ HUNT ──▶ TRIAGE ──▶ FIX ──▶ REVIEW_FIX ──┬─ approve ─┴─▶ REGRESSION ──▶ REPORT ──▶ DONE
                ▲        ▲          ▲                  │
                └────────┘          └──── reject ──────┘
                                        (3 strikes → escalate)
```

Each box is **one iteration**. Each iteration is a brand-new `claude -p`
process with an empty context that:

1. rebuilds its context by reading `.nightly/STATE.json`, `.nightly/QUEUE.json`,
   `.nightly/MEMORY.md` and `AGENTS.md`,
2. does **one** unit of work,
3. writes what it learned back to those files,
4. proposes the next phase, and exits.

### Why a process per iteration, not one long agent

The obvious design is one agent that loops all night. It fails in a specific
way: its context fills, quality degrades, and it has to *notice* it should hand
off. "Start a new agent at 65% context" is a rule someone has to remember.

Here the reset is **structural**. Every iteration starts empty by construction,
so there is no degradation curve and no hand-off to forget. A crashed iteration
costs one unit of work instead of the night. The cost is that nothing carries
over implicitly — which is why the three state files are the real design.

| File | Shape | Why |
|---|---|---|
| `.nightly/STATE.json` | structured | The orchestrator (bash) has to reason about it: phase, iteration, budget, guards. |
| `.nightly/QUEUE.json` | structured | The work: `candidates`, `confirmed`, `fixed`, `escalated`, `rejected`. |
| `.nightly/MEMORY.md` | prose | What iterations *learned*. "The layout editor debounces saves 800ms" does not fit a schema. Append-only. |

The durable output is committed instead: `docs/qa/**` (the living QA tree) and
this file.

---

## The loop does not start from zero

`.nightly/QUEUE.json` is **seeded** before the first iteration with everything
the five journey specs found while they were being written, each one reproduced
and verified rather than taken on report. `BOOTSTRAP` and `HUNT` therefore start
by extending real work instead of rediscovering it.

Seeded at hand-off: **2 blockers, 5 majors, 9 candidates, 1 rejection.** The two
blockers both live on the public profile — the artifact the whole product exists
to produce:

- `BUG-20260822-public-posts-contract` — the api omits `metadata` from its
  public projection while the web client parses that response with `postSchema`,
  where `metadata` is required. Every profile with a published post shows
  *"Could not load posts. Please try again."* Verified by parsing a real
  captured payload from the running api through the shared schema.
- `BUG-20260822-links-url-scheme` — profile links validate with a bare
  `z.string().url()`, which accepts `javascript:`, `data:` and `vbscript:`. The
  repo's own `httpUrlSchema` rejects all of them and its doc comment says every
  URL reaching an `href` must use it. Only React 19's href guard prevents
  exploitation today, and it does not cover `data:`.

The `rejected[]` entry is as important as the confirmed ones: a cold
`/dashboard/search` visit loses its first submit to a Vite dep-optimisation
reload. That is a dev-server artifact, it does not exist in a built bundle, and
recording it as rejected stops each new iteration from re-filing it.

## The phases

| Phase | One iteration does | Legal next |
|---|---|---|
| `BOOTSTRAP` | Proves the stack, gate, e2e and unit suites, and records the **baseline** everything later is compared against. | `HUNT`, `REPORT` |
| `HUNT` | Runs **one lane** — `deep-review`, `qa-execution`, `journey-probe`, `perf-cost`, `responsive-dark`, or `disclosure` — fanning out subagents inside it. Appends candidates. | `HUNT`, `TRIAGE`, `REPORT` |
| `TRIAGE` | Reproduces every candidate, applies the real-user-impact bar, assigns severity, and claims the next bug. Rejecting is a normal outcome. | `FIX`, `HUNT`, `REGRESSION`, `REPORT` |
| `FIX` | Fixes **exactly one** bug under the two-commit protocol. | `REVIEW_FIX`, `TRIAGE`, `REPORT` |
| `REVIEW_FIX` | An independent agent tries to find why the fix should not ship — including verifying red-before-green mechanically. | `FIX`, `TRIAGE`, `REGRESSION`, `REPORT` |
| `REGRESSION` | Full gate + full e2e + unit suites, compared against the BOOTSTRAP baseline. A pass→fail flip outranks everything. | `TRIAGE`, `FIX`, `REPORT` |
| `REPORT` | Writes the QA round report and appends this file's results section. | `DONE` |

---

## The two-commit protocol

The deliverable is not "the bug is gone". It is that **red-before-green is
provable from git history**. Every fix is two commits:

```
test(BUG-20260822-slug): failing regression test for <symptom>
fix(BUG-20260822-slug): <what changed, in user words>
```

Anyone can verify any fix without trusting the agent:

```bash
git checkout <red_commit>
npx vitest related <test path> --run     # MUST FAIL
git checkout nightly/qa-hardening
npx vitest related <test path> --run     # MUST PASS
```

`REVIEW_FIX` runs exactly this, and rejects a test that passes at the red
commit — because such a test does not detect the bug — or one that fails at the
red commit for the *wrong* reason (a bad import, a bad selector), because that
proves nothing and will go green by accident.

---

## The guards

Everything that can wedge an unattended 8-hour run has a bound, and all of them
live in `scripts/nightly/state.mjs` rather than being re-implemented in shell.

| Guard | Bound | What happens |
|---|---|---|
| Per-iteration cost | `--max-budget-usd` (default $8) | The CLI stops that iteration. |
| Per-iteration wall clock | 3600s | `timeout` kills it; the iteration is closed as failed. |
| Total budget | `--budget-usd` | Routes to `REPORT` — never a hard stop with no write-up. |
| Deadline | `--hours` | Routes to `REPORT`. A night that ends with findings and no report wasted the night. Extended by any time spent waiting on a plan limit. |
| Plan usage limit | `--max-limit-wait-hours` (6) | Waits for the reset and resumes the same phase. Not counted as a failure. |
| API-key billing | — | Refused by default: the API-billing env vars are stripped from every child process. `--allow-api-billing` opts in. |
| Rejected fixes on one bug | 3 | Auto-escalates the bug, releases the claim, returns to `TRIAGE`. |
| Consecutive failed iterations | 3 | Routes to `REPORT` — the loop itself is broken, not the code. |
| Illegal phase transition | — | Refused; the iteration counts as failed. An agent does not get to reroute the night. |
| Dead dev server | — | The orchestrator health-checks :3333 and :5173 each iteration and restarts them. |
| Stale state from a previous run | — | `preflight` refuses to resume a finished or past-deadline `.nightly/` and tells you to pass `--fresh`. |

### Billing: plan tokens, never dollars

This loop is built to run on a **Claude subscription**. `claude` bills one of two
ways — OAuth against a plan, or per-token USD via `ANTHROPIC_API_KEY` / Bedrock /
Vertex — and an 8-hour unattended fan-out is the worst possible time to discover
a stray API key in your environment.

So every `claude` call goes through one wrapper, `run_claude`, which strips
`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` and `AWS_BEARER_TOKEN_BEDROCK` from
the child environment (`env -u` — your shell is untouched). Preflight prints the
route it detected before spending anything:

```
  billing: OAuth as you@example.com (billingType=stripe_subscription)
  billing: extra usage disabled — plan limits refuse rather than bill
```

That second line is the load-bearing one. With extra usage **disabled**, hitting
the plan limit *refuses* the request; with it **enabled**, the overage is charged
in real dollars. Pass `--allow-api-billing` only if you genuinely want per-token
billing.

**`total_cost_usd` is not a bill.** Claude Code always reports what the work
*would* cost at API list prices, whatever your billing mode. On a subscription
with extra usage disabled, nothing is charged — the plan window simply refuses
further requests when exhausted. So that number is a **measure of plan allowance
consumed**, and the logs call it `plan-units` for exactly that reason.

It still matters: an iteration reported at 1.05 burned roughly thirteen times
more of your 5-hour window than one reported at 0.079. `--budget-usd` and
`--max-budget-usd` cap that notional figure, which makes them a useful throttle
on allowance — just not a spending limit.

### Plan usage limits: wait, then resume

Claude plans refill on a rolling window. Hitting that limit is a **clock, not a
defect** — so the loop waits it out and resumes the same phase rather than
treating it as a failed iteration:

1. `run_iteration` returns `75` when the response looks like a usage limit
   (`usage limit`, `rate limit`, `429`, `quota exceeded`) — distinguished from a
   real crash, which still counts as a failure.
2. It reads the reset moment from the error when one is present
   (`usage limit reached|<epoch>`), and waits until 60s past it. With no
   timestamp it falls back to 30 minutes and re-checks.
3. It sleeps in **one-minute slices**, so `run.sh stop` still works during a
   multi-hour wait and the log shows the loop is alive rather than hung.
4. `note-limit-wait` records the pause, leaves `consecutive_failures` at zero,
   and **extends the deadline by the time waited** — the deadline bounds *work*,
   not wall-clock, so a reset window should not eat the hunting hours.

Total waiting is capped by `--max-limit-wait-hours` (default 6). Past the cap the
loop routes to `REPORT` so the night still produces a write-up. And if the limit
is hit *during* `REPORT` with no wait budget left, the run **ends** rather than
re-routing to `REPORT` forever against an empty plan — every finding is already
in `QUEUE.json`, and preflight will resume a stranded `REPORT` automatically on
the next start (rather than making you pass `--fresh`, which would archive the
queue and lose it).

Disable the behaviour with `--no-resume-after-limit`.

### Per-phase models

On a plan the binding constraint is your **usage allowance**, so spending the
expensive model on "run these commands and write down the output" is how a night
runs out of allowance before it runs out of bugs.

| Phase | Model | Why |
|---|---|---|
| `BOOTSTRAP`, `REGRESSION` | `sonnet` | Mechanical: run suites, record results, compare to baseline. |
| `HUNT`, `TRIAGE`, `FIX`, `REVIEW_FIX`, `REPORT` | `opus` | Judgment: finding real bugs, holding the impact bar, fixing causes, adversarial review. |

Override with `--model`, `--model-cheap`, or `--model-all <one model everywhere>`.

### Why the loop loads no MCP servers

`.mcp.json` declares a `postgres` server run through `uvx`. In print mode
`claude` answers in about two seconds — `is_error: false`, a valid result — and
then **never exits**, because the stdio MCP child keeps the parent alive. Left
alone that turns every iteration into a full `--iteration-timeout` stall
recorded as a failure, and three of those end the night.

Measured: without `--strict-mcp-config` the process ran until killed at 120s
(`duration_api_ms: 1747`). With it, `exit=0` in 55s.

So every invocation passes `--strict-mcp-config` and no MCP servers load.
`AGENTS.md` points at the postgres MCP for verifying database writes; iterations
use psql directly instead, which is equivalent for reading:

```bash
docker exec linkhub-postgres-dev psql -U linkhub_user -d linkhub_dev -c "SELECT ..."
```

The invocations also redirect `</dev/null`, since a detached `nohup` run
otherwise makes `claude` wait ~3s for stdin that never arrives and log a warning
every iteration.

### Headless start-up is slow, and that is not a hang

Claude Code loads every plugin and skill before its first token. Measured on
this machine, same prompt and model:

| Invocation | Wall clock |
|---|---|
| no tools, `--strict-mcp-config` | 22–55s |
| two turns touching Bash | **187s to the result, process exits at 190s** |

That 3-second gap after the result is the documented background-shell grace
period ([fixed in 2.1.163](https://github.com/anthropics/claude-code/issues/65498)) —
so the process does exit promptly once it is genuinely finished.

This matters because preflight originally capped the probe at 180s and killed it
about ten seconds short, three launches in a row, with **empty stderr** — which
reads exactly like a hang or an auth failure and is neither. The probe cap is now
600s. Budget roughly 1–3 minutes of start-up per iteration on top of the real
work.

`--bare` would cut most of that start-up, but it must NOT be used here: it makes
Anthropic auth strictly `ANTHROPIC_API_KEY`/`apiKeyHelper` and never reads OAuth,
which would move the whole run onto per-token USD billing.

### A listening port is not the right app

`3333` and `5173` are common defaults, and another project on this machine can
own them. The health check originally asked only "is something listening?" —
which a different repo's api on 3333 answers perfectly well. That would have
meant a full night of QA against the wrong application, and "fixes" to LinkHub
derived from another app's behaviour, with nothing in the results to show it.

Preflight now probes a route only LinkHub serves and refuses to start otherwise,
naming the directory that owns each port. The same check runs between
iterations, in case a restart lands on a port something else has since taken.

To run alongside another project, give LinkHub its own ports:

```bash
bash scripts/nightly/run.sh start --api-port 3344 --web-port 5273 --hours 8
```

That is wired end to end, because each piece finds the app differently:

| Piece | How it is told |
|---|---|
| api | `PORT` |
| api dev CORS | `WEB_APP_URL` — its allowlist names 5173/4173 literally |
| web → api | `VITE_API_URL` |
| vite | `--port`, forwarded through the workspace script (the root `dev:web` alias swallows it as an npm flag) |
| Playwright | `E2E_API_URL` / `E2E_WEB_URL`, including its `webServer` fallbacks |
| visual runner | `VISUAL_API_URL` / `VISUAL_APP_URL` |

The visual runner needed one fix for this: `cli.config.json` names
`localhost:5173` and `localhost:3333` in its origin allowlist, and
`interceptOrigins` aborts everything not on that list — so on any other port it
blocked the app's own requests and reported a blank page instead of a port
mismatch. The app's origins are now always injected into the allowlist.

Verified on 3344/5273: 12 e2e tests passing including sign-in, and the visual
runner capturing screenshots with zero blocked requests.

### The Stop hook

This repo runs the gate on Claude Code's `Stop` hook, so it fires when an
iteration tries to finish. That is exactly right for `FIX`, which must leave the
tree green — but `BOOTSTRAP`, `HUNT` and `TRIAGE` deliberately leave failing
tests on disk as *evidence*, and the hook would push them into fixing things
outside their phase.

The preamble therefore tells non-FIX iterations to record the failure as a
candidate and stop again rather than fix it. The gate's own three-attempt loop
guard lets the third stop through with a warning. Burning those attempts is the
intended cost of keeping the phases honest, and it is why `--iteration-timeout`
has headroom.

### Skills that cannot be model-invoked

`qa-report`, `qa-execution` and `deep-review` are all
`disable-model-invocation: true` — a headless agent **cannot** reach them
through the Skill tool. The phase prompts therefore tell iterations to read
`.claude/skills/<name>/SKILL.md` and execute its procedure directly, including
`deep-review`'s bundled stdlib-Python scripts. Without that instruction those
lanes would silently degrade into an agent improvising its own review.

---

## The bar for a bug

The loop is explicitly tuned to **under-report**. A finding only counts if you
can name the user, the action, and the harm.

**Filed:** data lost or silently unsaved · a flow that cannot be completed ·
anything private leaking (the disclosure policy is the highest-value class in
this product) · a crash, hang, or wrong number · a control that does nothing ·
a public profile broken or unreadable on a phone · request storms, needless
re-renders, and unbounded paid-API calls, when measured.

**Not filed:** style and naming preferences · refactors · test-harness problems ·
the recorded debt in `AGENTS.md` · i18n gaps (there is no i18n here, by
decision) · anything whose fix is riskier than the symptom.

`TRIAGE` records what it rejected and why, so the next iteration cannot
re-litigate it.

---

## Running it

```bash
npm run nightly -- --hours 8
```

Detached, so it survives your terminal:

```bash
nohup bash scripts/nightly/run.sh start --hours 8 > .nightly/logs/run.log 2>&1 &
```

Watch it:

```bash
npm run nightly:status
tail -f .nightly/logs/run.log
node scripts/nightly/state.mjs summary
```

Stop it:

```bash
npm run nightly:stop
```

It runs on branch `nightly/qa-hardening` and never touches `main` or `develop`.
In the morning:

```bash
git log --oneline develop..nightly/qa-hardening
git diff --stat develop..nightly/qa-hardening
```

### What it needs

- `claude` CLI on PATH **signed in to a Claude subscription**, and permission to
  run unattended. By default it passes `--allowedTools` naming every tool the
  loop needs, rather than disabling permission checks wholesale: nothing listed
  prompts, and unlike the bypass flag it needs no one-time interactive
  acceptance. `--bypass-permissions` switches to
  `--dangerously-skip-permissions` if you prefer it.
- The docker stack up (it starts it if not), and a seeded database.
- Playwright's chromium (`npx playwright install chromium`).
- A funded `OPENAI_API_KEY` for the embedding-backed search and resume-import
  legs. Without it those legs are marked blocked rather than walked degraded.

---

## The e2e suite it drives

`playwright.config.ts` + `e2e/` cover the five load-bearing journeys:

| Spec | Journey |
|---|---|
| `e2e/journeys/00-smoke.spec.ts` | The canary — app reachable, seed present, auth working. |
| `e2e/journeys/01-signup-resume.spec.ts` | A developer registers and logs in with their resume. |
| `e2e/journeys/02-agent-posts.spec.ts` | A coding agent publishes posts; the human reviews them; disclosure holds. |
| `e2e/journeys/03-recruiter-search.spec.ts` | A recruiter finds developers via semantic search + AI Match %. |
| `e2e/journeys/04-link-sharing.spec.ts` | A user shares links like a Linktree page. |
| `e2e/journeys/05-profile-appearance.spec.ts` | A user configures their profile until it looks good. |

```bash
npm run e2e            # desktop
npm run e2e:mobile     # the @responsive subset on a phone viewport
npm run e2e:report     # open the HTML report
```

The suite fails on console errors and unexpected 4xx/5xx as well as on
assertions — a screen that renders correctly while throwing is not a pass.

This is distinct from `scripts/visual/run.mjs`, which is a *camera* for the
`visual-check` skill: it walks a screen's four states and captures them for a
human to look at. The Playwright suite is the *gate*.
