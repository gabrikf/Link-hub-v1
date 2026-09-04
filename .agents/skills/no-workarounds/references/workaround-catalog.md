# Workaround Catalog

The workaround shapes this repository actually produces, W-31 through W-36. Each entry gives the workaround, why it is harmful, and the proper fix. Generic cross-language patterns were removed on 2026-09-04 — they were reusable advice, not CraftHub knowledge, and three of them prescribed libraries this repo does not have.

## CraftHub-Specific Workarounds

These are the shapes this repository actually produces. Each one has been seen, or is one
edit away from being seen, in `apps/api`, `apps/web`, `apps/mcp` or `packages/schemas`.

### W-31: Silencing a `@repo/schemas` Parse Failure With a Cast

```typescript
// WORKAROUND — the contract said no, so the contract was overruled
const raw = await res.json();
const profile = raw as ProfileResponse;              // or: raw as unknown as ProfileResponse
// (variant: keeping the .parse() but wrapping it)
const profile = profileResponseSchema.safeParse(raw).data as ProfileResponse;

// PROPER FIX — the parse failure is the contract telling you the two sides disagree
const profile = profileResponseSchema.parse(raw);
// Then go fix whichever side is wrong:
//  - the API serializer in apps/api/src/infra/http/controllers/**, or
//  - the schema in packages/schemas/src/** (and rebuild: npm run build:schemas)
```

**Harm:** `@repo/schemas` is the single contract shared by api, web, mcp, extractor and
training. A cast makes exactly one caller stop complaining while the drift stays live for
the other four, and it converts a loud parse error into a silent `undefined` deep in a
component. The parse failure was the most valuable signal this repo produces — see the
contract-test sensor in the `testing-boss` skill.

### W-32: Widening a Zod Schema So a Bad Payload Passes

```typescript
// WORKAROUND — a real payload failed validation, so validation was relaxed
export const postSchema = z.object({
  id: z.string(),
  publishedAt: z.string().optional(),      // was: z.iso.datetime()
  visibility: z.string(),                  // was: z.enum(['public', 'private'])
  metadata: z.record(z.string(), z.unknown()), // was: a real shape
});

// PROPER FIX — decide which side is wrong, and fix that side
export const postSchema = z.object({
  id: z.uuid(),
  publishedAt: z.iso.datetime(),
  visibility: z.enum(['public', 'private']),
  metadata: postMetadataSchema,
});
// If the producer really can emit null, model that truthfully — .nullable() — and handle
// it downstream. Truthful-and-narrow is the goal; `.optional()` on everything is not.
```

**Harm:** A widened schema does not describe the system any more, it describes whatever
happened to arrive. Every downstream consumer then re-derives the missing narrowing with
its own `?.` chain (W-19) or its own cast (W-31). Note schemas here import from `zod/v4`;
check the v4 API through the `context7-usage` skill before reshaping one.

### W-33: `.skip` / `skipIf` on a Test That Needs Docker

```typescript
// WORKAROUND
describe.skipIf(!process.env.CI)('search boundaries', () => { /* … */ });
it.skip('finds candidates by embedding distance', async () => { /* … */ });

// PROPER FIX — start the infrastructure the test legitimately needs
//   bash db-manage.sh start        # postgres + pgvector + redis
//   bash db-manage.sh seed-all     # deterministic seed users
//   npx vitest related apps/api/src/infra/database/drizzle/search-indexes.e2e.test.ts --run
```

**Harm:** These suites exist precisely because pgvector behaviour cannot be asserted
in-memory. Skipping them deletes the only coverage of the thing most likely to break,
while leaving a green checkmark that says otherwise. A test that never runs is worse than
no test: it occupies the slot where a real test would have gone.

**The honest alternative:** if a suite genuinely cannot run in an environment, gate it by
an explicit, named, *documented* condition and record it — the way this repo already
records `search.e2e.test.ts`, `search-boundaries.e2e.test.ts` and
`search-indexes.e2e.test.ts` as needing a funded `OPENAI_API_KEY` and excludes them from CI
**by name**. Named and visible is a decision. `.skip` in a file nobody re-reads is a lie.

### W-34: Swallowing an Error Inside a Use Case

```typescript
// WORKAROUND — apps/api/src/core/use-case/**
async execute(input: Input): Promise<Output | null> {
  try {
    return await this.embeddingProvider.embed(input.text);
  } catch {
    return null;              // caller now cannot tell "empty" from "OpenAI is down"
  }
}

// PROPER FIX — let the error reach the global error handler, or map it to a typed failure
async execute(input: Input): Promise<Output> {
  return await this.embeddingProvider.embed(input.text);
}
// If this specific failure has a meaningful domain meaning, model it:
//   throw new EmbeddingUnavailableError({ cause });
// and let apps/api/src/infra/http/middleware/global-error-handler.ts turn it into the
// right status code, the right body, and the right Sentry/OTel span.
```

**Harm:** The global error handler exists so that every failure gets one consistent
status, one log line with context and one trace. A `catch` in the core layer routes
around all three: the request 200s with an empty body, Sentry never sees it, and the
recruiter search silently returns zero matches while looking healthy.

### W-35: `setTimeout` to "Fix" a React Query Race

```typescript
// WORKAROUND — apps/web
await mutateAsync(payload);
setTimeout(() => queryClient.invalidateQueries({ queryKey: ['profile', username] }), 300);
// or, in a test:
await user.click(saveButton);
await new Promise((r) => setTimeout(r, 500));
expect(screen.getByText('Saved')).toBeInTheDocument();

// PROPER FIX — coordinate on the real event, and in tests wait on the condition
useMutation({
  mutationFn: savePost,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', username] }),
});
// in the test:
await user.click(saveButton);
expect(await screen.findByText('Saved')).toBeInTheDocument();
```

**Harm:** 300ms is a guess about someone else's machine. It passes locally, flakes in the
visual scenario runner, and fails on a cold API container. The mutation already tells you
exactly when it settled — `onSuccess` / `onSettled` — so a timer is strictly less
information than what you already had.

### W-36: Inline `eslint-disable` to Clear the Ratchet

```typescript
// WORKAROUND
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = (payload: any) => { /* … */ };

// PROPER FIX
const handler = (payload: WebhookPayload) => { /* … */ };
// If the payload is genuinely unknown at the boundary, parse it:
const handler = (raw: unknown) => {
  const payload = webhookPayloadSchema.parse(raw);
};
```

**Harm:** `node scripts/guardrails/lint-changed.mjs` only looks at the files you touched,
and it fails on **new** findings, not on the backlog. That design exists so the debt does
not block anyone — not so that new debt can be smuggled in under a comment. An inline
disable is invisible to the ratchet by construction, which is exactly why it is the
tempting move and exactly why it is the wrong one. If a rule is genuinely wrong for this
codebase, turn it off **in the flat config**, where the decision is reviewable, and say why.

### Recorded debt vs. hidden debt — the distinction that makes the escape valve honest

This repo carries real, deliberate debt: **30 pre-existing eslint errors in `apps/web`**,
and `eslint-plugin-only-warn` inside `packages/eslint-config`, which downgrades every error
to a warning and neuters any gate that consumes it. Neither is a workaround in the sense
this skill condemns — they are **recorded** debt. The number 30 is written down, CI reports
it as a baseline, and `lint-changed.mjs` ratchets against it so it can only go down.

That is the honest form, and it only works because of three properties:

1. **The number is visible.** Somebody can read it without archaeology.
2. **It is ratcheted.** New findings fail; the backlog does not.
3. **It is attributed.** The decision has a rationale, not just an absence.

Strip any of the three and you are back to a workaround wearing a policy's clothes. A
suppression that nobody counts, a baseline nobody can find, or a "known issue" with no
owner is hidden debt — and hidden debt is exactly what W-31 through W-36 produce. When you
genuinely must defer a fix, defer it into the *recorded* column: a number that is visible,
ratcheted, and attributed. Never into a comment.

