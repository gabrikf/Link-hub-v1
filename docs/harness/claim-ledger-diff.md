# Claim ledger diff

> baseline: `/home/gabriel/Documents/www/linkhub-v.1/docs/harness/claim-ledger-baseline.json`
> against: `/home/gabriel/Documents/www/linkhub-v.1`
> match threshold: 0.6 token overlap against the claim

## What these words mean

| Word | Meaning |
|------|---------|
| **RETAINED** | The sentence is still somewhere in the harness, possibly in a different file |
| **CUT** | It is not. Legitimate only with a report ID behind it |
| **Relocated** | Moved and reworded, so the window match missed it — `docs/harness/claim-resolutions.json` names where it went, and that claim is re-checked here |
| **Corrected** | Deleted because it was FALSE. The entry names the evidence, and that evidence is re-checked here |
| **Protected cut** | A CUT that both judges said to keep, or that sat in a Keep-core / Hold surface. A regression, not a decision |
| **Mixed-apply cut** | A CUT inside a surface Track C called Mixed, where `11-mixed-apply.md` names what to remove. Authorised — but read the diff |

## Summary

- Claims in the baseline: **1429**
- Retained, matched in place: **1369**
- Relocated, each verified against a named destination: **17**
- Deleted as factually false, each with evidence: **4**
- Cut: **39**
- Of those, cut under a `11-mixed-apply.md` plan: **37**
- Protected cuts: **0** — gate **PASS**

## Protected cuts (restore these)

_None._

## Relocated (verified)

| ID | Was in | Now in | Verified by |
|----|--------|--------|-------------|
| C003 | `.claude/CLAUDE.md` | `docs/harness/agent-harness.md` | "symlink, so Claude Code reads the same bytes" |
| C005 | `.claude/CLAUDE.md` | `.claude/CLAUDE.md` | "real content lives in the tool-neutral" |
| C057 | `AGENTS.md` | `AGENTS.md` | "is prescriptive" |
| C071 | `AGENTS.md` | `.agents/skills/i18n/SKILL.md` | "three locales" |
| C074 | `AGENTS.md` | `.agents/skills/i18n/SKILL.md` | "mirrors `lib/theme.ts`" |
| C075 | `AGENTS.md` | `.agents/skills/i18n/SKILL.md` | "before adding a key" |
| C078 | `AGENTS.md` | `.agents/skills/i18n/SKILL.md` | "Never concatenate a sentence from fragments" |
| C084 | `AGENTS.md` | `.agents/skills/i18n/SKILL.md` | "sub-second" |
| C087 | `AGENTS.md` | `docs/mcp-servers.md` | "CRAFTHUB_PROD_DATABASE_URI" |
| C088 | `AGENTS.md` | `docs/mcp-servers.md` | "service-account token" |
| C117 | `apps/api/AGENTS.md` | `apps/api/AGENTS.md` | "Pattern-matching the neighbours" |
| C157 | `apps/api/AGENTS.md` | `apps/api/AGENTS.md` | "S3-compatible" |
| C164 | `apps/api/AGENTS.md` | `apps/api/AGENTS.md` | "loopback address" |
| C210 | `apps/web/AGENTS.md` | `apps/web/AGENTS.md` | "post-composer-dialog.tsx" |
| C243 | `apps/web/AGENTS.md` | `apps/web/AGENTS.md` | "unit-test the geometry" |
| C914 | `.agents/skills/spec-implement/SKILL.md` | `.agents/skills/spec-implement/SKILL.md` | "shared local Postgres/Redis" |
| C920 | `.agents/skills/spec-implement/SKILL.md` | `.agents/skills/spec-implement/references/execution-strategy.md` | "git worktree remove" |

## Corrected (deleted because false)

| ID | Was in | Why | Evidence |
|----|--------|-----|----------|
| C585 | `.agents/skills/qa-execution/SKILL.md` | False. The app ships react-i18next with three locales and two gate checks; the rule told QA to skip a live guardrail. | `apps/web/src/i18n/locales/pt-BR.json` |
| C675 | `.agents/skills/qa-report/SKILL.md` | False, same reason. | `apps/web/src/i18n/locales/es-ES.json` |
| C792 | `.agents/skills/spec-implement/SKILL.md` | False, and it instructed implementers to write raw strings the raw-string gate then rejects. | `scripts/guardrails/i18n-raw-strings.mjs` |
| C848 | `.agents/skills/spec-implement/SKILL.md` | False, same reason. | `apps/web/src/i18n/locales/en-US.json` |

## All cuts

| ID | Tier | Was in | Redundancy | Usefulness | Best match | Quote |
|----|------|--------|------------|------------|-----------|-------|
| C263 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/context7-usage/SKILL.md:1` (0.5) | Resolve the library ID with `resolve_library_id`. |
| C264 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/context7-usage/SKILL.md:17` (0.3) | Query with `query_docs` and a **specific** question, not the package name alone. Bad: "tailwind". Good: "How d |
| C265 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/deep-review/assets/PROMPT.md:17` (0.56) | Include the major version in the question when the repo pins one (see below). |
| C266 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/testing-boss/references/antipatterns.md:225` (0.5) | Apply the documented pattern. If Context7 contradicts what you remembered, Context7 wins. |
| C268 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/context7-usage/SKILL.md:1` (0.57) | Before modifying existing code that depends on those APIs. |
| C269 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/context7-usage/SKILL.md:9` (0.5) | Whenever you are unsure which version's API you are recalling. |
| C270 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `docs/mcp-servers.md:137` (0.26) | For any advanced pattern: infinite queries, optimistic updates, Fastify plugin encapsulation, Drizzle relation |
| C271 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/qa-execution/references/fix-loop.md:53` (0.44) | When a build or type error mentions a library symbol you believe should exist. |
| C277 | T1 | `.agents/skills/context7-usage/SKILL.md` | Hold:disagree | Mixed | `.agents/skills/context7-usage/SKILL.md:29` (0.38) | `fastify` (v5) — plugin encapsulation, lifecycle hooks, decorators, error handling. |
| C278 | T1 | `.agents/skills/context7-usage/SKILL.md` | Hold:disagree | Mixed | `.agents/skills/deep-review/references/output-contracts.md:137` (0.18) | `@fastify/*` plugins — cors, cookie, jwt, multipart, rate-limit, swagger, swagger-ui, static, helmet and frien |
| C279 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/qa-execution/SKILL.md:29` (0.27) | `fastify-type-provider-zod` (v6) — type provider wiring, `serializerCompiler` / `validatorCompiler`, and how i |
| C280 | T1 | `.agents/skills/context7-usage/SKILL.md` | Hold:disagree | Mixed | `.agents/skills/deep-review/references/taxonomy.md:97` (0.33) | `drizzle-orm` (0.44) + `drizzle-kit` — schema definition, relational queries, transactions, prepared statement |
| C281 | T1 | `.agents/skills/context7-usage/SKILL.md` | Hold:disagree | Mixed | `.agents/skills/qa-report/references/journeys-and-flows.md:37` (0.25) | `bullmq` — queues, workers, repeatable jobs, flows, graceful shutdown. |
| C282 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/qa-execution/references/fix-loop.md:61` (0.27) | `tsyringe` — decorators, `container.register*` variants, lifecycles, and how they interact with `reflect-metad |
| C283 | T1 | `.agents/skills/context7-usage/SKILL.md` | Hold:disagree | Mixed | `.agents/skills/context7-usage/SKILL.md:1` (0.2) | `openai` (node SDK) — chat/responses APIs, structured outputs, embeddings, streaming, retries, timeouts and to |
| C284 | T1 | `.agents/skills/context7-usage/SKILL.md` | Hold:disagree | Mixed | `.agents/skills/context7-usage/SKILL.md:1` (0.33) | `@opentelemetry/*` — SDK setup, auto-instrumentation, span attributes. |
| C285 | T1 | `.agents/skills/context7-usage/SKILL.md` | Hold:disagree | Mixed | `.agents/skills/i18n/SKILL.md:77` (0.33) | `@sentry/node` — init, integrations, and how it coexists with OpenTelemetry. |
| C286 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/no-workarounds/SKILL.md:81` (0.57) | `zod` **4**, imported as `zod/v4`. See the high-risk note above. |
| C287 | T1 | `.agents/skills/context7-usage/SKILL.md` | Hold:disagree | Mixed | `.agents/skills/context7-usage/SKILL.md:1` (0.25) | `react` (19) — actions, `use`, transitions, ref-as-prop, the removal of `forwardRef` ceremony, and the changed |
| C289 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/no-workarounds/SKILL.md:81` (0.43) | `@tanstack/react-router` — **code-based** routing only. See the high-risk note. |
| C290 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/deep-review/references/publish-github.md:1` (0.22) | `@tanstack/react-query` (v5) — the v5 object-signature API, `useSuspenseQuery`, invalidation, prefetch, and th |
| C291 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/no-workarounds/SKILL.md:81` (0.43) | `tailwindcss` (v4) — see the high-risk note above; pair with `DESIGN.md`. |
| C292 | T1 | `.agents/skills/context7-usage/SKILL.md` | Hold:disagree | Mixed | `.agents/skills/spec-writer/SKILL.md:117` (0.36) | `@radix-ui/*` primitives — dialog, alert-dialog, switch. Composition, portals, controlled state, and accessibi |
| C293 | T1 | `.agents/skills/context7-usage/SKILL.md` | Hold:disagree | Mixed | `docs/harness/plan-2026-09-harness-eval-and-split.md:413` (0.38) | `@dnd-kit/*` — sensors, collision detection, sortable, accessibility. Used in `apps/web/src/features/profile-l |
| C294 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/deep-review/references/context-pack.md:65` (0.56) | `react-grid-layout` — layout objects, breakpoints, and its interaction with dnd-kit in the same feature. |
| C295 | T1 | `.agents/skills/context7-usage/SKILL.md` | Hold:disagree | Mixed | `AGENTS.md:41` (0.3) | `react-hook-form` (+ `@hookform/resolvers` for the zod resolver) — controlled vs uncontrolled fields, `useFiel |
| C296 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/qa-execution/references/tours.md:73` (0.42) | `@tensorflow/tfjs` — in-browser inference for the "AI Match %" re-rank: model loading, tensor lifecycle and `d |
| C297 | T1 | `.agents/skills/context7-usage/SKILL.md` | Hold:disagree | Mixed | `.agents/skills/deep-review/references/context-pack.md:57` (0.33) | `@modelcontextprotocol/sdk` — server construction, transports (this server is **stdio**), tool/resource regist |
| C301 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/context7-usage/SKILL.md:1` (0.43) | Writing a `tailwind.config.js` because that is how Tailwind "always" worked. |
| C302 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/spec-writer/references/harness.md:121` (0.5) | Importing from `zod` instead of `zod/v4` and getting a subtly different schema type that then fails to line up |
| C304 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/qa-execution/SKILL.md:29` (0.43) | Copying a Fastify 4 plugin signature or a v4 error-handler shape into a v5 app. |
| C305 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/deep-review/references/taxonomy.md:97` (0.5) | Calling a Drizzle 0.2x query-builder method that no longer exists in 0.44. |
| C306 | T1 | `.agents/skills/context7-usage/SKILL.md` | Review | Mixed | `.agents/skills/deep-review/references/taxonomy.md:105` (0.36) | Guessing the openai SDK's structured-output API instead of checking, then shipping an unbounded retry loop. |
| C307 | T1 | `.agents/skills/deep-review/SKILL.md` | Review | Mixed | `.agents/skills/deep-review/SKILL.md:17` (0.55) | Review at CodeRabbit grade with no file cap and one assertive posture: funnel the diff, discover root/nested p |
| C308 | T1 | `.agents/skills/deep-review/SKILL.md` | Review | Mixed | `.agents/skills/deep-review/SKILL.md:173` (0.43) | Steps 1–4 drive an idempotent artifact pipeline under `<out>`: every stage gate is a bundled-script exit 0, va |
| C315 | T1 | `.agents/skills/deep-review/SKILL.md` | Review | Mixed | `.agents/skills/deep-review/SKILL.md:57` (0.39) | **Do not report a missing `t()` call or any i18n gap.** CraftHub has no i18n layer: `<html lang="en">` and all |
| C343 | T1 | `.agents/skills/deep-review/SKILL.md` | Hold:disagree | Mixed | `.agents/skills/deep-review/SKILL.md:125` (0.55) | Execute `<out>/jobs.json` with the mutating runner and engine contract loaded in Step 2. In this repo the runt |
| C1391 | T2 | `.agents/skills/deep-review/references/subagent-runtimes.md` | Hold:disagree | Slim | `—` (0) | Harness-referenced document `.agents/skills/deep-review/references/subagent-runtimes.md` is an on-demand load  |
| C1427 | T2 | `.agents/skills/testing-boss/references/sources.md` | Hold:disagree | Slim | `—` (0) | Harness-referenced document `.agents/skills/testing-boss/references/sources.md` is an on-demand load target wh |

