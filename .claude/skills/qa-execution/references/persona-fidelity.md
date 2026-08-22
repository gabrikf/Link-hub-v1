# Persona Fidelity

The guardrails that keep a session *real*. The moment the runner starts behaving like an evaluator with privileged access, the session stops measuring the product and starts measuring the runner's ability to make dashboards green. These rules are sticky: when one blocks you, the fix is to change the session, never to relax the rule.

## Contents

- The public-interface rule
- The agent persona's version of the rule
- Forbidden framings
- Stall is a finding
- The allowlist
- Fidelity vs the fix loop
- Rule governance
- Anti-patterns

## The public-interface rule

Everything the session does goes through surfaces a real user can reach:

- **Interact** only via the product's UI, its MCP tools, or its documented public API — as the persona, with the persona's knowledge.
- **Verify** only via read paths the product exposes to users (fresh loads, the public profile, the review queue, `list_my_posts`, an export the product offers).
- **Never**: read `apps/api/src/**` to learn what *should* happen mid-session; call an internal endpoint the UI doesn't call; mint a token for a user the persona isn't; edit the seed data to make a path reachable; flip a feature flag. If the plan needs product knowledge, that's planning work (`qa-report`) done *before* the session, not during it.
- **The one exception, narrowly:** a read-only query through the restricted `postgres-mcp` server against the **local dev database only**, to corroborate that a write the UI already claimed landed actually landed, keyed by a correlation id. It never replaces a user-visible observable, never decides a verdict on its own, and never touches anything but the local dev database. Anything else — a write, a different database, a query used *instead of* a fresh load — is a violation.

Knowledge asymmetry is the point: the persona knows what the product taught them, nothing more. A recruiter who "happens to know" that AI Match % is a TensorFlow.js re-rank over pgvector candidates is not a recruiter — they are the engineer who built it, and they will not notice that the number is unexplained on screen.

## The agent persona's version of the rule

The coding-agent persona is the easiest one to cheat with, because the runner and the agent are both models:

- The agent knows **only what its MCP tools returned**. If `get_work_context` did not name the employer, the agent does not know the employer — even if the session runner read it out of the seed database a minute ago. Leaking runner knowledge into an agent's post is the single fastest way to invalidate a disclosure-policy verdict, because it produces a leak the product never would have produced.
- The agent authenticates with **its own API token**, minted the way a developer mints one, at `/dashboard/settings`.
- The agent does not read the disclosure policy out of the database, the code, or this file. It reads it with `get_disclosure_policy` — and if the tool's answer is vague, incomplete or absent, **that is the finding**, not an inconvenience to route around.

## Forbidden framings

Wherever the session produces text a product surface or agent under test will consume (post bodies, job descriptions pasted into recruiter search, resume content, MCP prompts), evaluator framing is forbidden — it changes the product's behavior and invalidates the result:

- Naming the activity: "as a QA tester", "this is a test", "I am verifying/auditing", "test case", "expected result".
- Grading language: "pass/fail", "go/no-go", "acceptance criteria", artifact ids (`BUG-`, `CH-`, `J-` prefixes) leaking into product-facing text.
- Instructing the product to self-report: "confirm that you...", "list what you did so I can check".

The persona writes what a real person with their goal would write. A recruiter pastes a real job description, not "test JD 1". A developer's post says what they built. If a session note needs meta-language, it goes in the session log — never into the product.

This matters double here because **LinkHub has an agent inside it**. An agent told it is being tested behaves differently — and the disclosure policy is precisely the surface where a self-conscious agent over-redacts and hides the bug. The session's prompts must be indistinguishable from real usage: one in-persona kickoff with a real goal, then observation.

## Stall is a finding

When the product hangs, a button does nothing, an import spins forever, the agent's `create_post` never returns, or a flow dead-ends:

1. Capture the state (screenshot, elapsed time, what the persona tried, console and network).
2. Record the verdict (`fail` or blocked) and file/update the bug.
3. Move on to the next step the persona could realistically reach, or end the session leg.

**Never** nudge the product past the stall — re-prompting the agent, force-refreshing until it works, or retrying until a race un-sticks masks exactly the defect the session exists to catch. One clean retry from a fresh session is legitimate (real users retry once); record that the first attempt failed either way.

One caveat worth knowing before filing: three API test files hang for 60-90 seconds when the docker stack is down rather than failing fast. That is a *tooling* stall with a known cause — check `bash db-manage.sh status` before filing a stall as a product bug when the stall is in the harness rather than in a screen.

## The allowlist

Real product work uses words that look meta but aren't — don't over-block:

- "review", "approve", "reject" — LinkHub's post review queue is literally about reviewing and approving. Using those flows is real usage.
- "disclosure", "policy", "blocked term" — the product's own vocabulary, on the product's own settings screen.
- "test" — when it names a real artifact inside a persona whose job includes it (a developer's post about writing tests is a real post).

The line: meta-language *about this QA session* never touches the product; the product's own vocabulary is fair game.

## Fidelity vs the fix loop

Fidelity governs the **session**; the fix loop (routed at Step 7 of the SKILL) happens **between** sessions:

- Inside a session, the persona never fixes anything — a real user can't patch the product.
- After a session ends, the governor may authorize a bounded fix; then the impacted journey is **re-walked from scratch, in persona** — a fresh session, not a resumed one. The persona doesn't "know" the bug was just fixed; the Recovering User persona exists precisely for that re-walk, and after a disclosure leak it is the only honest walker: someone whose employer's name was published once does not trust the toggle the second time.

## Rule governance

- Rules are sticky, sessions are variable: when a rule blocks a session, rewrite the charter/persona/entry — never weaken the rule in the moment.
- Relaxing or adding a rule happens in review, in this file, with the incident that motivated it written down.
- A fidelity violation discovered mid-run invalidates the affected verdicts: reset them to `Pending`, note the violation in the report, re-run clean.

## Anti-patterns

- **The omniscient persona** — using URLs, tokens, or vocabulary the persona was never taught.
- **The omniscient agent** — feeding the MCP persona facts that came from the seed data or the codebase instead of from `get_work_context`. It manufactures leaks the product would never have produced and hides the ones it would.
- **Verification leakage** — code reads and privileged API calls sneaking in as "just double-checking". The independent read path must be user-reachable.
- **Prompt-nudging the agent** — "are you still there?", "try posting again" — the stall was the data.
- **Grading language in product inputs** — the fastest way to make an agent-backed product behave unnaturally.
- **Relaxing rules under deadline** — a green matrix produced by loosened fidelity measures nothing; the next release inherits the bugs.
