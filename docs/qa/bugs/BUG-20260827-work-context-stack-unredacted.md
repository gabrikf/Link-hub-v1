# BUG-20260827-work-context-stack-unredacted: `role.stack` is the one field `get_work_context` never redacts, so a blocked term in a role's tech stack is handed to the agent verbatim

- **Status:** fixed (red 9b3ee27 → fix 15a8468; reviewed and approved at iteration 116)
- **Impact (user-side):** A developer who set their disclosure level to `summary` — or typed a client codename into their own blocked-terms list — still has that term shipped to their coding agent inside the payload CraftHub calls "the only sanctioned source of employment detail", and then gets a 400 refusing the very word CraftHub just gave them
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
- **Evidence:** `.nightly/evidence/i111-triage-work-context-stack-unredacted.txt`,
  `.nightly/evidence/i114-triage-stack-unredacted-reconfirm.txt`,
  `.nightly/evidence/i115-fix-stack-unredacted-live.txt`,
  `.nightly/evidence/i116-review-stack-unredacted.txt`

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
  `seed.javascript-fullstack.001@crafthub.local`, real JWT from `POST /auth/login`.
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
2. **A self-contradicting publish loop.** `crafthub://guides/post-quality` tells
   the agent to name the stack twice — as prose and as `tags`. An agent that
   follows the guide using the payload CraftHub gave it gets a 400 naming a term
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

## Fix

Red `9b3ee27` (test), fix `15a8468` (source). One file, `+8 −1`:

```ts
// get-work-context.use-case.ts — toRole
stack: role.mainStack.filter(
  (entry) => findDisclosureViolations(entry, blockedTerms).length === 0,
),
```

The cause was not a broken redactor — it was a redactor that was never called on
this one field. `redactText`, `buildBlockedTerms` and the boundary rules were
correct and are untouched.

**Dropped, not redacted**, as the scope discipline above asked. `redactText`
exists so a *sentence* survives losing a name ("Rebuilt checkout for
[employer]." still reads); a stack entry is a *label* that the post-quality guide
tells the agent to repeat in the body **and** in the tags, where tags embed at
double weight. `"[employer] Platform"` would have traded a disclosure leak for a
nonsense technology and a nonsense search tag. `title`'s `|| role.title` fallback
was deliberately not copied: falling back there means shipping the term.

## Review — iteration 116, approved

- **Red is honest.** At `9b3ee27` the test fails on its own assertion about its
  own field (`expected [ 'React', 'Acme Corp Platform', …(3) ] to not include
  'Acme Corp Platform'`), with the other 15 tests in the file passing; at
  `15a8468` the file is 16/16. `git merge-base --is-ancestor` confirms the red
  commit is a real ancestor of the branch head.
- **Blast radius.** 22 files / 457 tests green across `redact-work-disclosure`,
  the use case and the MCP tool. `npm run check-types` reported all-cached, so
  `npx tsc --noEmit` was forced directly in `apps/api` and `apps/mcp` — both
  clean. The controller's response schema was already `z.array(z.string())`, so
  nothing was widened and `packages/schemas` was not touched;
  `apps/mcp/src/tools/get-work-context.ts:33` already guards `stack.length > 0`;
  `role.mainStack` cannot be null (entity `?? []` over a `notNull` default-`[]`
  column). The red commit is additive only — no existing test was edited.
- **Live re-reproduction, made harder than the fix author's.** Three entries were
  injected instead of one. `QuintoAndar Platform` **and** the slug spelling
  `quintoandar-cli` are both dropped, while `Sunset Analytics` and the six real
  technologies survive; the row was reverted and re-queried byte-identical
  (`md5 f4a7a8b87a5b163bac36fb4b5c633439`). The slug case only works because the
  fix reuses `findDisclosureViolations` — the write path's own detector — so the
  read path can never disagree with the write path about what counts as a hit.
  A hand-rolled `includes` check would have passed the authored test and still
  leaked `quintoandar-cli`.
- **Accepted consequence, recorded so it is not re-litigated.** A real technology
  whose name collides with a blocked employer term now disappears from the
  agent's context. That is the same answer the write path already gives (such a
  post is refused with a 400), and the alternative is the leak this bug is about.
- **Not verified:** nothing visual — this bug has no UI surface, so DESIGN.md,
  dark mode and the four-state rule do not apply. The MCP tool's rendered text
  was read but not exercised end-to-end through a live MCP client; the assertion
  there rests on the existing `stack.length > 0` guard and the unchanged
  `string[]` shape.

`apps/mcp/README.md:62` was deliberately left alone: that sentence is true now.
