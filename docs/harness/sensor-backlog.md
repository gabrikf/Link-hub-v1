# Sensor backlog

Prose rules that could become deterministic checks, and have not yet. A rule
stays written out in full until its sensor exists — shortening the guide before
the check is what silently removes the rule.

Each row carries the rule text it would replace, so whoever builds the sensor
knows exactly what it has to catch.

## Built

| Sensor                                                                                       | Replaces                                                                                                                                            | Where                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `harness-check.mjs`                                                                          | "every cite in the harness resolves", the size budgets, skill frontmatter shape                                                                     | `scripts/guardrails/harness-check.mjs`, in the gate and CI                                                                                      |
| `design-tokens.mjs`                                                                          | "no `slate` / `gray` / `blue` / `indigo`", and "no hardcoded hex in a component" for the case with teeth — an arbitrary hex inside a Tailwind class | `scripts/guardrails/design-tokens.mjs`, in the gate and CI                                                                                      |
| `lint-changed.mjs` (the ratchet)                                                             | "the type-aware rules ratchet, so an inherited finding passes and one you add fails" (root `AGENTS.md`)                                             | `scripts/guardrails/lint-changed.mjs`, run by `pre-commit` (syntactic only) and by the gate/CI (both lint layers, against `lint-baseline.json`) |
| `eslint.config.js` + a `lint` script in all seven workspaces, gated by `LINT_ERROR_BASELINE` | "`npm run lint` is the syntactic layer" being true of the whole repo, not `apps/web` alone                                                          | every workspace's `eslint.config.js`; `.github/workflows/ci.yml`                                                                                |
| `@typescript-eslint/no-explicit-any` as `"error"`                                            | "Type everything. Never `any`." (root `AGENTS.md`)                                                                                                  | `packages/eslint-config/base.js` — off only in test files                                                                                       |
| `sonarjs.configs.recommended` (`eslint-plugin-sonarjs`)                                      | no prose rule existed for these bug classes; this is new coverage, not a check replacing a sentence                                                 | `packages/eslint-config/base.js`, in the syntactic layer, so it runs through `npm run lint`, `PostToolUse` and `pre-commit`                     |
| `router-lazy.test.ts`                                                                        | "Every route component is lazy via `lazyRouteComponent`"                                                                                            | `apps/web/src/router-lazy.test.ts`                                                                                                              |

`harness-check` and `design-tokens` carry self-test proof as `--self-test`,
and `router-lazy.test.ts` has a sabotage case as its third test — each checked
against a deliberate violation before being wired in. The four rows added on
2026-09-04 came from turning existing eslint rules on repo-wide rather than
from writing new detection logic, so their proof is the measured, named error
counts in `docs/harness/known-debt.md` (67 syntactic, 555 type-aware) instead
of a sabotage case.

**Two sensors that were in this table before 2026-09-04 no longer fire, and
neither removal reads like a decision.** `eslint no-restricted-imports` on
`apps/api/src/core/**` and `eslint no-restricted-imports` for `react-icons`
lived inline in `apps/api/eslint.config.js` and `apps/web/eslint.config.js`.
The 2026-09-04 change replaced both files' entire contents with
`export default [...config]` from the new shared `@repo/eslint-config/node`
and `@repo/eslint-config/react` — and neither restriction was carried into the
shared config. Re-derive this any time: `npx eslint 'src/core/**/*.ts'` from
`apps/api` reports no `no-restricted-imports` findings today, and an
`apps/web` file importing from `react-icons/md` (outside the allowed `/fi`
family) lints clean. `docs/harness/known-debt.md` still describes the
`src/core` layer violations as "found by the new eslint sensor on 2026-09-04";
that sentence and this section now disagree, and resolving which one is stale
is a decision for whoever picks the rule back up — rebuild it in the shared
config (where it would reach every workspace, not just the one it started in)
or record the loss as accepted debt.

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
_near_-duplicate of a long utility string, and the constants change. A literal
substring match misses a variant that reordered two utilities; a fuzzy match
fires on any card-ish element.

**Next step, if picked up:** compare the token _set_ of each `className`
literal in a `.tsx` file against the token set of each exported constant, and
flag an overlap above a threshold. Prototype it against the current tree first
— if it produces more than a handful of findings, it is not ready to block.

### `@typescript-eslint/no-explicit-any` — moved to Built

It is `"error"` in `packages/eslint-config/base.js` as of 2026-09-04 (off only
in test files — partial fakes and deliberately malformed payloads legitimately
reach for `any` there). Every workspace extends `base.js`, so this is now a
repo-wide check rather than a prose rule; see the Built table above. What is
left is the existing backlog of pre-2026-09-04 `any` usage that the rule now
reports but does not block — it is counted inside the syntactic and type-aware
totals in `docs/harness/known-debt.md`, not tracked separately here.
