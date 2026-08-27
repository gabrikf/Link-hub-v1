# BUG-20260827-mcp-overstates-redaction: `get_work_context` tells the agent the text is "already redacted" for six categories the api never redacts

- **Status:** confirmed (triaged at iteration 102)
- **Impact (user-side):** A developer's ticket ids, customer names and unreleased codenames get published verbatim to their public profile, because the MCP told the agent those had already been stripped and to publish what it was given
- **Severity:** Major · **Priority:** P1
- **Persona Affected:** Diego, the curating developer, and Aria, the agent (the fourth persona — not a person)
- **Journey Step:** J-agent-publish-post
- **Theme:** n/a — MCP tool output, no UI surface
- **Scenarios:** none
- **Found:** 2026-08-27 · **Report:** docs/qa/reports/2026-08-27-nightly.md
- **GitHub:** none — found by the autonomous nightly loop
- **Origin:** `.nightly/QUEUE.json` CAND-0126 (HUNT iteration 100, schemas+mcp cohort), re-proved at triage by reading the shipped strings against the enforcement code

## Summary

`AGENT_DISCLOSURE_LEVELS.summary.blocks` (`packages/schemas/src/agent-policy/index.ts:43-49`)
promises seven categories are blocked:

> Employer and client names · Internal repository, service, project and codenames ·
> Ticket and issue ids · Customer names · Unreleased product names · Internal
> architecture specifics · Headcount and revenue figures

`buildBlockedTerms` (`redact-work-disclosure.ts:57-84`) only ever contains
**summary-level employer names plus the user's own typed terms**. One of the
seven is mechanically enforced. `role.stack` gets no redaction pass at all
(`get-work-context.use-case.ts:239`).

That gap on its own would be a documented limitation. What makes it a bug is
that seven MCP surfaces state the opposite as fact, and one of them instructs
the agent to publish the text unchanged:

| File | Line | What it says |
|---|---|---|
| `apps/mcp/src/tools/get-work-context.ts` | 100-101 | "Everything below is **already redacted** — publish only what appears here." |
| `apps/mcp/src/tools/get-work-context.ts` | 38 | `- Achievements (already redacted):` |
| `apps/mcp/src/prompts/shared.ts` | 66-72 | "This is **enforced**, not advised… It returns their history already redacted to this level." |
| `apps/mcp/src/resources/post-guidelines.ts` | 156 | "it returns the history already redacted to…" |
| `apps/mcp/src/api-client.ts` | 33 | "already redacted server-side" |
| `apps/api/src/infra/http/controllers/agent-policy/agent-policy-controller.ts` | 128 | "Get work history already redacted to the effective disclosure level" |

The agent *is* shown the `blocks` list, so it has the rules. Then the more
specific, more recent instruction — *this particular text is safe, publish it* —
overrides its own caution. That is the mechanism of the leak.

## Reproduction

- **Charter:** none · **Tour:** the-data tour
- **Environment:** api policy modules executed directly; MCP strings read from source

```
1. Read AGENT_DISCLOSURE_LEVELS.summary.blocks — seven categories promised.
2. Read buildBlockedTerms (redact-work-disclosure.ts:57-84) — for an account at
   summary with one role at Globex, server blockedTerms = ["Globex"].
3. Run the api redaction for that account. The achievement still reads:
     "Led PROJ-4471 for our customer Acme Bank on the Falcon settlement engine
      (unreleased). Team of 42."
   title keeps "Project Falcon"; stack keeps "Falcon-Core" (never redacted).
4. assertPostRespectsDisclosure ACCEPTS that same text.
   Control: "Worked at Globex." is rejected.
5. formatRole prints it under "Achievements (already redacted):", and the handler
   closes with "Everything below is already redacted — publish only what appears here."
```

**Expected:** what the MCP tells the agent about server enforcement matches what
the server enforces — either the api redacts the promised categories, or the
copy says plainly that the server enforces employer/client names and the user's
own blocked terms, and the remaining categories are the agent's own duty.

**Actual:** step 3's text is handed to the agent flagged as safe to publish, and
step 4 confirms the api will accept it back.

**Control:** step 4's `"Worked at Globex."` rejection proves the enforcement path
is live and the account is correctly configured — only the *scope* of enforcement
is narrower than the copy.

## Evidence

- Code-derived: proved by executing the api policy modules and by reading the
  seven shipped strings, **not** through a live MCP session. Recorded as a limit
  below.
- HUNT's cohort report, `.nightly/QUEUE.json` CAND-0126.

## Judgement at triage

- **Who is hurt, doing what:** a developer at the default level whose role
  achievements name a client, a ticket or an unreleased project — normal content
  for a resume imported from a real career. Their agent publishes it to a public
  profile.
- **Would they notice?** Only after it is public. The review queue is the one
  mitigation, and it depends on a human reading text the platform labelled safe.
- **Recorded debt?** No.
- **Harness problem?** No — the copy and the enforcement both ship.
- **Blocker or major?** Major. It is not automatic: the leak needs the role text
  to contain such an identifier, and the agent is independently shown the
  `blocks` list. But when it fires it is a public, irreversible disclosure.
- **Is the fix riskier than the symptom?** The *choice* matters here. Widening
  enforcement to "ticket ids, customer names, codenames" needs heuristics or a
  model call, is unbounded in scope, and would start rejecting posts the night
  before a deploy. **Do not do that tonight.** Narrowing the copy is text-only,
  has no runtime behaviour, and removes the instruction that causes the harm.
  **Triage's decision: take the copy half only.**

**Scope discipline for FIX:**
- Change the six strings above so they state what is actually enforced —
  employer/client names at the effective level plus the user's own blocked terms
  — and make the remaining `blocks` categories an explicit instruction *to the
  agent*, not a claim about the server. `get-work-context.ts:100-101` must stop
  saying "publish only what appears here" as though it were a safety guarantee.
- Do **not** touch `redact-work-disclosure.ts`, `buildBlockedTerms`, or anything
  in `@repo/schemas`. No enforcement behaviour changes.
- `apps/mcp` has an existing snapshot-style test at `register.test.ts:966` that
  asserts the `"Achievements (already redacted)"` line. Changing it is legitimate
  here — the copy **is** the behaviour under change — but update it deliberately
  and say so, do not let it be edited to make a run go green.
- Record the "widen enforcement" half in `docs/qa/automation-backlog/` as a
  follow-up task with its own review.

## Test plan agreed at triage

Component/handler behaviour in `apps/mcp`, which is where the strings live.

1. **`apps/mcp/src/tools/register.test.ts`** — assert the `get_work_context`
   header does **not** claim the payload is fully redacted and does **not** say
   "publish only what appears here". Fails today against the shipped header.
2. **Same file** — assert the header names what *is* enforced (employer/client
   names and the user's blocked terms) and states the remaining categories are
   the agent's responsibility. Fails today.
3. **`apps/mcp/src/prompts/shared.test.ts`** (or the existing prompt test) — the
   injected policy text no longer says the whole `blocks` list is "enforced, not
   advised". Fails today.
4. **Regression guard:** the api still rejects a post naming a blocked employer
   (`assertPostRespectsDisclosure` control case) — this fix must change no
   enforcement.

## Not verified at triage

The leak was demonstrated by executing the api policy modules and reading the MCP
source, not by driving a real MCP session from a host agent. What is *not* proved
is that a given host agent would in fact publish the flagged-safe text — only
that the platform tells it to. `apps/mcp` has an existing test file, so step 1-3
are reachable without new harness work.
