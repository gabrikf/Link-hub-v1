# apps/web — Agent Rules

React 19, Vite 8, TanStack Router + Query, Tailwind v4, Zustand, Radix.
Read the root `AGENTS.md` first, and `DESIGN.md` before touching anything visual.

```bash
npm run dev:web      # http://localhost:5173
```

---

## Routing is code-based

`src/router.tsx`. There is **no `routes/` directory, no file-based route tree and
no generated `routeTree.gen.ts`.** Most TanStack Router examples on the internet
(and most a model will produce from memory) assume file-based routing and do not
apply here.

To add a route: `createRoute({ getParentRoute, path, component })`, then add it
to `rootRoute.addChildren([...])`.

**Every route component is lazy** via `lazyRouteComponent`, and that is
load-bearing, not stylistic. The entry bundle used to carry react-grid-layout,
react-draggable, react-select, the recruiter search page and settings onto
`/profile/$username` — the public, shareable, mobile-heavy page that needs none
of them. Splitting took the entry from 996 kB / 295 kB gzip to 336 kB / 108 kB
gzip. **A statically imported route component silently undoes that.**

`defaultPreload: "intent"` means hovering a nav item fetches its chunk, so
splitting costs nothing perceptible.

Route-level states come from `src/shared-components/route-states.tsx`:
`RoutePending`, `RouteErrorState`, `RouteNotFound`. Use them.

---

## Feature folders

```
src/features/<feature>/{pages,components,hooks,lib}/
src/shared-components/     primitives used across features
src/lib/                   cross-cutting helpers (api clients, auth, theme, query client)
```

Rule: something used by **one** feature lives in that feature. Used by two, it
moves up to `shared-components/` or `lib/`. Do not import from another feature's
internals — that is the signal to promote.

File naming is kebab-case, including components (`post-composer-dialog.tsx`).

---

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

---

## The four states

Every screen that reads from the network renders **loading, empty, error and
filled**. All four. Each one designed and each one actually looked at.

```bash
npm run visual:run -- scripts/visual/scenarios/public-profile.scenario.mjs
```

The runner forces empty and error with mocks and holds a response open to catch
the loading branch, in one browser launch. Capture **both themes** — see below.

A pull request with only the filled state is incomplete.

---

## Dark mode

Class strategy: `@custom-variant dark (&:where(.dark, .dark *))` in `index.css`,
toggled by `src/lib/theme.ts`, persisted in `localStorage` under
`crafthub-theme`.

**Every colour utility needs a `dark:` counterpart.** This is the most common
visual bug in the repo and it is invisible to anyone developing in light mode —
the element just renders white-on-white for half the users.

To test dark mode, set `crafthub-theme` and reload. Never force the `.dark` class
directly: that bypasses `applyTheme`, so a broken theme bootstrap would still
look perfect.

---

## Design primitives

See `DESIGN.md`. The rules that get violated most:

- Import `SURFACE`, `SURFACE_INSET`, `BADGE`, `FOCUS_RING*` from
  `src/shared-components/surface.ts`. **Never hand-write those class strings.**
  There is no `<Card>` component — the constants are the card, and padding stays
  at the call site.
- `Button`'s `fullWidth` defaults to **true**. In a row of controls you almost
  always want `fullWidth={false}`.
- `Button` has `shouldHaveConfirmation` (Radix alert-dialog) and `isLoading`
  (spinner + `aria-busy` + blocked interaction). Do not reimplement either.
- Icons: `react-icons/fi` only.
- Inside `.profile-root`, accent colour comes from `--profile-accent-*`
  variables. A hardcoded `text-violet-600` on a profile block stays violet when
  the user picks the "sunset" preset.

---

## Forms

react-hook-form + `zodResolver`, and **the zod schema comes from
`@repo/schemas`** — the same one the api validates against. A locally redefined
form schema is a contract fork that will drift.

---

## The layout editor

`features/profile-layout` uses dnd-kit and react-grid-layout with
`GRID_ROW_HEIGHT = 40` and `GRID_GAP = 12`. Layout maths uses those constants,
never a literal. Drag-and-drop is genuinely hard to test in jsdom — the geometry
is the part worth unit-testing; the interaction belongs in a visual scenario.

---

## Tests

vitest + `@testing-library/react` + jsdom. `src/test-setup.ts` is the setup file.

Test **behaviour a user can observe**, not implementation. Query by role and
accessible name; this app has only a handful of `data-testid` attributes and
that is fine — role/text locators work in both the RTL tests and the Playwright
scenarios, so one locator vocabulary covers both.

A component test that renders and asserts nothing is 100% covered and worth
nothing. See `docs/coverage.md`.

---

## Lint

`apps/web` is the only workspace with a `lint` script, and `npm run lint`
currently reports **30 pre-existing errors** — mostly
`react-hooks/set-state-in-effect` (new in eslint-plugin-react-hooks v7) and
`react-refresh/only-export-components`. They are recorded and ratcheted in
`.github/workflows/ci.yml`.

Do not fix them as a side quest, and do not add to them. The gate lints only the
files you changed. If a rule fires on your code, fix the code — an inline
`eslint-disable` to clear the ratchet is a workaround, not a fix.
