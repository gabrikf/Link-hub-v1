## PHASE: HUNT — find real bugs

One hunting round per iteration. You are looking for defects a **real user would
feel**, and nothing else.

### Pick this round's lane

Read `MEMORY.md` for which lanes previous HUNT rounds already ran, and pick the
highest-value lane not yet covered. Run **one** lane per iteration:

| Lane | What it is |
|---|---|
| `deep-review` | Follow `.claude/skills/deep-review/SKILL.md` against `--base develop`. It reviews the branch diff against this repo's own rubric and the six LinkHub priorities. |
| `qa-execution` | Follow `.claude/skills/qa-execution/SKILL.md`. A persona walks a journey in the browser, in both themes, and reports what a real user experiences. |
| `journey-probe` | Drive the five journey specs' surfaces harder than the specs do: edge inputs, back/forward, double-submit, refresh mid-flow, slow network (`page.route` with a delay), session expiry. |
| `perf-cost` | Measure. Request counts per user action, duplicate queries, N+1 through Drizzle, unbounded OpenAI calls, payload sizes, React re-render counts. Numbers or it did not happen. |
| `responsive-dark` | Every screen at 390px and 1440px, in light and dark. Horizontal scroll, unreadable text from a missing `dark:` variant, overlapping controls, tap targets. |
| `disclosure` | The highest-value bug class in this product. Try to make an agent-authored post leak an employer, a client, or a blocked term above the user's disclosure level. Verify what is ACTUALLY published on the public profile, not what the API returned. |
| `coverage-gap` | Pick the highest-risk **untested** paths (start with `apps/mcp`, which has zero tests, then api use cases in `apps/api/src/core/**` with no neighbouring `.test.ts`) and write **characterization** tests that assert what the code does today. A path where writing the test reveals the behaviour is actually WRONG becomes a candidate. Commit the tests that pass as `test(coverage): …`; they are the night's safety net for every later fix. |

Note on `coverage-gap`: "unit, integration and e2e tests for everything" is not
reachable in one night, and pretending otherwise produces shallow tests that
pass for the wrong reason. Spend this lane on the paths where a silent break
would actually hurt a user, and record in MEMORY.md what you deliberately left
uncovered so the report can say so honestly.

**Use subagents.** Fan out 3–5 of them within your lane (one per area or per
screen) and merge their findings. Give each one the "real user impact" bar
below, and tell each to return evidence, not opinions.

### How to run a skill lane

`qa-report`, `qa-execution` and `deep-review` are all marked
`disable-model-invocation: true`, which means **you cannot invoke them with the
Skill tool** — the attempt will simply not be available to you. That is not a
bug and it is not a reason to skip the lane.

Instead, **read the skill's `SKILL.md` in full and execute its procedure
yourself**, following its `references/` files as it instructs:

```bash
cat .claude/skills/deep-review/SKILL.md
cat .claude/skills/qa-execution/SKILL.md
cat .claude/skills/qa-report/SKILL.md
```

`deep-review` ships bundled Python scripts under
`.claude/skills/deep-review/scripts/` (stdlib only, `python3` is 3.12) — run
them exactly as its Procedure says, with `--out .deep-review/nightly/`. Its
runtime here is `native`; never pass `--subagent`, `compozy` is not installed.

### The bar — read this twice

A finding is only a bug if you can name **the user, the action, and the harm**.

**File it** when: data is lost or silently not saved; a flow cannot be
completed; something private leaks; a page crashes, hangs, or shows a wrong
number; a control does nothing; the public profile is broken or unreadable on a
phone; an action fires a request storm or an unbounded paid API call.

**Do NOT file it** when: it is a style or naming preference; it is a refactor;
it is a test-only or harness-only problem; it is listed in AGENTS.md as recorded
debt; the fix would be riskier than the symptom; it is an i18n gap (there is no
i18n here, by decision); it is "could be nicer".

When in doubt, **do not file it**. A night that fixes four real bugs is worth
more than one that churns twenty cosmetic ones and destabilises a release.

### Evidence standard

No finding without a reproduction. For each one record the exact command or
click path from a real entry point, the observed result, the expected result,
and where the evidence lives (`.nightly/evidence/<candidate-id>/…` for
screenshots, trimmed logs, or measured numbers).

Anything crossing the api↔web boundary: capture the **real payload** and note
which `@repo/schemas` schema it should satisfy. That contract is the strongest
sensor in this repo.

### Write results

Append to `.nightly/QUEUE.json` → `candidates[]` using the BOOTSTRAP format,
plus:
```json
{ "user_impact": "one sentence: who is hurt and how", "measured": "numbers, if this is a perf/cost finding" }
```
Dedupe against existing candidates, confirmed, fixed and rejected entries before
appending — a re-found symptom gets a note on the existing entry, not a new id.

Append to MEMORY.md: which lane you ran, what you covered, what you found, and
**what you deliberately did not file and why** (that list stops the next
iteration re-litigating it).

### Then stop

```bash
node scripts/nightly/state.mjs set next_phase '"TRIAGE"'
```
Legal: `HUNT` (another lane still worth running and there is plenty of time),
`TRIAGE` (candidates are worth working now — prefer this once you have 3+, or
after 3 hunt rounds), `REPORT` (out of time).
