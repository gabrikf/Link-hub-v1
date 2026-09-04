---
name: context7-usage
description: >-
  Consult Context7 for up-to-date library documentation BEFORE writing or
  modifying code that touches CraftHub's stack — Fastify 5 and @fastify/*,
  fastify-type-provider-zod, Drizzle ORM + pgvector, BullMQ, tsyringe, the
  openai SDK, zod 4, React 19, Vite 8, TanStack Router/Query, Tailwind CSS v4,
  Radix UI, dnd-kit, react-grid-layout, react-hook-form, TensorFlow.js,
  @modelcontextprotocol/sdk, Vitest 3, Playwright, OpenTelemetry, Sentry. Use it
  whenever you are about to reach for a library API from memory, and always for
  the recent majors (Tailwind v4, zod 4, Vite 8) whose APIs changed under the
  same names.
---

# Context7 — Current Docs Before Implementation

Model memory for fast-moving libraries is stale by construction. Several of CraftHub's
dependencies shipped a **major** version whose API changed while keeping the same
package name and the same import paths, so a wrong implementation looks plausible,
type-checks in places, and fails at runtime or at build. Consult Context7 first,
implement second.

## HIGHEST RISK — always check these, never write them from memory

These are recent majors whose APIs an agent will get wrong from memory:

- **Tailwind CSS v4** — CSS-first configuration. There is **no `tailwind.config.js`** in
  this repo. Theme tokens, variants and plugins are declared in CSS with `@theme`,
  `@custom-variant`, `@utility`, `@plugin`, and the import is `@import "tailwindcss"`,
  not the v3 `@tailwind base/components/utilities` triple. Any answer that reaches for
  a JS config object is a v3 answer and is wrong here. CraftHub's design language and
  token names live in `DESIGN.md` at the repo root — read that alongside the Tailwind
  docs before styling anything.
- **zod 4** — the repo's schemas import from **`zod/v4`**, not bare `zod`. Error
  customization, `.refine`, issue shapes, `z.output`/`z.input` inference and the
  error-map API all differ from zod 3. Confirm the v4 spelling before adding a schema
  to `packages/schemas` (`@repo/schemas`), because that package is the contract every
  workspace types against.
- **Vite 8** — config, plugin hooks, environment API and the dev-server surface moved
  since v5/v6. Do not copy a Vite 5 `vite.config.ts` shape from memory.
- **TanStack Router — code-based routing.** CraftHub declares its routes **in code** in
  `apps/web/src/router.tsx`. There is **no file-based route tree**, no `routeTree.gen.ts`,
  and no `@tanstack/router-plugin` file-route generation. Most published examples and
  most generated snippets assume file-based routing and **do not apply here**. When you
  query Context7, ask explicitly for the code-based / `createRoute` + `getParentRoute`
  API.
