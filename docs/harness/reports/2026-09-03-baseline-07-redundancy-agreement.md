# Harness Eval: Judge Agreement (Track B)

> Run dir: `.harness-eval/runs/2026-09-03-baseline`
> Trap gate: PASS (misses=0)
> Bands: Ship = dual REDUNDANT + J2 cost≤1; Review = dual KEEP; Hold = disagree / missing

## What these words mean

| Word | Meaning | You should |
|------|---------|------------|
| **Ship** | Both judges: text is redundant and cheap to rediscover | Delete / trim |
| **Review** | Both judges: keep (not redundant) | Leave alone |
| **Hold** | Judges disagreed or score missing | Do nothing yet |
| **Trap PASS** | Planted traps scored correctly | Trust Ship |

This track answers: *would an agent rediscover this without the harness?* Not the same as usefulness (`10-usefulness-agreement.md`).

## Executive summary

- Real claims scored: 1429
- Ship: **83**
- Review: **993**
- Hold: **353**
- Trap misses: none

## Discrimination (plants)

| ID | Expected family | J2 family |
|----|-----------------|-----------|
| P001 | REDUNDANT | REDUNDANT |
| P002 | REDUNDANT | REDUNDANT |
| P003 | REDUNDANT | REDUNDANT |
| P004 | REDUNDANT | REDUNDANT |
| P005 | KEEP | KEEP |
| P006 | KEEP | KEEP |

Ship by tier: {'T0': 14, 'T1': 69}
Hold by tier: {'T0': 39, 'T1': 271, 'T2': 43}

## Ship

| ID | Tier | Source | J1 | J2 cost/class | Quote |
|----|------|--------|----|---------------|-------|
| C018 | T0 | `AGENTS.md` | REDUNDANT-CODE | 0/REDUNDANT-CODE | npm workspaces + Turborepo. Node 22. Ports: **api 3333**, **web 5173**. |
| C041 | T0 | `AGENTS.md` | REDUNDANT-CODE | 0/REDUNDANT-CODE | **vitest**, everywhere. Never jest. Run focused work with |
| C065 | T0 | `AGENTS.md` | REDUNDANT-CODE | 1/REDUNDANT-CODE | **File naming: kebab-case** everywhere. |
| C072 | T0 | `AGENTS.md` | REDUNDANT-CODE | 0/REDUNDANT-CODE | `en-US.json` and `es-ES.json`; `en-US` is the source language and the fallback. |
| C103 | T0 | `apps/api/AGENTS.md` | REDUNDANT-CODE | 1/REDUNDANT-CODE | Fastify 5, clean architecture, tsyringe DI, Drizzle + Postgres/pgvector, BullMQ, |
| C181 | T0 | `apps/api/AGENTS.md` | REDUNDANT-CODE | 1/REDUNDANT-CODE | BullMQ over Redis. Workers are separate processes: |
| C182 | T0 | `apps/api/AGENTS.md` | REDUNDANT-CODE | 0/REDUNDANT-CODE | `npm run dev:worker`, `npm run dev:digest-worker`. |
| C190 | T0 | `apps/web/AGENTS.md` | REDUNDANT-CODE | 0/REDUNDANT-CODE | React 19, Vite 8, TanStack Router + Query, Tailwind v4, Zustand, Radix. |
| C210 | T0 | `apps/web/AGENTS.md` | REDUNDANT-CODE | 1/REDUNDANT-CODE | File naming is kebab-case, including components (`post-composer-dialog.tsx`). |
| C241 | T0 | `apps/web/AGENTS.md` | REDUNDANT-CODE | 1/REDUNDANT-CODE | `GRID_ROW_HEIGHT = 40` and `GRID_GAP = 12`. Layout maths uses those constants, |
| C244 | T0 | `apps/web/AGENTS.md` | REDUNDANT-CODE | 0/REDUNDANT-CODE | vitest + `@testing-library/react` + jsdom. `src/test-setup.ts` is the setup file. |
| C252 | T0 | `apps/web/AGENTS.md` | REDUNDANT-CODE | 1/REDUNDANT-GENERAL | currently reports **30 pre-existing errors** — mostly |
| C254 | T0 | `apps/web/AGENTS.md` | REDUNDANT-CODE | 1/REDUNDANT-GENERAL | `react-refresh/only-export-components`. They are recorded and ratcheted in |
| C255 | T0 | `apps/web/AGENTS.md` | REDUNDANT-CODE | 0/REDUNDANT-GENERAL | `.github/workflows/ci.yml`. |
| C328 | T1 | `.agents/skills/deep-review/SKILL.md` | REDUNDANT-GENERAL | 1/REDUNDANT-GENERAL | Step 3 runs on the `native` runtime; `--subagent` is unavailable in this repo (see "CraftHub: runtime, rubric sources, p |
| C329 | T1 | `.agents/skills/deep-review/SKILL.md` | REDUNDANT-GENERAL | 1/REDUNDANT-GENERAL | Run `npm run build:schemas` before any lane that type-checks. A fresh tree fails against a missing `packages/schemas/dis |
| C359 | T1 | `.agents/skills/deep-review/SKILL.md` | REDUNDANT-GENERAL | 1/REDUNDANT-GENERAL | `--subagent` passed in this repo → stop and say so: `compozy` is not installed, `native` is the only runtime. Do not sil |
| C441 | T1 | `.agents/skills/i18n/SKILL.md` | REDUNDANT-CODE | 0/REDUNDANT-CODE | `apps/web` runs **react-i18next** with three locales. Every user-visible string |
| C467 | T1 | `.agents/skills/i18n/SKILL.md` | REDUNDANT-CODE | 0/REDUNDANT-CODE | majors (this repo runs i18next 26 / react-i18next 17) and a remembered example |
| C468 | T1 | `.agents/skills/i18n/SKILL.md` | REDUNDANT-CODE | 1/REDUNDANT-CODE | `initReactI18next`, `fallbackLng: "en-US"`, `supportedLngs` listing all three. |
| C469 | T1 | `.agents/skills/i18n/SKILL.md` | REDUNDANT-CODE | 1/REDUNDANT-CODE | **All three catalogues are bundled, not fetched.** A backend plugin buys lazy loading and costs a frame of raw keys on f |
| C471 | T1 | `.agents/skills/i18n/SKILL.md` | REDUNDANT-CODE | 0/REDUNDANT-CODE | `returnNull: false` and `returnEmptyString: false`, so a missing key renders as the key. Ugly on purpose: `common.save`  |
| C472 | T1 | `.agents/skills/i18n/SKILL.md` | REDUNDANT-CODE | 0/REDUNDANT-CODE | `escapeValue: false` — React escapes already, and letting i18next escape too double-encodes apostrophes. |
| C473 | T1 | `.agents/skills/i18n/SKILL.md` | REDUNDANT-CODE | 1/REDUNDANT-CODE | **`<html lang>` follows the active language** via the `languageChanged` event. `index.html` ships a static `en`; screen  |
| C474 | T1 | `.agents/skills/i18n/SKILL.md` | REDUNDANT-CODE | 1/REDUNDANT-CODE | There is deliberately **no `CustomTypeOptions`** declaration. Typing `resources` as `typeof enUS` does turn a mistyped k |
| C477 | T1 | `.agents/skills/i18n/SKILL.md` | REDUNDANT-GENERAL | 1/REDUNDANT-GENERAL | **Always search the locale file for the TEXT before adding a key.** Search by |
| C478 | T1 | `.agents/skills/i18n/SKILL.md` | REDUNDANT-GENERAL | 1/REDUNDANT-GENERAL | value, not by key name. If `"save": "Save"` exists, write `t('save')`. Never add |
| C479 | T1 | `.agents/skills/i18n/SKILL.md` | REDUNDANT-GENERAL | 1/REDUNDANT-GENERAL | `saveButton`, `formSave`, `profileSaveLabel`. |
| C482 | T1 | `.agents/skills/i18n/SKILL.md` | REDUNDANT-CODE | 1/REDUNDANT-GENERAL | Everything reusable lives under `common.*`. A `<feature>.*` namespace is for |
| C496 | T1 | `.agents/skills/i18n/SKILL.md` | REDUNDANT-CODE | 1/REDUNDANT-GENERAL | `scripts/guardrails/i18n-parity.mjs` enforces this in the gate. Nobody has to |
| C509 | T1 | `.agents/skills/i18n/SKILL.md` | REDUNDANT-CODE | 1/REDUNDANT-GENERAL | `npm run i18n:check` runs both; the gate runs them too, and both are |
| C561 | T1 | `.agents/skills/no-workarounds/SKILL.md` | REDUNDANT-CODE | 1/REDUNDANT-GENERAL | If the gate fails, **the failure is the signal**. Read what it points at before you touch |
| C562 | T1 | `.agents/skills/no-workarounds/SKILL.md` | REDUNDANT-CODE | 1/REDUNDANT-GENERAL | the fix. `--no-verify` is not an escape valve: it skips the local hook, not the problem, |
| C563 | T1 | `.agents/skills/no-workarounds/SKILL.md` | REDUNDANT-CODE | 1/REDUNDANT-GENERAL | and converts a fast local failure into a broken `main`. |
| C588 | T1 | `.agents/skills/qa-execution/SKILL.md` | REDUNDANT-GENERAL | 1/REDUNDANT-GENERAL | **The known, deliberate debt is not a finding.** 30 pre-existing eslint errors in `apps/web`, no eslint history in `apps |
| C726 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | Read `tasks.md` and identify: |
| C755 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-CODE | Everything types against `packages/schemas/dist/`. Skipping this makes `check-types` fail on a fresh tree for reasons th |
| C772 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 1/REDUNDANT-CODE | Read `DESIGN.md` at the repo root for the design language, and `apps/web/src/shared-components/surface.ts` for the `SURF |
| C781 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 1/REDUNDANT-GENERAL | **`AGENTS.md`** (root, plus the per-workspace files) — structure, naming, conventions |
| C783 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 1/REDUNDANT-GENERAL | **`DESIGN.md`** — violet/zinc palette, `SURFACE*` constants, button hierarchy, focus rings. Zero hardcoded hex. |
| C784 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **Repo patterns** — follow existing hooks, schemas and use cases |
| C785 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 1/REDUNDANT-GENERAL | **Context7** — consult it for external libraries (TanStack Query/Router, zod, react-hook-form, Drizzle, Fastify) to use  |
| C786 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **Implementation rules:** |
| C795 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | Do not touch the known, deliberate debt: `packages/ui` (dead scaffolding), the pre-existing eslint backlog, `apps/mcp` h |
| C800 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **Contract sensor** — `.parse()` the **REAL captured payload** from `contracts/fixtures/` through the schema in `package |
| C806 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **Write-landed check for mutations** — after an action that writes, query the target table through **postgres-mcp** (res |
| C809 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-CODE | Run it in one command: `node scripts/visual/run.mjs scripts/visual/scenarios/[feature].scenario.mjs` (one browser launch |
| C811 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | Read the console + network gate the run prints: zero React errors/warnings, zero unexpected 4xx/5xx, no request loops |
| C815 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | Conventional Commits, in **English** (the whole repo is English). Let the pre-push/Stop-hook gate run — `node scripts/gu |
| C822 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | After the commit, move to the next task in the `tasks.md` order. |
| C824 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | After implementing ALL tasks, run the final verification. |
| C825 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | This is the gate — the same script husky's pre-push hook and the Claude Code Stop hook run. If you want the individual s |
| C832 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | Anything missing → implement it as an additional task |
| C835 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | Run the full feature scenario: `node scripts/visual/run.mjs scripts/visual/scenarios/[feature].scenario.mjs` covering ev |
| C837 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | Console and network clean across the entire flow |
| C838 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | Fix discrepancies and re-capture |
| C849 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | No leftover placeholder or lorem text |
| C892 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-CODE | - `bash db-manage.sh start && npm run dev:api && npm run dev:web` |
| C916 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | Resolve conflicts (if any) |
| C918 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | Resolve conflicts (if any) |
| C920 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | Clean up the worktrees |
| C923 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **Spacing** — the Tailwind scale |
| C924 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **Colours** — the `DESIGN.md` violet/zinc tokens and the `SURFACE*` constants from `surface.ts`; never a hardcoded hex |
| C925 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **Typography** — the Tailwind scale, weights per `DESIGN.md` |
| C926 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **Icons** — `react-icons`, the Feather `fi` set |
| C928 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **Dark mode** — real, and carried by the surface constants; check both schemes |
| C929 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **Focus rings** — per `DESIGN.md`, on every interactive element |
| C946 | T1 | `.agents/skills/spec-implement/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **Do not** fix the known, deliberate debt as a side quest |
| C955 | T1 | `.agents/skills/spec-writer/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | Follow the phases below strictly. |
| C999 | T1 | `.agents/skills/spec-writer/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **`AGENTS.md`** at the root, plus `apps/api/AGENTS.md` and `apps/web/AGENTS.md` — the agent rules and per-workspace dept |
| C1000 | T1 | `.agents/skills/spec-writer/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **`DESIGN.md`** at the root — the design language: violet/zinc Tailwind palette, `SURFACE` constants, button hierarchy,  |
| C1003 | T1 | `.agents/skills/spec-writer/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **Existing feature layout** — `apps/web/src/features/<feature>/{pages,components,hooks,lib}/` — read a comparable featur |
| C1004 | T1 | `.agents/skills/spec-writer/SKILL.md` | REDUNDANT-CODE | 1/REDUNDANT-CODE | **Shared primitives** — `apps/web/src/shared-components/` (`button.tsx`, `input.tsx`, `select.tsx`, `dialog.tsx`, `surfa |
| C1005 | T1 | `.agents/skills/spec-writer/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **Routes** — `apps/web/src/router.tsx`. TanStack Router here is **code-based**; there is no generated file route tree. A |
| C1021 | T1 | `.agents/skills/spec-writer/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | **Rule: the design never draws the error.** Designers hand over the happy path. The spec **must** specify all four state |
| C1067 | T1 | `.agents/skills/spec-writer/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | Prefer **reusing or extending an existing `packages/schemas/src/<module>/` export** over writing a parallel schema. A du |
| C1082 | T1 | `.agents/skills/spec-writer/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | In `--all-default` mode, if the variants were not stated: assume **every member of the enum** and record the assumption  |
| C1126 | T1 | `.agents/skills/spec-writer/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | Document in the spec how to implement it pixel-perfect with Tailwind 4 and the `DESIGN.md` language — the violet/zinc pa |
| C1196 | T1 | `.agents/skills/visual-check/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | The web app is `apps/web` — React 19 + Vite + TanStack Router (code-based, `apps/web/src/router.tsx`) |
| C1197 | T1 | `.agents/skills/visual-check/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | TanStack Query + Tailwind v4. What "looks right" means is defined by **`DESIGN.md` at the repo |
| C1198 | T1 | `.agents/skills/visual-check/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-GENERAL | root**. Read it before you decide a screenshot is acceptable. |
| C1314 | T1 | `.agents/skills/visual-check/SKILL.md` | REDUNDANT-GENERAL | 0/REDUNDANT-CODE | Tests are **vitest**, never jest — `describe/it/expect` imported from `vitest`. |
| C1316 | T1 | `.agents/skills/visual-check/SKILL.md` | REDUNDANT-GENERAL | 1/REDUNDANT-GENERAL | **`DESIGN.md` requires every surface to carry a `dark:` variant. A missing one is completely |

## Hold

| ID | Tier | Reason | J1 | J2 | Quote |
|----|------|--------|----|----|-------|
| C002 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-ROUTING | The agent rules live in AGENTS.md at the repo root. The root CLAUDE.md is a |
| C003 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-ROUTING | SYMLINK to it, so every tool that reads either name gets the same bytes and |
| C004 | T0 | disagree | REDUNDANT-CODE | 2/KEEP-CAVEAT | there is no second copy to drift. |
| C006 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-ROUTING | and `.claude/` is the Claude Code alias: |
| C007 | T0 | disagree | REDUNDANT-CODE | 0/KEEP-ROUTING | .agents/skills/ real skills <- .claude/skills |
| C008 | T0 | disagree | REDUNDANT-CODE | 0/KEEP-ROUTING | .agents/settings.json real settings+hooks <- .claude/settings.json |
| C009 | T0 | disagree | REDUNDANT-CODE | 0/KEEP-ROUTING | AGENTS.md real rules <- CLAUDE.md |
| C042 | T0 | disagree | KEEP-COMPRESSED | 1/REDUNDANT-GENERAL | `npx vitest related <file> --run`. |
| C062 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-POLICY | `Button` `fullWidth` defaults to **true** — pass `fullWidth={false}` in a row. Use its built-in `sho |
| C063 | T0 | disagree | KEEP-POLICY | 1/REDUNDANT-CODE | Icons: `react-icons/fi` (Feather) only. |
| C066 | T0 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **Type everything. Never `any.`** `unknown` + a zod parse is the honest form. |
| C067 | T0 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | `null` for an absent value that is modelled (a nullable DB column); `undefined` only for genuinely n |
| C070 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-ROUTING | `apps/web` is internationalised. **Every user-visible string goes through |
| C071 | T0 | disagree | REDUNDANT-CODE | 2/KEEP-POLICY | `t()`.** The catalogue lives in `apps/web/src/i18n/locales/` as `pt-BR.json`, |
| C073 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | `apps/web/src/lib/language.ts` persists the choice next to `crafthub-theme` and |
| C074 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | keeps `<html lang>` in step — it is the same shape as `lib/theme.ts`. |
| C080 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | Two checks run in the gate and behind `npm run i18n:check`: |
| C081 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | `scripts/guardrails/i18n-parity.mjs` (same key set in all three locales, no |
| C082 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | empty values) and `scripts/guardrails/i18n-raw-strings.mjs` (no visible text |
| C083 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | outside `t()`, and every `t("…")` resolves in `en-US.json`). Both are |
| C112 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-ROUTING | A use case is a folder: |
| C129 | T0 | disagree | REDUNDANT-CODE | 2/KEEP-COMPRESSED | Auth: argon2 password hashing, JWT, Google OAuth, long-lived API tokens for |
| C130 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | agents, HMAC-signed webhooks. The authed identity endpoint is `GET /me`. |
| C156 | T0 | disagree | REDUNDANT-CODE | 2/KEEP-COMPRESSED | One port, `IFileStorageProvider`, one adapter, `S3FileStorageProvider`. Both |
| C157 | T0 | disagree | REDUNDANT-CODE | 2/KEEP-COMPRESSED | environments are S3-compatible, so there is no second implementation to keep in |
| C170 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-ROUTING | Drizzle, schema in `src/infra/database/drizzle/schema.ts`. |
| C171 | T0 | disagree | REDUNDANT-CODE | 2/KEEP-COMPRESSED | pgvector is a hard requirement — migration 0006 runs `CREATE EXTENSION vector` and the embedding tab |
| C203 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | `defaultPreload: "intent"` means hovering a nav item fetches its chunk, so |
| C212 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | Query and mutation definitions live in the feature's `lib/` (see `features/settings/lib/connection-q |
| C213 | T0 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | Reuse the query key; invalidate rather than refetching by hand. |
| C233 | T0 | disagree | REDUNDANT-CODE | 1/KEEP-POLICY | `Button`'s `fullWidth` defaults to **true**. In a row of controls you almost always want `fullWidth= |
| C235 | T0 | disagree | KEEP-POLICY | 1/REDUNDANT-CODE | Icons: `react-icons/fi` only. |
| C240 | T0 | disagree | REDUNDANT-CODE | 1/UNCLEAR | `features/profile-layout` uses dnd-kit and react-grid-layout with |
| C245 | T0 | disagree | REDUNDANT-GENERAL | 2/KEEP-POLICY | Test **behaviour a user can observe**, not implementation. Query by role and |
| C249 | T0 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | A component test that renders and asserts nothing is 100% covered and worth |
| C251 | T0 | disagree | UNCLEAR | 1/REDUNDANT-CODE | `apps/web` is the only workspace with a `lint` script, and `npm run lint` |
| C253 | T0 | disagree | REDUNDANT-CODE | 2/KEEP-CAVEAT | `react-hooks/set-state-in-effect` (new in eslint-plugin-react-hooks v7) and |
| C256 | T0 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | Do not fix them as a side quest, and do not add to them. The gate lints only the |
| C258 | T0 | disagree | KEEP-CAVEAT | 1/REDUNDANT-GENERAL | `eslint-disable` to clear the ratchet is a workaround, not a fix. |
| C276 | T1 | disagree | REDUNDANT-CODE | 2/KEEP-CAVEAT | **TanStack Router — code-based routing.** CraftHub declares its routes **in code** in `apps/web/src/ |
| C277 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-COMPRESSED | `fastify` (v5) — plugin encapsulation, lifecycle hooks, decorators, error handling. |
| C278 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-COMPRESSED | `@fastify/*` plugins — cors, cookie, jwt, multipart, rate-limit, swagger, swagger-ui, static, helmet |
| C280 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-COMPRESSED | `drizzle-orm` (0.44) + `drizzle-kit` — schema definition, relational queries, transactions, prepared |
| C281 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-COMPRESSED | `bullmq` — queues, workers, repeatable jobs, flows, graceful shutdown. |
| C283 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-COMPRESSED | `openai` (node SDK) — chat/responses APIs, structured outputs, embeddings, streaming, retries, timeo |
| C284 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-COMPRESSED | `@opentelemetry/*` — SDK setup, auto-instrumentation, span attributes. |
| C285 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-COMPRESSED | `@sentry/node` — init, integrations, and how it coexists with OpenTelemetry. |
| C287 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-COMPRESSED | `react` (19) — actions, `use`, transitions, ref-as-prop, the removal of `forwardRef` ceremony, and t |
| C292 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-COMPRESSED | `@radix-ui/*` primitives — dialog, alert-dialog, switch. Composition, portals, controlled state, and |
| C293 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | `@dnd-kit/*` — sensors, collision detection, sortable, accessibility. Used in `apps/web/src/features |
| C295 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-COMPRESSED | `react-hook-form` (+ `@hookform/resolvers` for the zod resolver) — controlled vs uncontrolled fields |
| C297 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | `@modelcontextprotocol/sdk` — server construction, transports (this server is **stdio**), tool/resou |
| C298 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | `vitest` (3.x; `apps/training` is on 4.x) — config, `vi.mock` hoisting semantics, `vi.fn` / `vi.spyO |
| C299 | T1 | disagree | REDUNDANT-GENERAL | 0/KEEP-COMPRESSED | `@testing-library/react` — queries, `user-event`, `findBy*` vs `waitFor`. |
| C300 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-ROUTING | `playwright` — used by the visual scenario runner under `scripts/visual/`. |
| C319 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-CAVEAT | **Bundled scripts:** pure Python **standard library** (`argparse`, `json`, `hashlib`, `pathlib`, `re |
| C343 | T1 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Execute `<out>/jobs.json` with the mutating runner and engine contract loaded in Step 2. In this rep |
| C402 | T1 | disagree | REDUNDANT-CODE | 0/KEEP-ROUTING | `$SKILL_DIR/references/PROTOCOL.md` |
| C403 | T1 | disagree | REDUNDANT-CODE | 0/KEEP-ROUTING | `$SKILL_DIR/scripts/inventory_extract.py` |
| C404 | T1 | disagree | REDUNDANT-CODE | 0/KEEP-ROUTING | `$SKILL_DIR/scripts/track_a_correctness.py` |
| C405 | T1 | disagree | REDUNDANT-CODE | 0/KEEP-ROUTING | `$SKILL_DIR/scripts/merge_agreement.py` |
| C406 | T1 | disagree | REDUNDANT-CODE | 0/KEEP-ROUTING | `$SKILL_DIR/scripts/surfaces_extract.py` |
| C407 | T1 | disagree | REDUNDANT-CODE | 0/KEEP-ROUTING | `$SKILL_DIR/scripts/merge_usefulness.py` |
| C408 | T1 | disagree | REDUNDANT-CODE | 0/KEEP-ROUTING | `$SKILL_DIR/scripts/slim_fanin.py` |
| C409 | T1 | disagree | REDUNDANT-CODE | 0/KEEP-ROUTING | `$SKILL_DIR/scripts/doc_scope.py` |
| C440 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-ROUTING | How internationalisation works in CraftHub's web app — react-i18next with pt-BR, en-US and es-ES, al |
| C442 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-POLICY | goes through `t()`, `<html lang>` follows the active language, and two gate |
| C453 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-CAVEAT | **Never concatenate a sentence from fragments.** `"Deleted " + count + " posts"` is untranslatable — |
| C462 | T1 | disagree | REDUNDANT-CODE | 2/KEEP-CAVEAT | There is no `i18next-browser-languagedetector`. Detection is ~30 lines in |
| C470 | T1 | disagree | UNCLEAR | 1/REDUNDANT-CODE | Detection order: the stored preference first, then `navigator.languages`, walked in order — a machin |
| C480 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | A key must be reusable on a screen that does not exist yet. Naming it after |
| C481 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-CAVEAT | where it first appeared guarantees the next screen adds a duplicate. |
| C483 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | text that is genuinely domain-specific and would be ambiguous on its own: |
| C484 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | `enum.*` is a third case: closed sets that belong to the domain rather than to |
| C485 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | any one feature — work model, contract type, seniority, spoken languages, |
| C488 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | A key may be used on many screens. Editing its value silently changes text |
| C492 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | Add to `pt-BR.json`, `en-US.json` **and** `es-ES.json` in the same commit. A key |
| C494 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | language. If a translation is not ready, put the English text in as a |
| C495 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | placeholder — visible-but-wrong beats a raw key on screen. |
| C497 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | `enum.contractType["full-time"]`, `enum.workModel["on-site"]`, |
| C498 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | `enum.persona["qa-engineer"]`. That lets a call site write |
| C499 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | ``t(`enum.contractType.${value}`)`` with no lookup table — and it keeps the |
| C500 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | distinction that matters visible: **translate the label, never the value.** |
| C510 | T1 | disagree | KEEP-COMPRESSED | 1/REDUNDANT-GENERAL | **`i18n-parity.mjs`** — every locale holds the same key set (deep, dotted |
| C528 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-CAVEAT | **`warn`, not `error`.** apps/web already carries 30 recorded eslint errors (see `.github/workflows/ |
| C549 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-POLICY | **Seed data.** `seed-realistic.ts` fixtures stay English. |
| C550 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | A workaround is any change that makes a problem stop manifesting without addressing why it exists. I |
| C551 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | The fix is done when it would have been unnecessary had the code been correct in the first place — a |
| C552 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-COMPRESSED | Each row is the compiler, linter, runtime, or reviewer telling you something true. Fix what it point |
| C554 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | Not every root cause is yours to fix. A workaround is allowed only when ALL hold: |
| C555 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | When all four hold, contain it: |
| C556 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | If any condition fails, fix the root cause. No exceptions. |
| C560 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-CAVEAT | Everything here is verifiable — run the command and see. |
| C567 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | **File the GitHub issue** on `gabrikf/Link-hub-v1` (`gh issue create`) and put its URL in the marker |
| C572 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | QA the product the way a real person meets it: a **persona** walks a journey through the product's p |
| C573 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-COMPRESSED | Three non-negotiables hold every session: |
| C574 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | **In persona.** Every interaction and every verification goes through a surface a real user can reac |
| C575 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | **Proof, not optimism.** A `Pass` is the expected observable seen, confirmed through an independent  |
| C578 | T1 | disagree | REDUNDANT-CODE | 2/KEEP-CAVEAT | **The app under test:** `npm run dev:web` → **http://localhost:5173** (Vite), talking to `npm run de |
| C586 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | **Bugs go to GitHub.** Every registry bug that reaches engineering gets an issue via `gh issue creat |
| C589 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-COMPRESSED | Each step names the reference that owns its detail — read it in full when you reach the step; the in |
| C605 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-CAVEAT | Hunt **paper cuts** throughout: persona-felt friction no functional check fails; sharp ones become f |
| C625 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | **Red test first, always.** Every auto-fix starts with a **vitest** test that reproduces the finding |
| C638 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | **The guardrail scripts, not a skill** — `node scripts/guardrails/pre-push.mjs` (the gate), `node sc |
| C648 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-COMPRESSED | Each step points at the reference file that owns its contract; read that file before producing the s |
| C651 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | **Personas are CraftHub's three real audiences** — the **developer** curating their own profile and  |
| C671 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | The completeness bar is "every journey walked by a persona", a session ledger — never a per-case cou |
| C678 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | **The guardrail scripts, not a skill** — `node scripts/guardrails/pre-push.mjs` (the gate), `npm run |
| C690 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | **Safe speed** — parallelise when possible, never at the cost of quality |
| C702 | T1 | disagree | REDUNDANT-CODE | 0/KEEP-COMPRESSED | - **1** — list the specs available under `docs/specs/` |
| C703 | T1 | disagree | REDUNDANT-CODE | 1/KEEP-COMPRESSED | - Or give the path: `docs/specs/[feature-name]/` |
| C736 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | **Execution plan — [feature-name]** |
| C737 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | **Strategy:** [sequential \| parallel-worktrees \| subagents] |
| C739 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | **Tasks:** N total, M groups |
| C740 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | **G0:** [endpoints to probe, or "n/a — contracts inferred"] |
| C741 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | 1. G0: endpoint liveness probe (blocking) |
| C742 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | 2. [Group 1]: Task 1, 2 (contract + hooks) |
| C743 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | 3. [Group 2]: Task 3, 4, 5 (UI) |
| C744 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | 4. [Group 3]: Task 6 (tests) |
| C745 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | **Planned commits:** |
| C746 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - `feat: add [resource] schema and contract test` |
| C747 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - `feat: add [resource] query hook` |
| C748 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - `feat: add [feature] page and route` |
| C749 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - `feat: add [feature] form` |
| C750 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - `test: cover [feature] business rules and variants` |
| C751 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - **1** — yes, implement |
| C752 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - **2** — adjust (say what) |
| C753 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - **3** — use parallel worktrees (if applicable) |
| C774 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | For each task, run the cycle: |
| C779 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | Find comparable code already in the repo to follow |
| C780 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | Implement strictly according to: |
| C787 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | One file at a time — write it complete, not partial |
| C789 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | Hooks separated — logic never inside JSX |
| C790 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | Focused components — one component, one responsibility |
| C791 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | Typed props — an exported type per component |
| C797 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | Fix it (without changing scope) |
| C799 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | **Feature sensors, also per task where they apply:** |
| C807 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | **Visual verification (mandatory when the task produces UI) — per delivery, script-first:** |
| C808 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | Keep **one scenario for the feature** at `scripts/visual/scenarios/[feature].scenario.mjs` and add t |
| C812 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | List each difference concretely ("title is 24px in the design, renders at 16px"), fix the cause, and |
| C814 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | Never call a UI task done without having looked at the screenshot. `check-types` and green tests do  |
| C816 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | Commit types by task: |
| C817 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | Contract/schema → `feat: add [resource] schema` |
| C818 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | Hook/API → `feat: add [resource] query hook` |
| C819 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | UI → `feat: add [component/screen]` |
| C820 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | Form → `feat: add [action] form` |
| C821 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | Tests → `test: cover [feature]` |
| C833 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | A final pass with the whole feature assembled: |
| C834 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Walk the **complete flow** in the browser (not isolated screens): arrive, filter, open the modal/dra |
| C836 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | Compare against the design and the FB-02 checklist |
| C850 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | No raw enum value or id leaking where a human-readable label belongs |
| C855 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | A test that forces a `throw` in the component → the error boundary fallback appears, `body` is not e |
| C856 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | A test with the API returning 500 → the error state with a retry affordance |
| C857 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | A test with the API returning an empty list → the empty state |
| C858 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | A test with a payload that does not match the schema → it does not crash; the drift is reported and  |
| C859 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-CODE | [ ] `node scripts/guardrails/pre-push.mjs` — green |
| C860 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-CODE | [ ] `npm run build:schemas && npm run check-types` — zero errors |
| C861 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-CODE | [ ] `node scripts/guardrails/lint-changed.mjs` — zero NEW findings (the backlog is not yours) |
| C862 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-CODE | [ ] `npm run test:coverage` — no package below its ratchet floor |
| C864 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | [ ] Contract sensor green: the REAL captured payload parses through `@repo/schemas` |
| C867 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | [ ] Resilience tests green |
| C868 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | [ ] Visual scenario green: every screen × every state, no open diff |
| C869 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | [ ] Console clean, network free of unexpected 4xx/5xx across the full flow |
| C874 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | [ ] `git diff` reviewed line by line for `any`, `catch {}`, hardcoded hex, and unparsed API response |
| C878 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | **Implementation complete — [feature-name]** |
| C879 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - `pre-push.mjs` — green |
| C880 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - `check-types` — zero errors |
| C881 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - Tests — [N] passing ([M] new) |
| C882 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - `lint-changed` — zero new findings |
| C883 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - Coverage ratchet — no package below its floor |
| C884 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - G0 — [endpoints probed, real payloads frozen \| n/a, contracts inferred] |
| C885 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - Contract sensor — real payload parses through `@repo/schemas` |
| C886 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - Schema ⟷ UI — [N] modes/tabs verified, every required field mounted |
| C887 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - Visual scenario — [N] screens × [M] states, no open diff |
| C888 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - Console and network — clean |
| C889 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - Acceptance criteria — all verified |
| C890 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | **Commits:** [N] on branch `feat/[feature-name]` |
| C891 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | **Files created/modified:** |
| C893 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - [http://localhost:5173/[route]](http://localhost:5173/[route]) |
| C894 | T1 | disagree | REDUNDANT-GENERAL | 2/KEEP-COMPRESSED | - Sign in as `recruiter.seed@crafthub.local` / `12345678` (or a `seed-*` candidate) |
| C895 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - Actions to try: [list] |
| C896 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | **Screens you need to check** (one per usage shape — only if shared code changed): |
| C897 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - **1** — push and open the PR |
| C898 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - **2** — review before finalising |
| C899 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | - **3** — implement adjustments |
| C900 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | If the dev picks option 1: |
| C908 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | `qa-findings.md` template: |
| C909 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | If Phase 1 selected the parallel strategy: |
| C919 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Run the full harness on the integrated branch |
| C922 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | The supplied design is the visual reference. The implementation should be as faithful as possible: |
| C927 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | **Components** — `shared-components/` and the Radix primitives first; raw HTML only when no equivale |
| C930 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | If the design needs something the primitives cannot do → build a reusable component with Tailwind, f |
| C931 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **Pixel-perfect is proved by a screenshot, not by reading code.** Every fidelity claim must come fro |
| C935 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | Design shows the dashboard layout wrapper → already exists, ignore it |
| C936 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | Design shows avatar/button/input primitives → already in `shared-components/`, reuse, do not restyle |
| C937 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **Focus exclusively** on the new content inside the page's main content area. |
| C938 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **Pixel-perfect applies ONLY to the new feature** — the rest is visual context for position and prop |
| C940 | T1 | disagree | REDUNDANT-GENERAL | 1/UNCLEAR | Every file, variable, component, hook, type and test name is in English. User-visible copy is Englis |
| C941 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **Do not** add features that are not in the spec |
| C942 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **Do not** create abstractions "for the future" |
| C943 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **Do not** refactor existing code outside the scope |
| C944 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **Do not** add error handling beyond what is specified |
| C945 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **Do not** change existing repo patterns |
| C947 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | If something ought to exist but is not in the spec → stop and ask the dev. |
| C948 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | **Never implement against an inferred contract without marking it.** If the API has not |
| C949 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | confirmed the shape, the schema stays in `contracts/` with `Status: PENDING`, the hook runs |
| C950 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | against a mock, and `tasks.md` carries an explicit validation task. Implementing against a |
| C951 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | silent assumption is how "it worked on my machine" bugs are born. |
| C952 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-ROUTING | Use when WRITING a feature spec for CraftHub from product requirements (user stories, PRD, GitHub is |
| C958 | T1 | disagree | REDUNDANT-GENERAL | 3/KEEP-POLICY | If confirmed, keep it until the end. In this mode: |
| C981 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | 1. **Requirements** — paste the user story / PRD / feature description (or a GitHub issue link) |
| C982 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | 2. **Design** — attach the design HTML (Claude/Figma Make), screenshots, or describe the expected UI |
| C984 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | 3. **API contracts** — routes, the `/docs` Swagger output, TypeScript types for the endpoints |
| C985 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | Send it all together or in separate messages. |
| C990 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **Plain text** → use as-is and record it as a risk in the spec |
| C1002 | T1 | disagree | REDUNDANT-GENERAL | 1/UNCLEAR | **`packages/schemas/src/`** — the 16 zod modules. **This is the contract package.** Reuse a module b |
| C1006 | T1 | disagree | REDUNDANT-GENERAL | 2/KEEP-ROUTING | **API layout (if the feature touches the backend)** — `apps/api/src/core/{entity,use-case,repositori |
| C1013 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | **Layout** — grid structure, responsiveness, breakpoints |
| C1014 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | **Components** — a 1:1 mapping onto `apps/web/src/shared-components/` and the Radix primitives alrea |
| C1015 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **States** — loading, empty, error, success, interactions |
| C1017 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | **Interactions** — forms, validation, user actions |
| C1018 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | **Navigation** — how the user reaches the screen, where it lives in `apps/web/src/router.tsx` |
| C1032 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | **2. [Category] — [Question]** |
| C1033 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | Recommendation: [suggested answer + rationale] |
| C1034 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | *(max 5-8 questions)* |
| C1037 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **State** — local vs the Zustand store? TanStack Query cache strategy? |
| C1039 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **Navigation** — new route in `router.tsx`? URL params? |
| C1041 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | **Scope** — what is explicitly OUT of this delivery? |
| C1042 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | **Dependencies** — does it depend on another feature, a schema change, or a migration? |
| C1043 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | **Performance** — pagination? Virtualisation? Lazy loading? |
| C1044 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **`--all-default` mode:** skip the whole interview — treat the recommendations as final decisions. E |
| C1064 | T1 | disagree | KEEP-CAVEAT | 0/REDUNDANT-GENERAL | **A field that may be absent → an explicit `.nullable()`**, never a silent `.optional()`. `optional` |
| C1065 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Every schema ships with an example fixture in `contracts/fixtures/`, with **three cases: full, empty |
| C1079 | T1 | disagree | KEEP-CAVEAT | 0/REDUNDANT-GENERAL | **Mandatory whenever the feature renders a discriminated set** — a zod enum or discriminated union f |
| C1085 | T1 | disagree | UNCLEAR | 0/REDUNDANT-GENERAL | - `SPEC.md` — the full spec (requirements, design, plan) |
| C1086 | T1 | disagree | UNCLEAR | 0/REDUNDANT-GENERAL | - `definitions.md` — feature dictionary (entities, states, business rules, permissions, copy) |
| C1087 | T1 | disagree | UNCLEAR | 0/REDUNDANT-GENERAL | - `contracts/` — executable zod schemas + real fixtures (provenance/status per contract) |
| C1088 | T1 | disagree | UNCLEAR | 0/REDUNDANT-GENERAL | - `variants.md` — variant/mode matrix *(only if the feature renders a discriminated set)* |
| C1089 | T1 | disagree | UNCLEAR | 0/REDUNDANT-GENERAL | - `tasks.md` — N implementation tasks |
| C1090 | T1 | disagree | UNCLEAR | 0/REDUNDANT-GENERAL | - `harness.md` — verification harness (feedforward + feedback) |
| C1091 | T1 | disagree | UNCLEAR | 0/REDUNDANT-GENERAL | - `design/` — visual references |
| C1092 | T1 | disagree | UNCLEAR | 0/REDUNDANT-GENERAL | - `decisions.md` — decision record |
| C1103 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | `[feature-name]` is `kebab-case` **in English**, derived from the feature name: |
| C1104 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | "Recruiter search filters" → `recruiter-search-filters` |
| C1105 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | "Profile block editor" → `profile-block-editor` |
| C1106 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | "Agent disclosure settings" → `agent-disclosure-settings` |
| C1108 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | Component file: `profile-block-editor.tsx` |
| C1109 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | Hook: `use-profile-blocks.ts` |
| C1110 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | Feature folder: `apps/web/src/features/profile-block-editor/` |
| C1112 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | Spec folder: `docs/specs/profile-block-editor/` |
| C1117 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Design shows the dashboard layout wrapper → already exists, ignore it |
| C1118 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Design shows the avatar / button / input primitives → already in `shared-components/`, reuse, do not |
| C1124 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Map it onto `shared-components/` and the Radix primitives |
| C1125 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Identify gaps (components that do not exist) |
| C1131 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | Push it to the lowest layer that can detect the failure (Iron Law 2). In this repo that ladder is |
| C1132 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | Co-locate, never centralize. A test parked far from its subject is a test nobody updates when the |
| C1133 | T1 | disagree | KEEP-CAVEAT | 0/REDUNDANT-GENERAL | **An invented API payload is a forbidden test double.** `packages/schemas` (`@repo/schemas`) is the |
| C1134 | T1 | disagree | KEEP-CAVEAT | 1/REDUNDANT-GENERAL | one contract shared by `apps/api`, `apps/web`, `apps/mcp`, `apps/extractor` and `apps/training`. |
| C1135 | T1 | disagree | KEEP-CAVEAT | 0/REDUNDANT-GENERAL | Every response an agent claims to have shipped should be asserted by `.parse()`ing a **real |
| C1136 | T1 | disagree | KEEP-CAVEAT | 0/REDUNDANT-GENERAL | captured payload** through the matching zod schema: |
| C1153 | T1 | disagree | REDUNDANT-CODE | 2/KEEP-CAVEAT | `apps/api/src/infra/http/controllers/resume/test/search.e2e.test.ts` |
| C1154 | T1 | disagree | REDUNDANT-CODE | 2/KEEP-CAVEAT | `apps/api/src/infra/http/controllers/resume/test/search-boundaries.e2e.test.ts` |
| C1155 | T1 | disagree | REDUNDANT-CODE | 2/KEEP-CAVEAT | `apps/api/src/infra/database/drizzle/search-indexes.e2e.test.ts` |
| C1159 | T1 | disagree | KEEP-CAVEAT | 0/REDUNDANT-GENERAL | `apps/mcp` has **zero tests** — a known, recorded gap, not an invitation to write a mock-only suite |
| C1163 | T1 | disagree | KEEP-CAVEAT | 0/REDUNDANT-GENERAL | **The four states** — loading, empty, error, filled (plus disabled where it applies). A screen that  |
| C1164 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | **The interactions** — click, submit, keyboard — and **what the handler receives**, not merely that  |
| C1168 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | **No PR that fixes a bug is complete without a test that failed before the fix and passes after.** |
| C1190 | T1 | disagree | REDUNDANT-GENERAL | 0/KEEP-ROUTING | Use whenever a task changes anything the user can see in the browser — a dashboard route, the public |
| C1199 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | **The default driver is a scenario script, not a sequence of commands.** |
| C1200 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Write the whole check — every state, every viewport, every theme, every mock — as one file under |
| C1201 | T1 | disagree | KEEP-ROUTING | 1/REDUNDANT-CODE | `scripts/visual/scenarios/`, then run it in a single tool call: |
| C1204 | T1 | disagree | KEEP-COMPRESSED | 1/REDUNDANT-GENERAL | Driving the browser one command per Bash call costs, **per action**: one agent round-trip + one |
| C1205 | T1 | disagree | KEEP-COMPRESSED | 1/REDUNDANT-GENERAL | process spawn + one page-tree dump into context. A six-state check of one screen is 15–30 actions, |
| C1206 | T1 | disagree | KEEP-COMPRESSED | 1/REDUNDANT-GENERAL | so that overhead is paid 15–30 times. The browser was never the bottleneck — the loop shape was. |
| C1207 | T1 | disagree | KEEP-COMPRESSED | 1/REDUNDANT-GENERAL | **Read the ratio correctly.** In raw process seconds a batched run is only modestly faster, because |
| C1208 | T1 | disagree | KEEP-COMPRESSED | 1/REDUNDANT-GENERAL | both approaches pay the same page loads. The win is in the two columns the clock does not show: |
| C1209 | T1 | disagree | KEEP-COMPRESSED | 1/REDUNDANT-GENERAL | **15 tool calls collapse to 1.** In an agent loop each command is also a full model round-trip — sec |
| C1210 | T1 | disagree | KEEP-COMPRESSED | 1/REDUNDANT-GENERAL | **Per-call spawn overhead disappears.** Starting a Node process and re-attaching to a browser is wor |
| C1211 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | **Iterating on a check = edit the scenario file and run it again.** A rerun costs one headless launc |
| C1212 | T1 | disagree | KEEP-COMPRESSED | 1/REDUNDANT-GENERAL | (~1s) plus the page loads. That is cheap enough to run after every edit, which is the point: the loo |
| C1213 | T1 | disagree | KEEP-COMPRESSED | 1/REDUNDANT-GENERAL | only helps if you actually close it. |
| C1254 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Run this per visual task. Do **not** batch it to the end — a wrong assumption caught at the first |
| C1255 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | screenshot costs one edit; caught at the end it costs a rewrite. |
| C1256 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Write down what the screenshot must show. One of: |
| C1259 | T1 | disagree | KEEP-ROUTING | 0/REDUNDANT-GENERAL | the acceptance criteria from the spec or the user's prompt, |
| C1261 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Without a written target you will look at the screenshot and rationalize whatever you see. |
| C1273 | T1 | disagree | KEEP-CAVEAT | 1/REDUNDANT-GENERAL | **`isVisible()` does not mean "in the viewport".** It means "in the DOM with a non-empty box" — an |
| C1274 | T1 | disagree | KEEP-CAVEAT | 1/REDUNDANT-GENERAL | element 900px below the fold passes it. A green assertion plus a screenshot that does not show the |
| C1280 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-CODE | testing a screen against a payload the API will never send. Run `npm run build:schemas` first — |
| C1281 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-CODE | everything types against `dist/`. |
| C1284 | T1 | disagree | KEEP-ROUTING | 0/REDUNDANT-CODE | `bash db-manage.sh seed-all`. |
| C1286 | T1 | disagree | KEEP-CAVEAT | 1/REDUNDANT-GENERAL | `getByText`, `getByTestId`), which auto-wait and never go stale. |
| C1290 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Read the target and the screenshots side by side and fill this table. Vague conclusions hide bugs; a |
| C1291 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | table forces you to look at each dimension. |
| C1294 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Run the scenario before your change and after it, then `diff` the two files. |
| C1295 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Then report **each difference as a concrete line**: *"the section title is 24px in the design and |
| C1296 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | renders 16px"*, never *"close enough"*. If there is no difference, say so explicitly. |
| C1306 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | Fix the cause, run the **same scenario** again, compare again. Loop until the diff list is empty. |
| C1307 | T1 | disagree | KEEP-COMPRESSED | 1/REDUNDANT-GENERAL | This is the step the batching exists for: a rerun is ~1s of launch plus the page loads, so there is |
| C1309 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | When the flow you just walked is worth protecting (a business rule, a bug that was reported, a share |
| C1312 | T1 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Rendering-shaped assertion → a **vitest + `@testing-library/react`** test next to the component (`ap |
| C1313 | T1 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Payload-shaped assertion → parse a real captured response through the matching `@repo/schemas` modul |
| C1320 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | **Every visual check of a surface captures BOTH themes.** A check that captured only light mode did |
| C1321 | T1 | disagree | REDUNDANT-GENERAL | 1/KEEP-POLICY | not check the thing most likely to be broken. |
| C1353 | T1 | disagree | KEEP-POLICY | 1/REDUNDANT-GENERAL | Fix the cause, then add the failing test that would have caught it — ideally a `@repo/schemas` parse |
| C1360 | T1 | disagree | KEEP-POLICY | 0/REDUNDANT-GENERAL | List every consumer (grep the import). |
| C1369 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | The scenario is the default because you usually know the sequence. When you genuinely do not — an |
| C1370 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | unfamiliar screen, "does this menu even open?", finding the right locator — you still write a |
| C1371 | T1 | disagree | KEEP-COMPRESSED | 0/REDUNDANT-GENERAL | scenario, just a throwaway one that **looks** instead of asserting: |
| C1374 | T1 | disagree | KEEP-CAVEAT | 1/REDUNDANT-GENERAL | `page.pause()` in a headed run opens Playwright's inspector, which is the fastest way for a **human* |
| C1387 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/deep-review/assets/PROMPT.md` is an on-demand load targe |
| C1388 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/deep-review/assets/findings.schema.json` is an on-demand |
| C1389 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/deep-review/references/context-pack.md` is an on-demand  |
| C1390 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/deep-review/references/orchestration.md` is an on-demand |
| C1391 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/deep-review/references/subagent-runtimes.md` is an on-de |
| C1392 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/deep-review/references/taxonomy.md` is an on-demand load |
| C1393 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/harness-eval/references/GLOSSARY.md` is an on-demand loa |
| C1394 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/harness-eval/references/PROTOCOL.md` is an on-demand loa |
| C1395 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/harness-eval/references/claims.schema.json` is an on-dem |
| C1396 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/harness-eval/references/judge-prompts.md` is an on-deman |
| C1397 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/no-workarounds/references/philosophical-foundations.md`  |
| C1398 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/no-workarounds/references/workaround-catalog.md` is an o |
| C1399 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-execution/assets/report-template.md` is an on-demand  |
| C1400 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-execution/references/edge-cases.md` is an on-demand l |
| C1401 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-execution/references/fix-loop.md` is an on-demand loa |
| C1402 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-execution/references/lenses.md` is an on-demand load  |
| C1403 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-execution/references/persona-fidelity.md` is an on-de |
| C1404 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-execution/references/session-protocol.md` is an on-de |
| C1405 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-execution/references/status-and-reporting.md` is an o |
| C1406 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-execution/references/tours.md` is an on-demand load t |
| C1407 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-report/assets/bug-template.md` is an on-demand load t |
| C1408 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-report/assets/charter-template.md` is an on-demand lo |
| C1409 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-report/references/automation-backlog.md` is an on-dem |
| C1410 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-report/references/bug-registry.md` is an on-demand lo |
| C1411 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-report/references/journeys-and-flows.md` is an on-dem |
| C1412 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-report/references/personas.md` is an on-demand load t |
| C1413 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-report/references/qa-docs-layout.md` is an on-demand  |
| C1414 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-report/references/session-charters.md` is an on-deman |
| C1415 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-report/references/state-schema.md` is an on-demand lo |
| C1416 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/qa-report/references/taxonomy.md` is an on-demand load t |
| C1417 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/spec-implement/references/execution-strategy.md` is an o |
| C1418 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/spec-writer/references/harness.md` is an on-demand load  |
| C1419 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/spec-writer/references/interview-questions.md` is an on- |
| C1420 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/spec-writer/references/spec-template.md` is an on-demand |
| C1421 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/testing-boss/references/ai-writes-tests.md` is an on-dem |
| C1422 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/testing-boss/references/antipatterns.md` is an on-demand |
| C1423 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/testing-boss/references/ci-automation.md` is an on-deman |
| C1424 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/testing-boss/references/foundations.md` is an on-demand  |
| C1425 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/testing-boss/references/llm-eval.md` is an on-demand loa |
| C1426 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/testing-boss/references/patterns.md` is an on-demand loa |
| C1427 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `.agents/skills/testing-boss/references/sources.md` is an on-demand load |
| C1428 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `DESIGN.md` is an on-demand load target when linked from always-on rules |
| C1429 | T2 | disagree | KEEP-ROUTING | 1/REDUNDANT-GENERAL | Harness-referenced document `docs/mcp-servers.md` is an on-demand load target when linked from alway |

## Review (KEEP family)

993 claims. See J1/J2 score tables for detail.

## Action guidance

- **T0 Ship:** edit always-on rules now.
- **T1 Ship:** skill cleanup backlog.
- **T2 Ship:** routing/pointer hygiene.
- **Hold:** do not trim.

