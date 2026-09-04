# Plan — evaluate the agent harness, split `AGENTS.md`, keep every guardrail

Status: **draft for review**, written 2026-09-03. Executor: Opus 5 in Claude Code,
coordinating subagents. Author of this plan: Fable 5.1. Nothing below has been
applied to the harness yet; only a zero-token baseline run was made.

Read this file top to bottom once. Then execute phases in order. Every phase
ends with a checkpoint that must be true before the next one starts.

---

## 0. Why, in one paragraph

The harness is good and dense: 219 always-on lines at the root, 211 + 165 in
the two workspace files, eleven skills, a deterministic gate, and a Stop hook.
The problem is not quality, it is **placement**: rules that only matter in
`apps/web` load for every task, the same rule exists in two or three places
(four-state rule, design primitives, lint debt, Tests), and the root file is
past the size every vendor now recommends. The fix is progressive disclosure:
a short root index that every tool reads, workspace files that load only where
they apply, skills for procedures, and sensors (scripts) wherever a prose rule
can become a check. Nothing is deleted on taste. Every cut is justified by an
eval report ID, and a deterministic claim ledger proves no guardrail was lost.

Vocabulary used below (from Böckeler): a **guide** is feedforward context an
agent reads before acting (`AGENTS.md`, skills, `DESIGN.md`); a **sensor** is
feedback the agent gets after acting (the gate, i18n checks, visual runner,
postgres MCP verification, Stop hook). Both can be **computational** (scripts)
or **inferential** (LLM judges, review skills). `harness-eval` is a sensor for
the harness itself.

---

## 1. Facts established today (do not re-derive)

### 1.1 Layout

```
AGENTS.md                      219 lines / 10.0 KB   real rules (T0)
CLAUDE.md -> AGENTS.md         symlink               Claude Code alias
.claude/CLAUDE.md              HTML comment only     explains the alias layout
.claude/skills -> .agents/skills   symlink
.claude/settings.json          Stop hook -> scripts/guardrails/pre-push.mjs
.agents/settings.json          same hook (tool-neutral copy)
apps/api/AGENTS.md             211 lines / 8.1 KB    NOT aliased as CLAUDE.md
apps/web/AGENTS.md             165 lines / 6.3 KB    NOT aliased as CLAUDE.md
.agents/skills/<11 skills>     SKILL.md + references/ (two SKILL.md > 500 lines)
.cursor/skills/harness-eval    untracked COPY (from `npx skills`), not a symlink
.windsurf/skills/harness-eval  untracked COPY
.agents/.skill-lock.json       untracked, from the `skills` CLI
.github/terraform-dvn-style.instructions.md   Copilot-style rule for *.tf, orphan
DESIGN.md 342 lines, docs/mcp-servers.md 190 lines   mandated loads from AGENTS.md
```

### 1.2 Who reads what (verified against vendor docs on 2026-09-03)

| Surface | Claude Code | Kiro | Cursor | Codex |
|---|---|---|---|---|
| Root `AGENTS.md` | Only through the `CLAUDE.md` symlink (works) | Native, always | Native, always | Native; whole chain capped at **32 KiB** (`project_doc_max_bytes`) |
| Nested `apps/x/AGENTS.md` | **Not loaded** unless `apps/x/CLAUDE.md` exists (then on demand, when a file there is read) | **All** nested files, **every** session, no inclusion modes | Nested supported, nearest wins | Only when the session cwd is inside that dir (root to cwd walk) |
| Skills in `.agents/skills` | Through `.claude/skills` symlink | **Not read** (`.kiro/skills` only) | Native (`.agents/skills`, `.cursor/skills`, `.claude/skills`) | Native (`.agents/skills`, nested) |
| Path-scoped always-on rules | `.claude/rules/*.md` with `paths:` | `.kiro/steering/*.md` `inclusion: fileMatch` (IDE only; CLI loads all) | `.cursor/rules/*.mdc` with `globs:` | None |
| Skill frontmatter `paths:` | Yes | Unknown | Yes | No (name + description only) |
| Recommended size | < 200 lines per file | "focused by domain" | rules < 500 lines | keep chain < 32 KiB |

Consequences that shape the design:

1. **Nested `AGENTS.md` is the only path-scoping mechanism all four tools share.** Use it as the primary way to move directory-specific rules out of the root. Tool-specific rule dirs (`.claude/rules`, `.cursor/rules`, `.kiro/steering`) are projections, only worth adding for rules that are genuinely cross-cutting and file-pattern based.
2. **Claude Code does not load `apps/api/AGENTS.md` or `apps/web/AGENTS.md` today.** It relies on the sentence "read the one you are working in". Adding `apps/api/CLAUDE.md -> AGENTS.md` and `apps/web/CLAUDE.md -> AGENTS.md` makes them load on demand, exactly like path-scoped rules. This is a wiring bug to fix in Phase 0, independent of any eval result.
3. **Kiro loads every nested `AGENTS.md` always**, so nested files must stay lean too. Kiro does not read skills from `.agents/skills`; a `.kiro/skills -> ../.agents/skills` symlink is the candidate fix and must be verified in Kiro (a known Kiro issue says symlinked *steering* files are not followed).
4. **Codex only sees nested files when started inside them**, so the root keeps the explicit pointer with the path.
5. **Keep the root + nested chain under 32 KiB** (today 24.5 KB). Budget: root <= 6 KB, each nested <= 8 KB.

### 1.3 Baseline run (deterministic, zero model tokens)

Run: `.harness-eval/runs/2026-09-03-plan-baseline/` (inventory + Track A only).

| Metric | Value | Note |
|---|---|---|
| T0 surfaces discovered | 1 (`AGENTS.md`) | nested `apps/*/AGENTS.md` were classed as *optional docs*, not T0 |
| T1 skills | 12 | `harness-eval` counted twice (`.agents` + `.cursor` copy) |
| T2 refs | 45 | skill `references/` and assets |
| Atomic claims | 1,341 | 93 in `AGENTS.md`; 268 in `spec-implement`, 197 in `visual-check`, 176 in `spec-writer`, 110 in `i18n` |
| Track A BROKEN | 48 | **~30 are directory cites** (`apps/web`, `.agents/skills`) flagged because the script only accepts files; ~10 are placeholders (`lib/...`, `.agents/…`, `references/view.md` in teaching text); ~5 are workspace-relative cites (`src/router.tsx`, `lib/language.ts`) resolved from the repo root |

True broken cites in the harness after manual classification: **0**. The
noise is in the sensor, so Phase 0 fixes the sensor before it is used to judge.

### 1.4 Size against vendor guidance

| File | Lines | Guidance | Verdict |
|---|---|---|---|
| `AGENTS.md` | 219 | < 200 (Claude Code), ~100 as index (OpenAI) | over |
| `apps/api/AGENTS.md` | 211 | < 200 | at the line |
| `apps/web/AGENTS.md` | 165 | < 200 | ok |
| `spec-implement/SKILL.md` | 696 | < 500, rest in `references/` | over |
| `visual-check/SKILL.md` | 656 | < 500 | over |
| `spec-writer/SKILL.md` | 459 | < 500 | close |
| `i18n/SKILL.md` | 310 | < 500 | ok |

---

## 2. Target architecture

```
AGENTS.md                 <= 120 lines, <= 6 KB. Identity, the gate, the
                          non-negotiables, the Output contract, and an INDEX:
                          one table "topic -> file -> when to load it".
apps/api/AGENTS.md        <= 150 lines. Everything api-only. + CLAUDE.md symlink.
apps/web/AGENTS.md        <= 150 lines. Everything web-only. + CLAUDE.md symlink.
packages/schemas/AGENTS.md  new, <= 60 lines: contract-first, build order,
                          the "parse a real payload" sensor. + CLAUDE.md symlink.
.agents/skills/*          procedures. Every SKILL.md <= 500 lines; bodies that
                          are reference material move to references/.
                          `paths:` frontmatter where a skill is directory-bound.
docs/harness/             this plan, the claim ledger, the how-to-onboard-a-tool
                          doc, eval summaries.
scripts/guardrails/harness-check.mjs   new computational sensor (see 2.3).
```

### 2.1 What stays in the root, no matter what the judges say

These are policy or safety claims. They are `KEEP-POLICY` / `KEEP-CAVEAT` by
construction and are pre-listed so a judge cannot vote them out:

- The gate command, "you are not done until it passes", the ban on
  `--no-verify` / `eslint-disable` / `.skip` / type assertions / widened schemas,
  and "the gate says what it skipped; do not silence it".
- Contract first: change `@repo/schemas` first, build it, never define a
  boundary type locally, never widen a schema to pass.
- Never `any`; kebab-case files; vitest never jest; TanStack Query for server
  state; the Zustand single store.
- The four-state rule as a one-line mandate (the mechanics move to web).
- `postgres-prod` handling: query the one id, never browse a user table; prod
  reads leave the building inside a context window.
- Known debt is recorded on purpose: do not fix as a side quest, do not grow it.
- The Output contract (four numbered items). It is the pre-completion
  checklist LangChain found most valuable; keep it verbatim.
- The pointer "read `apps/<x>/AGENTS.md` for the workspace you are in".

### 2.2 Move map for the current `AGENTS.md` (proposal; Track C decides the cuts)

| Current section | Destination | Root keeps |
|---|---|---|
| Header, stack, ports | root | 4 lines |
| The gate | root | full, tightened |
| Contract first | `packages/schemas/AGENTS.md` (new) | 3-line rule + pointer |
| Testing table | rows split into `apps/api` and `apps/web` files (both already have a Tests section: OVERLAP) | 3 lines: vitest, when to write a test, never edit an existing test to pass |
| Four-state rule | `apps/web/AGENTS.md` (already there: OVERLAP) | 1 line + the visual command |
| Design | `apps/web/AGENTS.md` + `DESIGN.md` (already there: triple OVERLAP) | 2 lines: "DESIGN.md is prescriptive; surface constants, never hand-written" |
| Conventions | root for cross-cutting; web feature-folder rules to `apps/web` (OVERLAP) | 5 lines |
| i18n (30 lines) | `i18n` skill (310 lines, already the contract) + `paths: apps/web/**` | 3 lines: every string through `t()`, three locales, the gate enforces |
| MCP (20 lines) | `docs/mcp-servers.md` (already 190 lines) + `context7-usage` skill (OVERLAP) | 5-line table: server, purpose, one safety rule each |
| Known debt (7 items) | `docs/harness/known-debt.md` or the workspace files where each item lives (`apps/web` already lists the 30 lint errors: OVERLAP) | the policy line + pointer |
| Output contract | root | verbatim |

Estimated root after the move: 95 to 120 lines. If Track C marks something in
the move map as `KEEP-CORE` in the root, it stays in the root. The map is a
proposal, the reports are the decision.

### 2.3 Guide-to-sensor promotions (Böckeler, Anthropic: "if a rule can be a check, make it a check")

Each of these turns prose into a deterministic check whose failure message
carries the fix (OpenAI: "linter messages double as remediation"). Once the
sensor exists the rule shrinks to one line, and it can no longer be forgotten.

| Prose rule today | Sensor | Effort | Do in this plan? |
|---|---|---|---|
| `src/core` must not import `src/infra`, `fastify`, `drizzle-orm`, `ioredis`, `openai`, `pg` | eslint `no-restricted-imports` scoped to `apps/api/src/core/**` (dependency-cruiser is the heavier alternative Böckeler used) | small | yes |
| No `slate`/`gray`/`blue`/`indigo`, no hex outside `index.css` and `brand-logo.tsx` | `scripts/guardrails/design-tokens.mjs`, same shape as `i18n-raw-strings.mjs` | small | yes |
| Icons: `react-icons/fi` only | eslint `no-restricted-imports` pattern `react-icons/!(fi)` | tiny | yes |
| Every route component is lazy | structural test on `router.tsx`: every route uses `lazyRouteComponent` | small | yes |
| Cites in harness files must resolve; size budgets; chain < 32 KiB; SKILL.md < 500 lines | `scripts/guardrails/harness-check.mjs`, run by the gate and CI | small | **yes, Phase 0** |
| Every colour utility needs a `dark:` twin | heuristic, noisy | medium | no, stays a guide + visual runner |
| Never hand-write `SURFACE*` strings | pattern detection is fragile | medium | backlog |
| Never `any` | confirm `@typescript-eslint/no-explicit-any` is `error` in the shared config; if it is, the prose line becomes a pointer | tiny | yes (verify) |

Anything not done here goes to `docs/harness/sensor-backlog.md` with the rule
text it would replace, so the guide is not shortened before its sensor exists.

### 2.4 Evidence sources for the usefulness judges (LangChain: "traces as feedback")

Give the Track C judges these as read-only evidence of where the harness
demonstrably failed or held, so usefulness is judged on behaviour, not theory:

- `docs/qa/reports/*.md` and `docs/qa/bugs/*.md` (nightly loop outcomes).
- Recent PR review threads on `develop` (`gh pr list --state merged --limit 20`).
- `~/.claude/projects/<repo>/memory/*.md` feedback files (the Stop hook
  "fights any agent that leaves the tree red" entry is a documented harness
  failure mode).
- `git log -p -- AGENTS.md apps/*/AGENTS.md` (why each rule was added).

---

## 3. Phases

`harness-eval` is used in all three eval-bearing phases: **Phase 1** (baseline,
full A+B+C), **Phase 2** (Track A after every batch of edits, as the fast
regression check), **Phase 3** (full A+B+C again, same judge model, compared
against the baseline). Q1 and Q2 questionnaires are still asked in each run;
Gabriel's answers are pre-recorded in 3.2 so the executor can proceed.

### Phase 0 — Fix the sensor and the wiring (no eval yet)

0.1 **Commit the skill.** `.agents/skills/harness-eval/` is untracked. Commit
it. Delete the `.cursor/skills/harness-eval` and `.windsurf/skills/harness-eval`
copies (Cursor reads `.agents/skills` natively; Windsurf is not in scope) and
decide on `.agents/.skill-lock.json` (keep only if the `skills` CLI stays the
install path; otherwise delete). Add `.harness-eval/runs/` to `.gitignore`;
summaries get copied into `docs/harness/` by hand.

0.2 **Fix Track A precision** in `scripts/track_a_correctness.py` (around
lines 324 and 333: `is_file()` only): accept directories; treat `…` (U+2026)
and `...` the same as placeholders; resolve cites inside a surface that names a
workspace (`apps/api`, `apps/web`) against that workspace root as a second
attempt before flagging. Re-run on the baseline: target is **0 BROKEN** with no
false negatives introduced (spot-check by adding one deliberately dead cite in
a scratch copy and confirming it is caught).

0.3 **Extend discovery** in `inventory_extract.py` (`T0_NAMES` / `T0_GLOBS`,
lines 19 to 20) and the fan-in scan in `merge_usefulness.py`: nested
`**/AGENTS.md` (excluding `node_modules`), `.claude/rules/**/*.md`,
`.kiro/steering/**/*.md`, `.agents/rules/**/*.md`, `.windsurf/rules/**`. Dedupe
surfaces by resolved path so symlinked skill trees do not count twice. Keep the
README exclusion. Nested `AGENTS.md` become T0 (they are always-on in Kiro and
on demand elsewhere), not optional docs.

0.4 **Claude Code wiring.** Add `apps/api/CLAUDE.md -> AGENTS.md`,
`apps/web/CLAUDE.md -> AGENTS.md` (and later `packages/schemas/CLAUDE.md`).
Verify: start a session at the root, read one file under `apps/api/src`, run
`/context` and confirm the nested file appears under Memory files. Add an
`InstructionsLoaded` hook (log to `.harness-eval/instructions-loaded.log`) for
the duration of this work so every load is evidenced, then remove it.

0.5 **Kiro wiring.** Confirm root and nested `AGENTS.md` show in Kiro's steering
panel. Try `.kiro/skills -> ../.agents/skills`; if symlinks are not followed,
record that in `docs/harness/agent-harness.md` and leave Kiro skills as a
documented gap rather than copying files.

0.6 **`scripts/guardrails/harness-check.mjs`** (new sensor, wired into
`pre-push.mjs` and `npm run guardrails`, budget < 1 s): every path cite in
`AGENTS.md`, `**/AGENTS.md`, `.agents/skills/**/*.md`, `DESIGN.md`,
`docs/mcp-servers.md` resolves; every `npm run x` cite exists in
`package.json`; root <= 120 lines; nested <= 150; `SKILL.md` <= 500; root +
nested chain <= 32 KiB; every skill frontmatter has `name` matching its folder
and a `description`. Failure messages say the file, the cite, and the fix.
This is Track A made permanent.

Checkpoint 0: gate green; Track A on the baseline reports 0 BROKEN; nested
files load in Claude Code (screenshot or `/context` transcript saved to
`docs/harness/evidence/`).

### Phase 1 — Baseline eval (full)

1.1 `RUN_ID=2026-09-XX-baseline`. Inventory with the extended discovery.

1.2 **Q1 answer (pre-recorded):** include `DESIGN.md` and `docs/mcp-servers.md`
(both are hard-load mandates from the root, so they are harness surfaces).
Exclude `DEVELOPMENT-GUIDE.md`, `.mcp.json`, `.playwright/*`,
`packages/typescript-config/base.json` (config, not instruction). Nested
`AGENTS.md` are T0 after 0.3, so the `apps` type no longer appears.

1.3 **Q2 answer (pre-recorded): `B+C`.** Show the table once for cost
visibility. Judges: same allowlisted non-fast model for all four (record the
id in every score file). Judge2 of each track is blind per the protocol; spawn
B1+B2 in parallel, then C1+C2 in parallel.

1.4 Track A -> `04`. Track B -> `05`, `06`, merge -> `07`. Track C ->
`surfaces`, `08`, `09`, merge -> `10` and `11-mixed-apply.md`. Trap gates must
PASS; on FAIL fix plants and re-score, never Ship/Slim on a failed trap.

1.5 **Claim ledger.** Write `scripts/harness/claim-ledger.mjs`: reads a
baseline `claims.jsonl`, stores normalised claim text + source + the band it
received in `07` (Ship/Review/Hold) and the section tag from `10`. Output
`docs/harness/claim-ledger-baseline.json`. This file is the contract for
Phase 3.

Checkpoint 1: `04`, `07`, `10`, `11` exist; both trap gates PASS; ledger
written; a 20-line human summary appended to `docs/harness/eval-log.md`
(counts per band, top OVERLAP pairs, Slim candidates, fan-in blocked rows,
judge model id).

### Phase 2 — Restructure

Rules of the move (all of them, every time):

- A claim moves or is cut **only** with a report ID (`07` Ship row, `10` Slim
  row, or `11` CUT row). Everything else moves verbatim or stays.
- **Cut means cut, not pointer** (skill rule 13): never replace a rule or a
  fenced snippet with "see `apps/...`"; keep the contract in the harness file.
- `Hold` and `slim-fanin-blocked` rows do not move.
- OVERLAP: keep the copy in the most specific file, leave a one-line pointer
  in the more general one.
- Never build a sentence out of fragments across files; a rule reads whole in
  one place.
- After each batch: `harness-check.mjs` + Track A on a scratch run id.

2.1 **Root rewrite** per 2.1 and 2.2. Structure: identity (4 lines), the gate,
non-negotiables (one bullet each), the index table, the Output contract. The
index row format: `| topic | file | load when |`. HTML comments are stripped by
Claude Code but not by other tools, so do not use them for notes.

2.2 **Workspace files.** Absorb the moved rows; de-duplicate against what they
already say; add `packages/schemas/AGENTS.md`; add the three `CLAUDE.md`
symlinks. Each stays <= 150 lines and <= 8 KB.

2.3 **Skills.** Apply `11-mixed-apply.md` KEEP/CUT per ID, nothing else. For
`spec-implement` (696) and `visual-check` (656): move reference bulk to
`references/` so `SKILL.md` <= 500 lines, keeping the behaviour-changing
contract in `SKILL.md`. Add `paths:` to directory-bound skills (`visual-check`
and `i18n` -> `apps/web/**`; `drizzle-orm` style content, if any, -> `apps/api/**`).
Tighten every `description` to lead with trigger words (Codex caps the skill
list at 2 % of context, descriptions shorten first). Do not touch skills whose
surfaces came back Keep-core except for the `paths:` field.

2.4 **Sensors** from 2.3: implement the "yes" rows, each with a test proving a
violation is caught, then shorten the prose rule to one line + the sensor
name. Everything else to `docs/harness/sensor-backlog.md`.

2.5 **Docs.**
- `docs/harness/agent-harness.md` (new): the layout, the who-reads-what
  table from 1.2, how to add a rule (which file, size budget, run
  `harness-check`), how to add a skill (frontmatter, `paths:`, < 500 lines),
  how to onboard a new agent tool (Kiro/Cursor/Codex/Windsurf checklist:
  where it looks, which symlink or projection to add, how to verify it
  loaded), and how to run `harness-eval`. This replaces the HTML comment in
  `.claude/CLAUDE.md`, which becomes a two-line pointer.
- `README.md`: add a short "Working with coding agents" section pointing at
  `AGENTS.md` and `docs/harness/agent-harness.md`; fix the "Further reading"
  list. The README stays human-facing and out of eval scope.
- `DEVELOPMENT-GUIDE.md` intro: point at the same two files.
- `.github/terraform-dvn-style.instructions.md`: either move its content to
  `infra/terraform/AGENTS.md` (so every tool sees it where it applies) or
  delete it; ask Gabriel if unsure (open question 4).

2.6 **Review subagent** (Gabriel's standard workflow): a fresh-context reviewer
checks the diff against this plan, the ledger, and the reports: every moved
claim is findable, no cut without an ID, no pointer-instead-of-contract, sizes
within budget, three locales untouched, gate green. Fix everything it flags.
`deep-review` (`disable-model-invocation: true`, so `cat` its `SKILL.md`) is
the heavier option if the diff is large.

Checkpoint 2: gate green including `harness-check`; Track A 0 BROKEN; root
<= 120 lines; chain <= 32 KiB; every file in the index exists; reviewer's
findings closed.

### Phase 3 — Post eval and the no-loss proof

3.1 `RUN_ID=2026-09-XX-post`. Same Q1/Q2 answers, **same judge model** as
Phase 1 (usefulness is model-sensitive; a different model makes the comparison
meaningless).

3.2 Full A+B+C again. Trap gates must PASS.

3.3 **Ledger diff** (`claim-ledger.mjs --diff baseline post`):
- **RETAINED**: claim found (fuzzy token match >= 0.6) in some surface, with
  its new location.
- **CUT**: not found; must carry a report ID from Phase 1. Gate: `CUT` must
  not intersect Phase 1 `Review` (dual KEEP) rows or `Keep-core` /
  `BEHAVIOR-CHANGING` tags. Any intersection is a regression: restore it.
- **NEW**: claims that did not exist before (index rows, sensor pointers).
  Every NEW claim must be Track A clean.

3.4 **Compare** baseline vs post in `docs/harness/eval-log.md`: T0 line
count and bytes, claims per surface, Ship/Review/Hold counts, Slim/Keep-core
/Mixed counts, OVERLAP pairs remaining (target 0 for the four known ones),
Track A BROKEN (target 0 both), fan-in blocked rows.

3.5 **Per-tool load proof** (evidence in `docs/harness/evidence/`):
Claude Code `/context` at root and after reading `apps/api` and `apps/web`
files; Kiro steering panel; Cursor rules/skills pane if available on this
machine (Cursor is installed, `cursor-agent` is not); Codex is not installed,
so document the expected behaviour with the citation and mark it unverified.

3.6 Gabriel reviews. Only after that: squash into one PR to `develop` with
the eval summaries linked in the description.

Checkpoint 3 (acceptance): all of the following true, or the plan is not done:

- [ ] Root `AGENTS.md` <= 120 lines and <= 6 KB; chain <= 32 KiB.
- [ ] Every SKILL.md <= 500 lines; every nested `AGENTS.md` <= 150 lines.
- [ ] Track A: 0 BROKEN, before and after (after the sensor fix).
- [ ] Ledger: zero `CUT` claims from the Review / Keep-core / BEHAVIOR-CHANGING sets.
- [ ] The four known OVERLAPs (four-state, design primitives, lint debt, Tests) exist in exactly one place each plus pointers.
- [ ] `harness-check.mjs` in the gate and CI, green.
- [ ] Claude Code loads nested files on demand (evidence saved). Kiro loads root + nested (evidence saved).
- [ ] `docs/harness/agent-harness.md`, README, DEVELOPMENT-GUIDE updated.
- [ ] `npm run guardrails` prints `guardrails PASS`.

---

## 4. Execution notes for Opus 5

- Follow `workflow-plan-subagents-review`: lay shared foundations yourself
  (Phase 0 scripts, the root rewrite), fan out only on disjoint files (one
  subagent per destination file in 2.2 and 2.3), then the review subagent, then
  fix. Judges are always separate subagents; Judge2 never sees Judge1 output or
  trap keys.
- Do not use `*-fast` models for judges. Record `model:` in every score file.
- Track C Slim on a single model is advisory. Before deleting more than ~20
  lines from any surface, re-judge that surface on a second model family and
  treat disagreement as Hold (skill rule 8).
- Run `harness-eval` from the repo root with
  `SKILL_DIR=.claude/skills/harness-eval`; outputs to `.harness-eval/runs/`.
- The Stop hook runs the gate on every stop. Docs-only edits pass it quickly;
  script edits in `scripts/guardrails/` do not get special treatment, write
  the test first.
- Budget signal for Q2: ~1,400 claims after nested files are T0, ~60
  surfaces. Two runs (baseline + post) at B+C is the largest spend in this
  plan; it is the point of the plan.

---

## 5. References

Primary (named by Gabriel):

- Böckeler, B. *Harness engineering for coding agent users*, martinfowler.com, 2026-04-02. https://martinfowler.com/articles/harness-engineering.html — guides vs sensors, computational vs inferential, feedforward + feedback across the change lifecycle, "sensors never firing may mean no detection".
- Böckeler, B. *Harness Engineering, first thoughts* (memo), martinfowler.com, 2026-02-17. https://martinfowler.com/articles/exploring-gen-ai/harness-engineering-memo.html — reading of the OpenAI write-up; harnesses as "the new service templates".
- Böckeler, B. *Maintainability sensors for coding agents*, martinfowler.com, 2026-05-27. https://martinfowler.com/articles/sensors-for-coding-agents.html — ESLint with self-correcting messages, dependency-cruiser for layering, mutation testing, "monitor sensor effectiveness to learn which guides become unnecessary".
- LangChain. *Improving Deep Agents with harness engineering*, 2026-02-17. https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering — self-verification loop, context injection middleware, pre-completion checklist, doom-loop detection, traces as the feedback signal, 52.8 to 66.5 on Terminal Bench 2.0 with the model fixed.
- Cursor docs. *Rules*: https://cursor.com/docs/rules (`.cursor/rules/*.mdc`, `alwaysApply` / `globs` / `description`, nested `AGENTS.md`, "keep rules under 500 lines"). *Skills*: https://cursor.com/docs/skills (`.agents/skills` native, `paths:`, nested discovery).

Vendor loading rules (used for the who-reads-what table):

- Claude Code, *How Claude remembers your project*: https://code.claude.com/docs/en/memory (< 200 lines, `.claude/rules` `paths:`, nested `CLAUDE.md` on demand, `AGENTS.md` symlink, `/doctor` trims, `InstructionsLoaded` hook).
- Claude Code, *Skills*: https://code.claude.com/docs/en/skills (frontmatter incl. `paths`, `disable-model-invocation`, "keep SKILL.md under 500 lines").
- Claude Code, *Monorepos and large codebases*: https://code.claude.com/docs/en/large-codebases (per-directory files vs path-scoped rules, per-directory skills).
- Claude Code, *Best practices*: https://code.claude.com/docs/en/best-practices ("would removing this line cause a mistake? if not, cut it"; "if Claude already does it, delete the rule or convert it to a hook"; give Claude a way to verify).
- Kiro, *Steering*: https://kiro.dev/docs/steering/ (`AGENTS.md` root + nested always included, no inclusion modes; CLI loads all steering files). *Skills*: https://kiro.dev/docs/skills/ (`.kiro/skills` only).
- OpenAI Codex, *Custom instructions with AGENTS.md*: https://learn.chatgpt.com/docs/agent-configuration/agents-md (root to cwd walk, `AGENTS.override.md`, `project_doc_max_bytes` 32 KiB). *Build skills*: https://learn.chatgpt.com/docs/build-skills.md (`.agents/skills`, 2 % context budget for the skill list).
- agents.md standard: https://agents.md/ (nearest nested file takes precedence).

Secondary:

- OpenAI. *Harness engineering: leveraging Codex in an agent-first world*, 2026-02. https://openai.com/index/harness-engineering/ — `AGENTS.md` as a ~100-line table of contents over `docs/`, custom linters whose messages are the fix, a recurring doc-gardening agent.
- Anthropic. *Effective harnesses for long-running agents*, 2025-11-26. https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents — progress files, feature lists, clean state at session end (relevant to the nightly loop, not to this split).
- Thoughtworks Technology Podcast, *What is harness engineering?* https://www.thoughtworks.com/insights/podcasts/technology-podcasts/what-harness-engineering

---

## 6. Assumptions and open questions for Gabriel

1. **"The md file that explains how to add a new agent"**: I took this to be
   the layout note inside `.claude/CLAUDE.md` (the only place that explains the
   `.agents` / `.claude` alias scheme). The plan promotes it to
   `docs/harness/agent-harness.md`. If you meant another file (for example
   `apps/mcp/README.md` client configuration, or `docs/mcp-servers.md`), name it
   and 2.5 changes.
2. **"All 3 steps"**: read as the three eval-bearing phases (baseline,
   during-restructure, post), each running `harness-eval`; B+C in phases 1 and
   3, A-only during phase 2. If you meant Tracks A/B/C, that is also satisfied.
3. **Judge model**: Opus 5 for all four judges in both full runs; a second
   family only for the pre-delete re-check. Confirm the spend is acceptable
   (~1,400 claims x 2 judges x 2 runs, plus ~60 surfaces x 2 x 2).
4. **`.github/terraform-dvn-style.instructions.md`**: move to
   `infra/terraform/AGENTS.md`, or delete?
5. **Windsurf and the `skills` CLI lock file**: out of scope, delete the copies
   and the lock? Or keep the lock because you install skills that way?
6. **`.harness-eval/runs/` in git**: plan says gitignore + hand-copied
   summaries into `docs/harness/`. Prefer committing full runs instead?
