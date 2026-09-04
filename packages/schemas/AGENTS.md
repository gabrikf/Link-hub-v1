# packages/schemas — Agent Rules

`@repo/schemas` is the single source of truth for every shape that crosses a
boundary: api ↔ web, api ↔ mcp, api ↔ extractor, and the training pipeline.
Read the root `AGENTS.md` first; this file is the depth.

```bash
npm run build:schemas      # tsc -> dist/index.d.ts
```

---

## Change the schema first, then build it

1. **Change the schema**, in `packages/schemas/src/<module>/`.
2. **Build it**: `npm run build:schemas`.
3. Then update the api handler and the web caller.

Step 2 is not optional and it is not a formality. Every consumer resolves
`@repo/schemas` through the emitted `dist/index.d.ts`, not through `src/`. On a
tree where schemas has not been built, `check-types` fails with errors that
point at consumers in `apps/api` and `apps/web` and say nothing at all about
the real cause. **This is the #1 confusing failure in this repo**, and it is
why the gate builds schemas first, always, before anything else runs.

---

## What belongs here, and what does not

Here: any request body, response body, query string, queue payload, webhook
payload or persisted enum that two workspaces both have to agree on. Also
shared maths that must produce identical numbers in more than one place — the
IR metrics in `src/eval/` and the match scoring in `src/matching/` live here
because the api, the browser re-ranker and the offline training pipeline all
import them, and that is the only way the trained target and the displayed
score can agree.

Not here: a shape used by exactly one workspace. That is local, and moving it
here makes every other workspace rebuild for a change that cannot affect them.

**Never define a request/response type locally to "unblock" yourself.** A
locally redefined form schema or api type is a contract fork, and it drifts
silently — the type-checker is happy on both sides right up until a user sees
`undefined` on screen.

**Never widen a schema so a bad payload passes.** That converts a contract
break the schema caught into a runtime bug nobody catches.

---

## Add it to `src/index.ts`

Every module is re-exported from `src/index.ts`. A new module that is not
exported there does not exist as far as any consumer is concerned, and the
failure looks like a missing export in the consumer rather than a missing line
here.

---

## The strongest test you can write here

`schema.parse(realPayloadCapturedFromTheRunningApi)`.

Asserting a real captured payload through the shared schema turns contract
drift into a failing test instead of a support ticket. It is worth more than
any number of tests that parse a fixture the same file constructed.

vitest, next to the schema (`src/eval/ir-metrics.test.ts` is the pattern).
