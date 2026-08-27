# BUG-20260827-resume-parse-uncapped: the resume parser has no upper length check, so an over-long paste becomes an internal error instead of "too long" — and the shared 100 000-char cap is dead code

- **Status:** confirmed (triaged at iteration 102)
- **Impact (user-side):** A developer pasting a very long resume gets an unexplained failure at the one step the whole onboarding depends on, and burns one of their five daily AI-import attempts doing it
- **Severity:** Minor · **Priority:** P2
- **Persona Affected:** Nina, the arriving developer
- **Journey Step:** J-resume-ai-import
- **Theme:** both — the failure surfaces as the import's error state
- **Scenarios:** the resume-import scenario covers the error state but not this input
- **Found:** 2026-08-27 · **Report:** docs/qa/reports/2026-08-27-nightly.md
- **GitHub:** none — found by the autonomous nightly loop
- **Origin:** `.nightly/QUEUE.json` CAND-0123 (HUNT iteration 81, lane `perf-cost`), re-proved at triage by reading the route and searching for the schema's importers

## Summary

`POST /me/resume/ai-import/parse` declares a **response** schema and no body
schema at all (`ai-import-controller.ts:32-52`). The route accepts both multipart
and JSON, so `resolveResumeText` reads the text by hand (`:146-158`) and the only
length rule in the handler is a **minimum**:

```ts
if (!resumeText || resumeText.length < MIN_RESUME_TEXT_LENGTH) { … 400 … }
```

Meanwhile `packages/schemas/src/ai-import/index.ts:70` exports
`aiResumeImportTextInputSchema`, which caps `resumeText` at 100 000 characters —
and **nothing in the repo imports it**. Searched at triage across
`packages/schemas/src`, `apps/api/src` and `apps/web/src`: the only hit is its own
declaration. The declared contract is not enforced anywhere.

So the real ceiling is Fastify's default 1 MiB `bodyLimit`, 10.5× the declared
cap. Two consequences:

- **Cost.** The paid `gpt-4o-mini` call runs on whatever arrives. ~100k chars is
  ~25k tokens ≈ \$0.0038; ~512k chars is ~128k tokens ≈ \$0.0192 — 5.1× the
  intended ceiling per parse, \$0.096/day/user against the production quota of 5.
- **The user-visible half.** Above roughly 512k characters the prompt exceeds the
  model's context window. `parse-resume.use-case.ts` has no `catch`, so the
  provider error becomes a 500 — an unexplained failure, not "your resume is too
  long".

## Reproduction

- **Charter:** none · **Tour:** the-data tour
- **Environment:** nightly stack api `:3344` at HUNT (dev stack: `:3333`). Whitespace bodies, so **zero OpenAI calls were spent**.

```
resumeText 100 000 chars    -> 400 (the app's MIN_RESUME_TEXT_LENGTH check — route validation PASSED)
resumeText 500 000 chars    -> 400 (same)
resumeText 1 000 000 chars  -> 400 (same; 1 000 017 B accepted)
resumeText 1 200 000 chars  -> 413 Request body is too large   <- the only real ceiling is Fastify bodyLimit

Sibling paid route, same api, for contrast:
POST /resumes/search  chatPrompt 8000  -> 200
POST /resumes/search  chatPrompt 8001  -> 400 from zod, before any paid call
```

**Expected:** the same shape as the sibling route — a body over the declared cap
is refused by validation with a clear message, before the quota is spent and
before the model is called.

**Actual:** anything under 1 MiB reaches the handler and, if it has real content,
the paid model.

**Control:** the 400s above are the *minimum*-length check firing on whitespace,
which proves route validation let the oversized body through rather than
rejecting it.

## Evidence

- HUNT's live bracket, `.nightly/QUEUE.json` CAND-0123 (whitespace only, no paid
  calls).
- Re-proved at triage: `ai-import-controller.ts:39-51` has no `body:` key, and
  `aiResumeImportTextInputSchema` has zero importers.

## Judgement at triage

- **Who is hurt, doing what:** Nina, pasting a resume. The realistic input that
  reaches the 500 is not 1 MiB of prose — it is a paste from a tool that inlined
  a base64 image or a whole export. Rare, but the failure lands on the single
  step her onboarding cannot skip, and she has five attempts a day.
- **Would they notice?** Yes — the import fails. They will not know why, and
  re-pasting the same content fails identically.
- **Recorded debt?** No.
- **Harness problem?** No — the missing schema is in product code.
- **Severity:** Minor, honestly. It needs an unusual input; the ordinary resume
  is far under the cap; nothing is lost or exposed. The cost half is real but is
  a bill, not a user harm, and is bounded by the 5/day quota.
- **Is the fix riskier than the symptom?** No — this is the smallest fix in the
  queue and it is the contract-first shape `AGENTS.md` asks for: enforce the cap
  the shared schema already declares. Note the route **cannot** simply take
  `body: aiResumeImportTextInputSchema`, because it also serves multipart; the
  check belongs beside the existing minimum, on the resolved text, using the
  cap exported from `@repo/schemas` rather than a new local constant.

**Scope discipline for FIX:** add the maximum check and its message. Do not
change `MIN_RESUME_TEXT_LENGTH`, do not touch the multipart path, do not add a
`try/catch` around the provider, and do not change `bodyLimit`. Do not widen or
re-shape `aiResumeImportTextInputSchema` — read its cap, do not edit it.

## Test plan agreed at triage

HTTP behaviour, so `build-test-app.ts` + `server.inject` — hermetic, no database,
no OpenAI.

1. **`POST /me/resume/ai-import/parse` with `resumeText` one character over the
   shared cap → 400**, with a message naming the length limit. Fails today
   (reaches the use case).
2. **The same route at exactly the cap → not a length rejection.** Pins the
   boundary so the fix cannot be off by one.
3. **Contract test:** `.parse()` the over-long body through
   `aiResumeImportTextInputSchema` and assert it fails there too — this is what
   turns the schema from dead code into the single source of the number.
4. **Regression guard:** the existing minimum-length 400 still fires on a short
   body, with its own unchanged message.
