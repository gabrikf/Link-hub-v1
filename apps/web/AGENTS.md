# apps/web — Agent Rules

React 19, Vite 8, TanStack Router + Query, Tailwind v4, Zustand, Radix.
Read the root `AGENTS.md` first, and `DESIGN.md` before touching anything visual.

```bash
npm run dev:web      # http://localhost:5173
```

## Routing is code-based

`src/router.tsx`. There is **no `routes/` directory, no file-based route tree and
no generated `routeTree.gen.ts`.** Most TanStack Router examples on the internet
(and most a model will produce from memory) assume file-based routing and do not
apply here.

To add a route: `createRoute({ getParentRoute, path, component })`, then add it
to `rootRoute.addChildren([...])`. **Every route component is lazy** via `lazyRouteComponent`, and that is
load-bearing, not stylistic. The entry bundle used to carry react-grid-layout,
react-draggable, react-select, the recruiter search page and settings onto
`/profile/$username` — the public, shareable, mobile-heavy page that needs none
of them. Splitting took the entry from 996 kB / 295 kB gzip to 336 kB / 108 kB
gzip. **A statically imported route component silently undoes that**, so
`src/router-lazy.test.ts` fails the build if one appears.

`defaultPreload: "intent"` means hovering a nav item fetches its chunk, so
splitting costs nothing perceptible. Route-level states come from
`src/shared-components/route-states.tsx` — `RoutePending`, `RouteErrorState`,
`RouteNotFound`. Use them.

## Feature folders

```
src/features/<feature>/{pages,components,hooks,lib}/
src/shared-components/     primitives used across features
src/lib/                   cross-cutting helpers (api clients, auth, theme, query client)
```

Rule: something used by **one** feature lives in that feature. Used by two, it
moves up to `shared-components/` or `lib/`. Do not import from another feature's
internals — that is the signal to promote. Components are kebab-case too
(`post-composer-dialog.tsx`).

## Server state is TanStack Query. Always.

Never `useEffect` + `fetch`. Never a `useState` mirroring server data.

- Query and mutation definitions live in the feature's `lib/` (see
  `features/settings/lib/connection-queries.ts`, `src/lib/post-queries.ts`).
- Reuse the query key; invalidate rather than refetching by hand.
- `retry` is left at the TanStack default of 3 with exponential backoff. That is
  why an error state takes several seconds to appear — it is not a hang, and a
  test or scenario waiting for it needs a generous timeout.
- HTTP goes through the axios client in `src/lib/`, which attaches auth headers
  and runs the unauthorized interceptor. Do not call `fetch` directly.
- **Parse responses through `@repo/schemas`.** An unparsed `any` from the network
  is how a contract break reaches the user as `undefined` on screen.

Client state is the **single Zustand store**. Do not add a second store, and do
not put server data in it.

## The four states

Every screen that reads from the network renders **loading, empty, error and
filled**. All four. Each one designed and each one actually looked at.

```bash
npm run visual:run -- scripts/visual/scenarios/public-profile.scenario.mjs
```

The runner forces empty and error with mocks and holds a response open to catch
the loading branch, in one browser launch, failing on console errors, uncaught
exceptions and unexpected 4xx/5xx. Capture **both themes** — see below. Those
four states belong in a visual scenario, not a unit test, and a pull request
with only the filled state is incomplete.

## Dark mode

Class strategy: `@custom-variant dark (&:where(.dark, .dark *))` in `index.css`,
toggled by `src/lib/theme.ts`, persisted in `localStorage` under
`crafthub-theme`.

**Every colour utility needs a `dark:` counterpart.** This is the most common
visual bug in the repo and it is invisible to anyone developing in light mode —
the element just renders white-on-white for half the users.

To test dark mode, set `crafthub-theme` and reload. Never force the `.dark`
class directly — that bypasses `applyTheme`, so a broken theme bootstrap would
still look perfect.

## Design primitives

See `DESIGN.md`. The rules that get violated most:

- Import `SURFACE`, `SURFACE_INSET`, `BADGE`, `FOCUS_RING*` from
  `src/shared-components/surface.ts`. **Never hand-write those class strings.**
  There is no `<Card>` component — the constants are the card, and padding stays
  at the call site.
- `Button`'s `fullWidth` defaults to **true**. In a row of controls you almost
  always want `fullWidth={false}`.
- `Button` has `shouldHaveConfirmation` (Radix alert-dialog) and `isLoading`
  (spinner + `aria-busy` + blocked interaction) — do not reimplement either.
- Icons: `react-icons/fi` only — `eslint.config.js` enforces it.
- `violet` accent, `zinc` neutrals, seven semantic colours. No `slate`, `gray`,
  `blue` or `indigo`, and no hardcoded hex outside `index.css` and
  `brand-logo.tsx`; `scripts/guardrails/design-tokens.mjs` checks both.
- Inside `.profile-root`, accent colour comes from `--profile-accent-*`
  variables. A hardcoded `text-violet-600` on a profile block stays violet when
  the user picks the "sunset" preset.

## Forms

react-hook-form + `zodResolver`, and **the zod schema comes from
`@repo/schemas`** — the same one the api validates against. A locally redefined
form schema is a contract fork that drifts.

## i18n

Every user-visible string goes through `t()`, with its key added to all three
locale files in `src/i18n/locales/` in the same commit — and search those files
for the TEXT before adding a key. `npm run i18n:check` runs both halves (parity,
and no visible text outside `t()`); the gate runs them too. The `i18n` skill is
the full contract.

## The layout editor

`features/profile-layout` uses dnd-kit and react-grid-layout. Layout maths uses
the `GRID_ROW_HEIGHT` / `GRID_GAP` constants, never a literal. Drag-and-drop is
hard to test in jsdom: unit-test the geometry, put the interaction in a visual
scenario.

## Tests

vitest + `@testing-library/react` + jsdom. `src/test-setup.ts` is the setup file.

Test **behaviour a user can observe**, not implementation. Query by role and
accessible name; this app has only a handful of `data-testid` attributes and
that is fine — role/text locators work in both the RTL tests and the Playwright
scenarios, so one vocabulary covers both. A component test that renders and
asserts nothing is 100% covered and worth nothing. See `docs/coverage.md`.

## Lint

Every workspace has a `lint` script now; `apps/web` was the only one until
2026-09-04. The shared config is `@repo/eslint-config/react` — typescript-eslint,
SonarQube's analyzer rules via `eslint-plugin-sonarjs`, react-hooks and
react-refresh.

`npm run lint` reports a **recorded backlog** — counted, printed and ratcheted
by `.github/workflows/ci.yml`, with the detail in `docs/harness/known-debt.md`.
Read the number off the CI job rather than off a copy in prose; that copy has
already drifted once. The 26 `react-hooks/set-state-in-effect` and
`react-refresh/only-export-components` findings are the bulk of it, and clearing
them means refactoring components that work today — a separate task, with its
own review and its own visual check.

The type-aware rules live in `eslint.typed.config.js` and run through the
ratchet in `scripts/guardrails/lint-changed.mjs`, not through `npm run lint`.

Do not fix them as a side quest, and do not add to them. The gate lints only the
files you changed; if a rule fires on your code, fix the code. An inline
`eslint-disable` to clear the ratchet is a workaround, not a fix.
