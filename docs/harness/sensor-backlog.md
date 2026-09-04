# Sensor backlog

Prose rules that could become deterministic checks, and have not yet. A rule
stays written out in full until its sensor exists — shortening the guide before
the check is what silently removes the rule.

Each row carries the rule text it would replace, so whoever builds the sensor
knows exactly what it has to catch.

## Built

| Sensor | Replaces | Where |
|---|---|---|
| `harness-check.mjs` | "every cite in the harness resolves", the size budgets, skill frontmatter shape | `scripts/guardrails/harness-check.mjs`, in the gate and CI |
| `design-tokens.mjs` | "no `slate` / `gray` / `blue` / `indigo`", and "no hardcoded hex in a component" for the case with teeth — an arbitrary hex inside a Tailwind class | `scripts/guardrails/design-tokens.mjs`, in the gate and CI |
| eslint `no-restricted-imports` on `apps/api/src/core/**` | "`src/core/` must not import from `src/infra/`, `fastify`, `drizzle-orm`, `ioredis`, `openai` or `pg`" | `apps/api/eslint.config.js` |
| eslint `no-restricted-imports` for `react-icons` | "Icons: `react-icons/fi` only" | `apps/web/eslint.config.js`, with a named brand-mark exception list |
| `router-lazy.test.ts` | "Every route component is lazy via `lazyRouteComponent`" | `apps/web/src/router-lazy.test.ts` |

Each of the five was checked against a deliberate violation before being wired
in; `harness-check` and `design-tokens` carry that proof as `--self-test`, and
`router-lazy.test.ts` has a sabotage case as its third test.

Two of them found real violations the prose rule had not:

- **The layer rule** was already broken in four `apps/api/src/core/` files (see
  `docs/harness/known-debt.md`). The gate lints only changed files, so nothing
  is red today — but the rule now blocks new violations, which is the point.
- **The icon family rule** and **the hex rule** were both stated absolutely and
  are both violated on purpose, by third-party brand marks. The sensors encode
  that exception explicitly instead of leaving it to whoever reads the rule next.

## Not built

### Every colour utility needs a `dark:` counterpart

**Rule it would replace** (`apps/web/AGENTS.md`): "Every colour utility needs a
`dark:` counterpart. This is the most common visual bug in the repo and it is
invisible to anyone developing in light mode — the element just renders
white-on-white for half the users."

**Why not yet:** a text heuristic over `className` strings is noisy in both
directions. `bg-violet-600` on a button that is violet in both themes is
correct and would be flagged; a colour applied through a variable would be
missed. The honest sensor is a rendered-pixel diff of the two themes, which the
visual runner already does when a scenario captures both — the gap is that
capturing both themes is a convention, not an enforced one.

**Next step, if picked up:** make `npm run visual:run` fail a scenario that
captures only one theme, so the existing sensor covers the rule instead of a
new lint rule guessing at it.

### The rest of "no hardcoded hex in a component"

**Rule it would replace** (`DESIGN.md` §"No hardcoded hex in a component"):
"The only hex values in this codebase live in `index.css` … and in
`brand-logo.tsx`."

**Why not yet:** that sentence is no longer true, and the sensor cannot make it
true. Nine files under `apps/web/src` contain hex today, and the ones outside
`index.css` are legitimate: the third-party link-icon brand colours moved to
`lib/link-icons.tsx`, and the profile accent presets to
`features/profile/components/profile-theme.ts`. `#E4405F` is Instagram's, not a
design choice. `design-tokens.mjs` enforces the half with teeth — an arbitrary
hex inside a Tailwind class — and leaves hex in a data structure alone.

**Next step, if picked up:** decide whether the brand and preset tables should
move back into `index.css` as CSS variables. If they should, that is a
refactor with its own review; if they should not, `DESIGN.md`'s sentence needs
to name them as the exception. Either way it is a decision, not a check.

### Never hand-write the `SURFACE*` / `BADGE*` / `FOCUS_RING*` class strings

**Rule it would replace** (`apps/web/AGENTS.md`, `DESIGN.md`): "Import
`SURFACE`, `SURFACE_INSET`, `BADGE`, `FOCUS_RING*` from
`src/shared-components/surface.ts`. **Never hand-write those class strings.**
There is no `<Card>` component — the constants are the card."

**Why not yet:** detecting a hand-written copy means recognising a
*near*-duplicate of a long utility string, and the constants change. A literal
substring match misses a variant that reordered two utilities; a fuzzy match
fires on any card-ish element.

**Next step, if picked up:** compare the token *set* of each `className`
literal in a `.tsx` file against the token set of each exported constant, and
flag an overlap above a threshold. Prototype it against the current tree first
— if it produces more than a handful of findings, it is not ready to block.

### `@typescript-eslint/no-explicit-any` as an error

**Rule it would replace** (root `AGENTS.md`): "Type everything. Never `any`."

**Why not yet:** it is `"warn"` in `apps/api/eslint.config.js` — deliberately,
because `apps/api` carries an unlinted backlog and a config that is red on
arrival is a config people bypass. `apps/web` does not configure the rule at
all beyond the typescript-eslint recommended default. So the prose rule is
still the only thing enforcing this, and it stays in the root in full.

**Next step, if picked up:** it is downstream of the `apps/api` lint backlog in
`docs/harness/known-debt.md`. Raise it to `"error"` in the same change that
clears the backlog, not before.
