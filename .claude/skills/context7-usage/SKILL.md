---
name: context7-usage
description: >-
  Consult Context7 for up-to-date library documentation BEFORE writing or
  modifying code that touches LinkHub's stack — Fastify 5 and @fastify/*,
  fastify-type-provider-zod, Drizzle ORM + pgvector, BullMQ, tsyringe, the
  openai SDK, zod 4, React 19, Vite 8, TanStack Router/Query, Tailwind CSS v4,
  Radix UI, dnd-kit, react-grid-layout, react-hook-form, TensorFlow.js,
  @modelcontextprotocol/sdk, Vitest 3, Playwright, OpenTelemetry, Sentry. Use it
  whenever you are about to reach for a library API from memory, and always for
  the recent majors (Tailwind v4, zod 4, Vite 8) whose APIs changed under the
  same names.
---

# Context7 — Current Docs Before Implementation

Model memory for fast-moving libraries is stale by construction. Several of LinkHub's
dependencies shipped a **major** version whose API changed while keeping the same
package name and the same import paths, so a wrong implementation looks plausible,
type-checks in places, and fails at runtime or at build. Consult Context7 first,
implement second.

## How to use it

1. Resolve the library ID with `resolve_library_id`.
2. Query with `query_docs` and a **specific** question, not the package name alone.
   Bad: "tailwind". Good: "How do I define a custom dark-mode variant in Tailwind CSS
   v4 CSS-first config without tailwind.config.js?"
3. Include the major version in the question when the repo pins one (see below).
4. Apply the documented pattern. If Context7 contradicts what you remembered,
   Context7 wins.

## When to consult

- Before creating anything new on top of one of the libraries below.
- Before modifying existing code that depends on those APIs.
- Whenever you are unsure which version's API you are recalling.
- For any advanced pattern: infinite queries, optimistic updates, Fastify plugin
  encapsulation, Drizzle relational queries, BullMQ flows, custom zod transforms,
  MCP server capabilities, TF.js layer/model surgery.
- When a build or type error mentions a library symbol you believe should exist.

## HIGHEST RISK — always check these, never write them from memory

These are recent majors whose APIs an agent will get wrong from memory:

- **Tailwind CSS v4** — CSS-first configuration. There is **no `tailwind.config.js`** in
  this repo. Theme tokens, variants and plugins are declared in CSS with `@theme`,
  `@custom-variant`, `@utility`, `@plugin`, and the import is `@import "tailwindcss"`,
  not the v3 `@tailwind base/components/utilities` triple. Any answer that reaches for
  a JS config object is a v3 answer and is wrong here. LinkHub's design language and
  token names live in `DESIGN.md` at the repo root — read that alongside the Tailwind
  docs before styling anything.
- **zod 4** — the repo's schemas import from **`zod/v4`**, not bare `zod`. Error
  customization, `.refine`, issue shapes, `z.output`/`z.input` inference and the
  error-map API all differ from zod 3. Confirm the v4 spelling before adding a schema
  to `packages/schemas` (`@repo/schemas`), because that package is the contract every
  workspace types against.
- **Vite 8** — config, plugin hooks, environment API and the dev-server surface moved
  since v5/v6. Do not copy a Vite 5 `vite.config.ts` shape from memory.
- **TanStack Router — code-based routing.** LinkHub declares its routes **in code** in
  `apps/web/src/router.tsx`. There is **no file-based route tree**, no `routeTree.gen.ts`,
  and no `@tanstack/router-plugin` file-route generation. Most published examples and
  most generated snippets assume file-based routing and **do not apply here**. When you
  query Context7, ask explicitly for the code-based / `createRoute` + `getParentRoute`
  API.

## Library list

### Backend — `apps/api`

- `fastify` (v5) — plugin encapsulation, lifecycle hooks, decorators, error handling.
- `@fastify/*` plugins — cors, cookie, jwt, multipart, rate-limit, swagger,
  swagger-ui, static, helmet and friends. Registration options change per major.
- `fastify-type-provider-zod` (v6) — type provider wiring, `serializerCompiler` /
  `validatorCompiler`, and how it feeds the Swagger transform at `/docs`.
- `drizzle-orm` (0.44) + `drizzle-kit` — schema definition, relational queries,
  transactions, prepared statements, and **pgvector** column/index/operator support
  (`vector`, HNSW/IVFFlat indexes, distance operators).
- `bullmq` — queues, workers, repeatable jobs, flows, graceful shutdown.
- `tsyringe` — decorators, `container.register*` variants, lifecycles, and how they
  interact with `reflect-metadata`. The DI container is `apps/api/src/infra/di/container.ts`.
- `openai` (node SDK) — chat/responses APIs, structured outputs, embeddings,
  streaming, retries, timeouts and token accounting. Ask about cost/limit controls,
  not only about call shape.
- `@opentelemetry/*` — SDK setup, auto-instrumentation, span attributes.
- `@sentry/node` — init, integrations, and how it coexists with OpenTelemetry.

### Contract — `packages/schemas`

- `zod` **4**, imported as `zod/v4`. See the high-risk note above.

### Frontend — `apps/web`

- `react` (19) — actions, `use`, transitions, ref-as-prop, the removal of
  `forwardRef` ceremony, and the changed `useEffect`/StrictMode behaviours.
- `vite` (8) — see the high-risk note above.
- `@tanstack/react-router` — **code-based** routing only. See the high-risk note.
- `@tanstack/react-query` (v5) — the v5 object-signature API, `useSuspenseQuery`,
  invalidation, prefetch, and the `isPending` / `isLoading` rename.
- `tailwindcss` (v4) — see the high-risk note above; pair with `DESIGN.md`.
- `@radix-ui/*` primitives — dialog, alert-dialog, switch. Composition, portals,
  controlled state, and accessibility props.
- `@dnd-kit/*` — sensors, collision detection, sortable, accessibility. Used in
  `apps/web/src/features/profile-layout`.
- `react-grid-layout` — layout objects, breakpoints, and its interaction with dnd-kit
  in the same feature.
- `react-hook-form` (+ `@hookform/resolvers` for the zod resolver) — controlled vs
  uncontrolled fields, `useFieldArray`, resolver typing against zod 4.
- `@tensorflow/tfjs` — in-browser inference for the "AI Match %" re-rank: model
  loading, tensor lifecycle and `dispose`/`tidy` discipline.

### MCP — `apps/mcp`

- `@modelcontextprotocol/sdk` — server construction, transports (this server is
  **stdio**), tool/resource registration and schema declaration.

### Testing and tooling

- `vitest` (3.x; `apps/training` is on 4.x) — config, `vi.mock` hoisting semantics,
  `vi.fn` / `vi.spyOn`, environments, coverage providers, and `vitest related`.
- `@testing-library/react` — queries, `user-event`, `findBy*` vs `waitFor`.
- `playwright` — used by the visual scenario runner under `scripts/visual/`.

## Anti-patterns this skill exists to prevent

- Writing a `tailwind.config.js` because that is how Tailwind "always" worked.
- Importing from `zod` instead of `zod/v4` and getting a subtly different schema type
  that then fails to line up with `@repo/schemas`.
- Generating a file-based TanStack Router tree and wiring nothing into `router.tsx`.
- Copying a Fastify 4 plugin signature or a v4 error-handler shape into a v5 app.
- Calling a Drizzle 0.2x query-builder method that no longer exists in 0.44.
- Guessing the openai SDK's structured-output API instead of checking, then shipping
  an unbounded retry loop.
