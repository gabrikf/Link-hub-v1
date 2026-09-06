# Context Pack

How to assemble `<out>/context-pack.md` — the shared context every reviewer and sweep receives. **Keep it lean: target ≤ ~10 KB.** Every agent in the fan-out reads it in full, so each extra kilobyte is paid once per agent; reviewers dig into the code themselves (rg, git, file reads), so the pack carries only what they cannot cheaply rediscover — intent, review law, and what the linters already caught.

## 1. Repository knowledge — discover before extracting

Run the read-only discovery/bootstrap helper after the manifest:

```bash
python3 <skill-dir>/scripts/build_knowledge.py --out <out>
```

It discovers every repository-local root/nested `AGENTS.md` and `CLAUDE.md`, repo review config/learnings, project `SKILL.md` under conventional local skill roots, and direct markdown references of candidate skills. Nested instructions apply to selected paths in their directory subtree; all ancestors remain applicable and deeper sources have higher precedence.

`knowledge.json` records why every source is or is not a candidate. `rules.template.json` starts every candidate as `pending`. Read each pending source **in full**; for a selected skill, read each pending direct reference in full too. Copy the template to `rules.json` and change every pending row to:

- `applied` — the source was read and governs at least one selected path; or
- `not-applicable` — include a concrete reason why it does not govern this change.

`build_jobs.py` rejects missing sources, pending statuses, empty reasons, rule sources not marked applied, and rule scopes that match no selected path.

## 2. Rubric — extract the review law

Extract verdict-bearing rules in precedence order (higher wins on conflict):

1. Path instructions from repo review config.
2. Nested `AGENTS.md` / `CLAUDE.md`, deepest applicable directory first.
3. Root `AGENTS.md` / `CLAUDE.md`.
4. Explicitly dispatched or change-relevant project skills and their required references.
5. `.deep-review/learnings.md` entries whose scope matches selected files.

Extract only rules that can bind a review result (error handling, testing shape, layering, security, naming, documentation, design tokens, framework patterns). Operational commands can leave an applied source with zero rules when the accounting reason says it was read but contains no review law. Register each rule once and keep its text verbatim:

```json
{
  "sources": [
    {
      "source": "AGENTS.md",
      "kind": "instruction",
      "status": "applied",
      "reason": "root rules govern every selected path"
    }
  ],
  "rules": [
    {
      "id": "R07",
      "scope": ["**/*_test.go"],
      "source": "AGENTS.md",
      "guideline": "MUST use t.Run(\"Should...\") pattern for ALL test cases"
    }
  ]
}
```

### CraftHub rubric sources

`build_knowledge.py` finds `AGENTS.md` / `CLAUDE.md`, `.deep-review/learnings.md` and every `SKILL.md` under `.claude/skills/`. In this repo those cover the root `AGENTS.md` plus the per-workspace `apps/api/AGENTS.md` and `apps/web/AGENTS.md`, which the walker picks up as nested instruction files — register each under its own directory subtree scope rather than folding them into the root.

Two more rule-bearing sources it cannot discover — **add them to `rules.json` by hand, read in full, before extracting**:

| Source                  | Scope glob    | Kind of rule it binds                                                                                                                                                                                                                                                       |
| ----------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DESIGN.md` (repo root) | `apps/web/**` | CraftHub's design language: tokens, typography, spacing, elevation, motion, and the light/dark pairing. A hardcoded color, a missing dark-mode variant, or a primitive reinvented instead of composed from Radix + `apps/web/src/shared-components/` is a defect against it |
| `README.md` (repo root) | `**/*`        | The orientation doc — workspace boundaries, what each app owns, and which parts are deliberate debt. Rarely rule-bearing on its own; read it so a finding does not "discover" something already recorded                                                                    |

`DEVELOPMENT-GUIDE.md` is the npm-scripts reference — context for building lane commands, not a rubric source.

### Architecture the reviewer has to hold

Findings are only as good as the reviewer's model of the repo. Before extracting rules, hold this:

| Area               | Shape                                                                                                                                                                                                                                                                                                                                 | What that implies for review                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`         | Fastify 5 with **clean architecture** — `src/core/{entity,use-case,repositories,providers}/` is pure and framework-free; `src/infra/{http,database,queue,providers,di}/` is everything else. **tsyringe** DI, wired in `src/infra/di/container.ts` (over 2,200 lines). Every module is registered **twice**: bare and under `/api/v1` | A framework import inside `core/` is an architecture defect, not a nitpick. A new route registered on only one of the two mounts is a real contract break. A provider added without a container registration fails at runtime, not at build                       |
| `packages/schemas` | `@repo/schemas` — 16 zod modules (importing from `zod/v4`), consumed by api, web, mcp, extractor and training. Ships `dist/`, and turbo's `dependsOn: ["^build"]` means it must be built before check-types or tests                                                                                                                  | This is **the contract**. A response shape changed on one side only is the single highest-yield defect class in this repo — see the taxonomy's CraftHub priorities                                                                                                |
| `apps/web`         | React 19 + Vite 8, **TanStack Router declared in code** (`src/router.tsx` — no file-based tree), TanStack Query for server state, one Zustand store for client state, Tailwind v4 CSS-first (no `tailwind.config.js`), Radix dialog/alert-dialog/switch, dnd-kit + react-grid-layout in `features/profile-layout`                     | Feature layout is `src/features/<feature>/{pages,components,hooks,lib}/`, shared primitives in `src/shared-components/`, cross-cutting helpers in `src/lib/`. A new route that never reaches `router.tsx` is dead code. Server state held in Zustand is a finding |
| `apps/mcp`         | stdio MCP server, a thin HTTP client over the API. **Zero tests** — recorded debt                                                                                                                                                                                                                                                     | Judge it against the API contract it speaks, not against a test suite it does not have                                                                                                                                                                            |
| `apps/extractor`   | CLI + Claude Code hook turning local git history into hashed activity                                                                                                                                                                                                                                                                 | Anything that could emit unhashed repo content is a disclosure finding                                                                                                                                                                                            |

### Deliberate debt — do not report it as new

These are recorded decisions. Reporting them wastes the fan-out budget and buries the real findings. Classify as `pre-existing` unless the diff makes one **worse**:

- 30 pre-existing eslint errors in `apps/web` (CI records them as a non-blocking baseline).
- `apps/api` has no eslint history; its flat config is gated to changed files only.
- `packages/eslint-config` pulls `eslint-plugin-only-warn`, which downgrades every error to a warning and neuters any gate consuming it. No workspace uses it.
- `apps/api` and `apps/training` do not extend `packages/typescript-config/base.json` (strict + `noUncheckedIndexedAccess`).
- A stray `pluguins/` directory (typo). Leave it.
- i18n is shipped: react-i18next, three locales in `apps/web/src/i18n/locales/` (`pt-BR`, `en-US`, `es-ES`), `en-US` as source and fallback. **A user-visible string outside `t()` is a finding**, and so is a key present in one locale and missing from another — the gate checks both.

`scope` is the path-instruction glob, the instruction file's directory subtree, the selected skill's routed paths, or the learning's scope. To preserve the fan-out budget, the pack lists applied sources/rule counts plus one aggregate not-applicable count; complete per-source decisions stay in rules.json. `build_jobs.py` injects bound rules into defect cohorts, polish cohorts, and sweeps.

## 3. Linter lanes — run first, suppress overlaps

Detect what the repo already enforces and run it scoped to selected files; findings a lane reports are suppressed from the review (taxonomy rule 1).

**In CraftHub the lanes are:**

```bash
npm run build:schemas                       # ALWAYS first — every other lane types against dist/
npm run check-types                          # turbo run check-types — the real CI gate
node scripts/guardrails/lint-changed.mjs     # eslint over changed files only, ratcheted
```

`node scripts/guardrails/pre-push.mjs` runs the whole gate (the same script husky pre-push and the Claude Code Stop hook run). It is authoritative, but it also runs tests, so it is much slower than a lint pass — prefer it as a final confirmation, not as the review lane.

Two lane caveats specific to this repo:

- **Skipping `npm run build:schemas` makes `check-types` fail on a fresh tree** for reasons that have nothing to do with the diff. A lane that fails that way is `unavailable`, not a wall of findings.
- **`lint-changed.mjs` is ratcheted against a recorded baseline** — it reports only _new_ findings. That is the correct overlap set to suppress against. Do not treat the silent backlog as reviewed.

Optional lanes, both slow and neither a gate: `npm run test:coverage` (per-package ratchet floors, target 70) and `node scripts/visual/run.mjs scripts/visual/scenarios/<name>.scenario.mjs` (one browser launch per screen; fails on console errors, uncaught exceptions and unmocked 4xx/5xx). The visual runner is the only lane that can observe a missing UI state — run it when the diff touches a screen and the review has a four-state question.

Note also that `npm run test --workspace=api` is **not** a safe blanket lane: three suites need docker Postgres/pgvector (`bash db-manage.sh start`) and three need a funded `OPENAI_API_KEY`, and they hang 60–90 seconds rather than failing fast. The `testing-boss` skill lists them by name.

| Signal in repo                            | Lane command (scope to changed files where supported)               |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `Makefile` with `lint`/`check` target     | `make lint` (authoritative when present — prefer it over raw tools) |
| `golangci-lint` config / Go modules       | `golangci-lint run <changed dirs>`                                  |
| `package.json` scripts `lint`/`typecheck` | the repo's own script via its package manager                       |
| eslint/biome/oxlint config                | corresponding tool on changed files                                 |
| `tsconfig.json`                           | `tsc --noEmit` (project-wide; cheap signal)                         |
| `ruff.toml` / pyproject                   | `ruff check <files>`                                                |
| `Cargo.toml`                              | `cargo clippy`                                                      |

Record per lane: `ran` (attach findings on selected files, trimmed) or `unavailable` (tool missing/failed — overlap suppression is off for that lane and review.md must say so). Never install tools to fill a lane.

## 4. PR intent

With `--pr`: title, description, linked issues (`gh pr view N --json title,body,closingIssuesReferences`), and base/head. Locally: `git log --oneline <base>..<head>` plus the user's stated intent. Reviewers judge the diff against _stated intent_ — a change that does more than its description says is itself a finding.

## 5. Spec contract (`--spec`)

Resolve the conformance baseline: a file path is itself the artifact; a directory contributes its contract-bearing documents — `_prd.md`, `_techspec.md`, `_tests.md`, `_examples.md`, `_qa.md`, `_user_stories.md`, parity maps, requirement/UX docs, plus any document the spec's own files name as canonical. List every resolved artifact as `path → one-line role`. These are the baseline the `spec-parity` sweep judges against — do NOT extract rubric rules from them: §1 sources are review law, the spec is the contract under test.

## 6. context-pack.md layout

```markdown
# Context Pack — <target>

## Intent

<title/description/commits digest>

## Rubric

<applied source: path → rule count; N other sources classified not-applicable in rules.json; canonical forms: knowledge.json + rules.json>

## Linters

<lane → ran(findings digest) | unavailable(reason)>

## Spec contract

<only with --spec: one `- `path`` line per artifact — render_review.py parses these lines for the conformance table>
```
