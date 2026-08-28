# AB-20260827 — the disclosure policy promises seven blocked categories and the api enforces one

**Status:** open — product decision needed, no fix attempted
**Raised by:** nightly QA loop, FIX of `BUG-20260827-mcp-overstates-redaction`
(iteration 109, 2026-08-27)
**Related:** `BUG-20260827-mcp-overstates-redaction` (the copy half, fixed at
`493342e`), `ESC-20260827-disclosure-slash-gap`

## The gap

`AGENT_DISCLOSURE_LEVELS.summary.blocks`
(`packages/schemas/src/agent-policy/index.ts:43-51`) lists seven categories an
agent must not publish:

| # | Category | Enforced server-side? |
|---|---|---|
| 1 | Employer and client names | **yes** — `buildBlockedTerms` |
| 2 | Internal repository, service, project and codenames | no |
| 3 | Ticket and issue ids | no |
| 4 | Customer names | no |
| 5 | Unreleased product names | no |
| 6 | Internal architecture specifics | no |
| 7 | Headcount and revenue figures | no |

`buildBlockedTerms` (`apps/api/src/core/use-case/agent-policy/redact-work-disclosure.ts:57-84`)
only ever holds summary-level employer names plus the terms the user typed into
settings. Everything else on the list passes `assertPostRespectsDisclosure`
untouched and is published verbatim.

Also unredacted: `role.stack` never sees `redactText` at all
(`get-work-context.use-case.ts:239` passes `role.mainStack` through raw, while
`:243-244` is the only field that is redacted), so an internal codename living
in the stack list reaches the agent even for category 1.

## What was already done

Iteration 109 fixed the **honesty** half only: the MCP no longer claims the api
handles all seven, and `get_work_context` no longer tells the agent to publish
its payload unchanged. The gap itself is untouched and enforcement is
byte-identical.

## Why it was not closed the same night

Categories 2–7 are not a denylist problem. "Ticket and issue ids" is a pattern,
"unreleased product names" and "internal architecture specifics" are judgement
calls that need a model. Both mean an unbounded false-positive rate on a path
that **rejects a user's post with HTTP 400** — shipping that the night before a
deploy trades a disclosure risk for a "LinkHub won't let me post" support queue.
Same line that was drawn for `ESC-20260827-disclosure-slash-gap`: repairing a
self-contradiction is cheap, widening a matcher is not.

## Recommendation for a human

Three options, in increasing cost:

1. **Narrow the promise.** Rewrite `blocks` so it distinguishes what LinkHub
   enforces from what the agent is trusted with, and mirror that split in the
   settings UI. Cheapest, honest, no new failure mode — but it tells users the
   product does less than they assumed.
2. **Enforce the mechanical two.** Ticket ids (`PROJ-1234`, `#4471`, Jira/Linear
   URLs) and headcount/revenue figures are regex-shaped. Measurable
   false-positive rate, testable in the pure-module suite. Leaves 2, 4, 5, 6
   as agent duty.
3. **Enforce the judgement categories with a model pass** at post-create time.
   Needs a latency budget, a cost budget, an appeal path for a wrongly rejected
   post, and an eval suite before it goes anywhere near the reject path.

Whichever is chosen, `role.stack` should get the same `redactText` pass the
other role fields get — that one is a plain bug in category 1, not a scope
question.

## How a change here would be proven

Pure business rule, so next to the use case:
`apps/api/src/core/use-case/agent-policy/redact-work-disclosure.spec.ts`, with
the api policy suite (currently **379 passed**, 20 files) as the regression
guard. The MCP copy corrected at iteration 109 must be re-widened in the same
change — `apps/mcp/src/tools/register.test.ts`,
`apps/mcp/src/prompts/prompts.test.ts` and
`apps/mcp/src/resources/resources.test.ts` all pin the current, narrower claim
and will fail loudly if enforcement grows without the copy following it. That
is deliberate.
