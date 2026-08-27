# BUG-20260827-work-context-stack-unredacted: `role.stack` is the one field `get_work_context` never redacts, so a blocked term in a role's tech stack is handed to the agent verbatim

- **Status:** confirmed (triaged at iteration 111)
- **Impact (user-side):** A developer who set their disclosure level to `summary` — or typed a client codename into their own blocked-terms list — still has that term shipped to their coding agent inside the payload LinkHub calls "the only sanctioned source of employment detail", and then gets a 400 refusing the very word LinkHub just gave them
- **Severity:** Minor · **Priority:** P2
- **Persona Affected:** Diego, the curating developer, and Atlas, the coding agent
- **Journey Step:** J-agent-publish-post
- **Theme:** n/a — MCP tool output, no UI surface
- **Scenarios:** none
- **Found:** 2026-08-27 · **Report:** docs/qa/reports/2026-08-27-nightly.md
- **GitHub:** none — found by the autonomous nightly loop
- **Origin:** recorded as the one plain bug inside
  `docs/qa/automation-backlog/AB-20260827-disclosure-enforces-one-of-seven.md`
  (written by FIX iteration 109); promoted to a bug at triage iteration 111 after
  being reproduced live against the running api
- **Evidence:** `.nightly/evidence/i111-triage-work-context-stack-unredacted.txt`

## Summary

`GetWorkContextUseCase.toRole` redacts three of the four fields that can carry
free text, and skips the fourth:

```ts
// apps/api/src/core/use-case/agent-policy/get-work-context-use-case/get-work-context.use-case.ts
title: redactText(role.title, blockedTerms) || role.title,   // :228  redacted
stack: role.mainStack,                                       // :239  RAW
companyName: level === "summary" ? null : role.companyName,  // :242  redacted
achievements: splitAchievements(description)
  .map((line) => redactText(line, blockedTerms)),            // :243  redacted
```

`main_stack` is a `text[]` the user fills in themselves on each work experience.
It is not a controlled vocabulary of public technology names — internal SDKs,
design systems and platform names live there in the ordinary case
(`acme-design-system`, `billing-svc-v2`, `QuintoAndar Platform`), which is
precisely the shape of a category-1 blocked term.

This is **not** the "we promise seven categories and enforce one" scope question
recorded in `AB-20260827`. It is a hole in category 1, the one category the api
does enforce, and the fix needs no new heuristics.

## Reproduction

- **Charter:** none · **Tour:** the-data tour
- **Environment:** dev stack, api `:3333`, account
  `seed.javascript-fullstack.001@linkhub.local`, real JWT from `POST /auth/login`.
  `GET /me/agent-policy` → `{"disclosureLevel":"summary","blockedTerms":[],"perEmployer":[]}`
  — the denylist is the automatic one (every employer whose own role is at
  `summary`), so **no settings were changed** to produce this.

1. Put one blocked term — the employer name `QuintoAndar` — into four fields of a
   single role, so the three redacted fields act as the control for the fourth:

   ```sql
   UPDATE work_experiences
      SET main_stack  = main_stack || ARRAY['QuintoAndar Platform'],
          title       = 'Software Engineer at QuintoAndar',
          description = description || E'\nBuilt the QuintoAndar Platform ingestion pipeline.'
    WHERE id = 'f6ea8050-f53d-4fca-a64d-bc3fb7772298';
   ```

2. `GET /me/work-context` with that user's token and read the same role back.

## Expected

Every field of the role that can carry the term is redacted, as the other three
are. The tech stack is exactly the field the post-quality guide tells the agent
to repeat in the body *and* the tags, so it is the last field that should escape.

## Observed

Three fields redacted, one verbatim:

```
title      : "Software Engineer at [employer]"
companyName: null
achievements: "Worked as Software Engineer at [employer], …"
              "Built the [employer] Platform ingestion pipeline."
stack      : ["AWS","JavaScript","MATLAB","Node.js","Power BI","R","QuintoAndar Platform"]
                                                                   ^^^^^^^^^^^^^^^^^^^^^^
```

## Harm, stated at the level it actually reaches

The write path **does** cover tags — `enforce-post-disclosure.ts:108-115` joins
`title + body + …tags + externalUrl + coverImageUrl + …images` into one haystack —
so a post repeating the term is rejected with HTTP 400 and the term does **not**
reach the public profile. That is why this is `minor` and not a leak. What is
left is still real:

1. **The disclosure contract breaks one hop before publication.** The user chose
   `summary` so that software acting on their behalf never sees the name. The
   payload hands it over anyway, to a model that is often a third-party hosted
   one, labelled as safe.
2. **A self-contradicting publish loop.** `linkhub://guides/post-quality` tells
   the agent to name the stack twice — as prose and as `tags`. An agent that
   follows the guide using the payload LinkHub gave it gets a 400 naming a term
   it read out of `get_work_context`, and its obvious retry — the same stack —
   fails identically.
3. **The shipped README is literally wrong because of this one field.**
   `apps/mcp/README.md:62` promises employer names are "stripped from the fields
   *and* the prose". The prose is; one field is not.

## Suspected cause

`apps/api/src/core/use-case/agent-policy/get-work-context-use-case/get-work-context.use-case.ts:239`
— `stack: role.mainStack` is the only free-text field in `toRole` that never
passes through `redactText`.

## Test plan

Pure business rule, so it belongs next to the use case, and there is already a
suite there:

- **Red test:** `get-work-context.use-case.spec.ts` (or the file the existing
  use-case tests live in) — a role at `summary` whose `mainStack` contains the
  employer name, asserting the returned `stack` no longer contains it while
  `title` and `achievements` stay redacted as they are today. Fails at HEAD.
- **Boundary:** a stack entry that merely *contains* a blocked term as a
  substring of a longer token, and one that is unrelated (`React`), so the fix
  cannot be "empty the array".
- **Regression guard:** the api policy suite,
  `npx vitest related apps/api/src/core/use-case/agent-policy/redact-work-disclosure.ts --run`
  — **379 passed / 20 files** at HEAD. It must still be 379.

## Scope discipline for FIX

- Touch **one line plus its test**: `stack` in `toRole`. Do not touch
  `redactText`, `buildBlockedTerms`, `enforce-post-disclosure.ts`, the schemas
  package, or the MCP copy.
- **There is a design choice inside the one line — make it deliberately.**
  `redactText` on a stack entry yields `"[employer] Platform"`, which is a
  nonsense technology name and a nonsense search tag. `title` handles this with
  the `|| role.title` fallback, which is the wrong shape here because falling
  back means shipping the term. Prefer **dropping** entries whose redaction
  differs from the original — the stack is a list of searchable technology names,
  and a name that cannot be said is better absent than mangled. Whichever is
  chosen, pin it in the test and say why in the commit body.
- Do **not** also "fix" `apps/mcp/README.md:62` in this commit. The sentence
  becomes true the moment the field is fixed.
