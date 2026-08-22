# LinkHub — Agent Rules

A developer-profile platform. Developers import a resume, arrange a public
profile, recruiters search by job description (pgvector + an in-browser TF.js
re-rank shown as "AI Match %"), and coding agents publish posts through MCP
behind a per-user **disclosure policy**.

npm workspaces + Turborepo. Node 22. Ports: **api 3333**, **web 5173**.
Deep context lives in `apps/api/AGENTS.md` and `apps/web/AGENTS.md` — read the
one you are working in. `README.md` is the orientation doc. `DESIGN.md` is the
visual contract.

---

## The gate

```bash
node scripts/guardrails/pre-push.mjs      # or: npm run guardrails
```

One command. It builds `@repo/schemas`, type-checks and tests only what your
change affects, lints only the files you touched, and prints `guardrails PASS`
when it is green. The same script runs on `git push` (husky) and on the Claude
Code `Stop` hook — **you are not done until it passes.**

If it fails, **fix the cause**. Do not reach for `--no-verify`, an inline
`eslint-disable`, a `.skip`, a type assertion, or a widened zod schema to get
past it. If you genuinely cannot fix it, say so plainly instead of hiding it.

The gate skips tests it cannot run (no docker → no Postgres-bound api tests; no
`OPENAI_API_KEY` → no live-embedding tests) and **says so by name**. A narrowed
run that announces what it narrowed is honest. Do not silence those notices.

---

## Contract first

`@repo/schemas` is the single source of truth for every shape crossing a
boundary — api ↔ web, api ↔ mcp, api ↔ extractor.

1. **Change the schema first**, in `packages/schemas/src/<module>/`.
2. **Build it**: `npm run build:schemas`. Everything else type-checks against the
   emitted `dist/index.d.ts`, so an unbuilt change produces errors that point at
   consumers and say nothing about the real cause. This is the #1 confusing
   failure in this repo.
3. Then update the api handler and the web caller.

Never define a request/response type locally to "unblock" yourself. Never widen
a schema so a bad payload passes — that turns a caught contract break into a
silent runtime bug.

**The strongest sensor here:** assert real captured payloads through the shared
schema. `schema.parse(realPayloadCapturedFromTheRunningApi)` in a test turns
contract drift into a failing test instead of a support ticket.

---

## Testing

**vitest**, everywhere. Never jest. Run focused work with
`npx vitest related <file> --run`.

Write a test whenever the work is a **business rule**, is **reused**, or can be
expressed as one. Where it belongs:

| What | Where |
|---|---|
| Pure business rule | Next to the use case in `apps/api/src/core/**` |
| HTTP behaviour, auth, validation | `build-test-app.ts` + `server.inject` — hermetic, in-memory, no database |
| Contract | `.parse()` a real payload through `@repo/schemas` |
| Component behaviour | `@testing-library/react` next to the component |
| A whole screen's four states | A visual scenario, not a unit test |

Do not edit an existing test to make your change pass unless the user asked for
a behaviour change that genuinely requires it — and check the blast radius first.

Some api tests need real infrastructure and will hang without it. Start it:
`bash db-manage.sh start`. Details in `apps/api/AGENTS.md`.

---

## The four-state rule

Every screen that reads from the network must handle **loading, empty, error and
filled** — all four, designed, each one actually looked at. Shipping only the
filled state is an incomplete change. `apps/web/src/shared-components/route-states.tsx`
provides the route-level versions.

Prove it with the visual runner rather than by claiming it:

```bash
npm run visual:run -- scripts/visual/scenarios/public-profile.scenario.mjs
```

One process walks every state and fails on console errors, uncaught exceptions
and unexpected 4xx/5xx. Capture **both themes** — a missing `dark:` variant is
invisible to anyone working in light mode.

---

## Design

`DESIGN.md` is prescriptive. The short version:

- Import `SURFACE*`, `BADGE*`, `FOCUS_RING*` from
  `apps/web/src/shared-components/surface.ts`. **Never hand-write those class
  strings** — that is how the codebase ended up with ten forks of one card.
- There is **no `<Card>` component**; the constants are the card.
- Every colour utility needs a `dark:` counterpart.
- `violet` accent, `zinc` neutrals, seven semantic colours. No `slate`, `gray`,
  `blue`, `indigo`. No hardcoded hex outside `index.css` and `brand-logo.tsx`.
- `Button` `fullWidth` defaults to **true** — pass `fullWidth={false}` in a row.
  Use its built-in `shouldHaveConfirmation` and `isLoading`; do not reimplement.
- Icons: `react-icons/fi` (Feather) only.
- Inside `.profile-root`, accent colours come from `--profile-accent-*`
  variables, never from violet utility classes.

---

## Conventions

- **File naming: kebab-case** everywhere.
- **Type everything. Never `any.`** `unknown` + a zod parse is the honest form.
- `null` for an absent value that is modelled (a nullable DB column);
  `undefined` only for genuinely not-provided.
- Web features are self-contained: `apps/web/src/features/<feature>/{pages,components,hooks,lib}/`.
  Something used by two features moves to `shared-components/` or `lib/`.
- Server state is **TanStack Query**, never `useEffect` + `fetch`. Client state
  is the single Zustand store. Forms are react-hook-form + a zod resolver.

---

## i18n — does not exist yet

There is no i18next, no `t()`, no locale files. Every user-visible string is
hardcoded English and `<html lang="en">`.

**Do not invent `t()` calls or add an i18n library on your own initiative.** Write
plain English strings, and keep them out of deeply nested logic so the eventual
extraction is mechanical. The planned setup — react-i18next, `pt-BR` / `en-US` /
`es-ES` under `apps/web/src/i18n/locales/` — is documented in the `i18n` skill,
which is the migration guide for when the user asks for it.
`scripts/guardrails/i18n-parity.mjs` already runs in the gate as a no-op and
starts enforcing locale parity the day the first locale file lands.

---

## MCP

- **context7** — consult it before writing against any external library. This
  repo runs several recent majors (Tailwind v4, zod 4, Vite 8, React 19,
  Fastify 5, Drizzle 0.44) whose APIs a model will get wrong from memory. Note
  TanStack Router here is **code-based** (`src/router.tsx`), so most generated
  file-based-routing examples do not apply.
- **postgres** — read-only, local dev database only. Use it to *verify*: after an
  action that should have written a row, query the table by the correlation id
  you control. "The endpoint returned 201" is not evidence. See
  `docs/mcp-servers.md`.

---

## Known debt — do not "fix" it as a side quest

Every one of these is recorded on purpose. Fixing one is its own task, with its
own review. Do not let it grow, and do not let it block you either.

- **30 pre-existing eslint errors** in `apps/web`, recorded and ratcheted in
  `.github/workflows/ci.yml`. The gate lints only *your* changed files.
- **`apps/api` has no lint history.** `apps/api/eslint.config.js` exists but
  apps/api deliberately has no `lint` script — see the comment in that file.
- **`packages/eslint-config` uses `eslint-plugin-only-warn`**, which rewrites
  every error to a warning and neuters any gate consuming it. Nothing meant to
  block should extend that base.
- **`apps/mcp` has zero tests.** Its coverage floor is 0 and it needs a first test.
- **`packages/ui` is dead scaffolding** — nothing imports it.
- **`apps/api` and `apps/training` do not extend `@repo/typescript-config`**, so
  they miss `noUncheckedIndexedAccess`.
- There is a stray `pluguins/` directory (typo). Leave it.

---

## Output contract

Finish every task with a plain-language summary:

1. **What was done** — simple words, no jargon.
2. **Files changed, and why each one.**
3. **How to see it in the UI** — the exact route, how to navigate there, which
   filters or fixtures to use, and which seeded account
   (`bash db-manage.sh seed-all`) to sign in as.
4. **What you did not verify**, and why. This is not optional. A summary that
   omits the untested part is the most expensive kind of wrong.
