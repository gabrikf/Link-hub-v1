# The agent harness

How CraftHub's instructions for coding agents are wired, how to add to them,
and how to onboard a new tool. If you are here to add a rule, jump to
[Adding a rule](#adding-a-rule).

The vocabulary is Böckeler's: a **guide** is context an agent reads _before_
acting (`AGENTS.md`, skills, `DESIGN.md`); a **sensor** is feedback it gets
_after_ acting (the gate, `harness-check`, the i18n checks, the visual runner,
verifying a write through the postgres MCP server). When a rule can become a
check, make it a check — a sensor cannot be forgotten, and its failure message
carries the fix.

---

## Layout

```
AGENTS.md                    the root index — identity, the gate, the
                             non-negotiables, the MCP table, the Output
                             contract, and a table pointing at everything else
CLAUDE.md -> AGENTS.md       symlink, so Claude Code reads the same bytes
apps/api/AGENTS.md           api depth      + apps/api/CLAUDE.md -> AGENTS.md
apps/web/AGENTS.md           web depth      + apps/web/CLAUDE.md -> AGENTS.md
packages/schemas/AGENTS.md   the contract   + packages/schemas/CLAUDE.md -> …
DESIGN.md                    the visual contract
docs/mcp-servers.md          MCP server setup and safety
docs/harness/                this file, known debt, the eval log, the ledger

.agents/skills/<name>/       the real skills (SKILL.md + references/)
.agents/settings.json        the real settings and hooks
.claude/skills   -> ../.agents/skills
.claude/settings.json -> ../.agents/settings.json
.kiro/skills     -> ../.agents/skills
```

**Edit the target, never the link.** Paths written as `.claude/skills/...`
elsewhere in the docs still resolve, through the symlink.

`.agents/` holds the real content because it is the tool-neutral name; the
per-tool directories are aliases so that no tool needs a second copy that can
drift.

---

## Who reads what

Verified against vendor documentation on 2026-09-03. Re-check it when you add a
tool — this table is the reason the layout looks the way it does.

| Surface                     | Claude Code                                                           | Cursor                              | Codex                                                              | Kiro                                             |
| --------------------------- | --------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| Root `AGENTS.md`            | through the `CLAUDE.md` symlink                                       | native, always                      | native; whole chain capped at **32 KiB** (`project_doc_max_bytes`) | native, always                                   |
| Nested `apps/x/AGENTS.md`   | only via `apps/x/CLAUDE.md`, then on demand when a file there is read | native, nearest wins                | only when the session cwd is inside that directory                 | **all** nested files, **every** session          |
| Skills in `.agents/skills`  | through `.claude/skills`                                              | native                              | native                                                             | `.kiro/skills` only — symlinked here, unverified |
| Path-scoped always-on rules | `.claude/rules/*.md` with `paths:`                                    | `.cursor/rules/*.mdc` with `globs:` | none                                                               | `.kiro/steering/*.md`                            |
| Recommended size            | < 200 lines per file                                                  | rules < 500 lines                   | chain < 32 KiB                                                     | "focused by domain"                              |

Three consequences shape everything below:

1. **Nested `AGENTS.md` is the only path-scoping mechanism all four tools
   share.** It is the primary way a directory-specific rule stays out of the
   root. Tool-specific rule directories are projections, worth adding only for
   a genuinely cross-cutting, file-pattern-based rule.
2. **Kiro loads every nested file on every session**, so nested files have a
   size budget too, not just the root.
3. **Codex truncates the chain past 32 KiB silently.** Not a warning — the
   bottom of your instructions simply is not there.

---

## The sensors

```bash
npm run harness:check              # or it runs inside npm run guardrails
npm run harness:check:self-test    # proves the check still catches violations
```

Four kinds, all wired into the gate and CI.

**`scripts/guardrails/harness-check.mjs`** enforces:

- every path cite in the harness resolves;
- every `npm run x` cite exists in some `package.json`;
- root `AGENTS.md` ≤ 120 lines and ≤ 6 KB; each nested `AGENTS.md` ≤ 200 lines
  and ≤ 8 KB; each `SKILL.md` ≤ 500 lines; every root-to-file chain ≤ 32 KiB;
- every skill's frontmatter `name` matches its folder and has a `description`.

It is deliberately quiet about anything ambiguous — placeholders, elisions,
globs, URLs, fenced examples and cites into trees this repo does not have are
not cites. A gate that cries wolf gets bypassed.

**`scripts/guardrails/design-tokens.mjs`** enforces "no `slate` / `gray` /
`blue` / `indigo`", and "no hardcoded hex in a component" for the case with
teeth — an arbitrary hex inside a Tailwind class. `docs/harness/sensor-backlog.md`
records the part of that rule this sensor does not yet cover.

**`scripts/guardrails/lint-changed.mjs`** is the ratchet. It lints the files a
change touched — against `eslint.config.js` at push time, against
`eslint.typed.config.js` too — and compares findings to
`scripts/guardrails/lint-baseline.json`, keyed by file and rule. An inherited
finding passes; a new one fails. It is what makes the type-aware lint layer
usable while its 555-finding backlog is still open, and what stops a rule
that fired once from being silently reintroduced two commits later.

**Eslint rules that became checks** — a prose rule expressed directly as a
lint rule instead of a sentence somebody has to remember, plus
`eslint-plugin-sonarjs`'s whole recommended set (see below for what that is).
Which rules currently fire as checks, what each replaced, and which have since
stopped firing without anyone deciding that on purpose, is tracked in
`docs/harness/sensor-backlog.md`'s "Built" table rather than copied here — that
is the one place this repo keeps that list current.

---

## The hooks

Three scripts, each answering a different question, at a cost that decides
where it runs. A fourth trigger point — Claude Code's `Stop` event — exists
too, but it invokes the same script as `pre-push` rather than being its own
question.

| Hook                        | Scope                            | Cost                           | Question                                                       |
| --------------------------- | -------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| `PostToolUse` (Claude Code) | the one file an agent just wrote | < 1s                           | did that edit introduce a lint error?                          |
| `pre-commit` (husky)        | staged files                     | ~3s, ~5s across two workspaces | is this well-formed, and free of new findings?                 |
| `pre-push` (husky)          | the affected graph               | < 90s                          | does it still build, type-check, test and hold its guardrails? |
| `Stop` (Claude Code)        | same script as `pre-push`        | < 90s                          | can this agent call itself done?                               |

**`PostToolUse` is the one worth understanding.** `Stop` already prevents an
agent finishing on a red tree, but it fires at the end: the model writes a file,
writes nine more, and only then learns the first had an unused import — by which
point the context that would have made the fix obvious is gone.
`scripts/guardrails/lint-file-hook.mjs` runs eslint on that single file straight
after the `Edit` or `Write` and exits 2, which Claude Code feeds back to the
model as text. It reports rather than autofixes, because rewriting the file an
agent just wrote desynchronises it from what the agent believes is on disk.

It **fails open on everything** — malformed payload, path outside a workspace,
eslint erroring — because a hook that blocks an agent because of its own bug is
worse than no hook.

**`pre-commit` autofixes and re-stages, then blocks on what is left.**
`scripts/guardrails/pre-commit.mjs` runs against staged files only: prettier
first, then `eslint --fix` through `lint-changed.mjs --syntactic`, then it
re-stages whatever either one touched — otherwise the fix sits in the working
tree and the commit records the unformatted version, which is the single most
confusing way for a format-on-commit hook to fail. It is deliberately not a
small `pre-push`: it never runs tests, and it never touches the type-aware
layer, because that layer's cost (a TypeScript program per workspace) is a
large fixed cost rather than a per-file one — fine inside `pre-push`'s
90-second budget, wrong between typing `git commit` and getting the terminal
back.

**`pre-push` is unchanged by this round of work**, other than the ratchet now
running across all seven workspaces instead of two. It is still the full gate:
build, type-check, test, and every other guardrail, budgeted at under 90
seconds. `Stop` calls the identical script with `--stop-hook`, so there is one
definition of "does this still hold," not two that can drift apart.

**Two lint layers, and the split is about cost.** `eslint.config.js` is
syntactic and runs in seconds; `npm run lint` uses it and it is meant to be
green. `eslint.typed.config.js` adds the rules that need a TypeScript program —
`no-unsafe-*`, `no-floating-promises` — at roughly five times the runtime, and
it carries a recorded backlog, so it runs only through
`scripts/guardrails/lint-changed.mjs` against the ratchet in
`lint-baseline.json`. Inherited findings pass; new ones fail.

**`eslint-plugin-sonarjs` is SonarQube's own analyzer, running locally.**
`packages/eslint-config/base.js` loads `sonarjs.configs.recommended` into the
syntactic layer, so it runs through `npm run lint`, `PostToolUse` and
`pre-commit` like any other syntactic rule — cognitive complexity, duplicated
branches, useless assignments, identical sub-expressions, the bug classes a
type-checker cannot see. It is the same rule set the `sonarqube` MCP server's
cloud instance runs, packaged as an eslint plugin instead: no server
round-trip, no account, nothing about this repo leaves the machine to produce
these findings.

---

## Adding a rule

1. **Pick the most specific file that covers it.** api-only → `apps/api`.
   web-only → `apps/web`. A boundary shape → `packages/schemas`. Visual →
   `DESIGN.md`. A whole procedure → a skill. The root file takes a rule only
   when it applies everywhere.
2. **Write it whole, in one place.** Never build a sentence out of fragments
   across two files. If the same rule genuinely belongs in two places, keep the
   text in the most specific one and leave a one-line pointer in the other.
3. **Ask whether it can be a check instead.** If a script can catch the
   violation, write the script — see `docs/harness/sensor-backlog.md` for the
   ones already identified and not yet built.
4. **Run `npm run harness:check`.** Over budget usually means the file is
   carrying depth that belongs somewhere else, not that the budget is wrong —
   move the depth first, and only argue with the number when the content that
   would have to go is content somebody deliberately put there.

---

## Adding a skill

```
.agents/skills/<kebab-name>/
  SKILL.md          frontmatter + the procedure, under 500 lines
  references/       the reference bulk the procedure points at
```

- Frontmatter needs `name` (exactly the folder name) and `description`.
- The `description` is the only text a model sees when deciding whether to load
  the skill. Lead with the trigger words. Codex caps the whole skill list at
  2 % of context, and descriptions are what it shortens first.
- Add `paths:` when the skill is directory-bound (Claude Code and Cursor honour
  it; Codex ignores it harmlessly).
- Keep the behaviour-changing contract in `SKILL.md` and move the bulk to
  `references/`. Do not replace a rule with a pointer into the code tree — that
  swaps the source of truth for a path that will move.

---

## Onboarding a new agent tool

1. **Find out where it looks** — root instruction file, nested files, skills,
   rules — and add a row to the table above with the doc you checked.
2. **Add an alias, not a copy.** A symlink into `.agents/` keeps one set of
   bytes. A copy is a second harness that will drift, silently, and be judged
   as a duplicate surface by `harness-eval`.
3. **Prove it loaded.** Claude Code: `/context` shows nested memory files after
   you read a file in that directory. Cursor: the rules/skills pane. Codex:
   start a session with the cwd inside the workspace. Kiro: the steering panel.
   Save what you saw under `docs/harness/evidence/`.
4. **Re-run the sensor**, then `harness-eval`'s inventory, and confirm the new
   surfaces are discovered and deduped rather than double-counted.

---

## Known orphan

`.github/terraform-dvn-style.instructions.md` is a GitHub Copilot-style rule
scoped to `**/*.tf`. Nothing else in the harness references it, and no tool in
the table above reads that location.

It is left in place rather than promoted to `infra/terraform/AGENTS.md`, because
its content describes a **different project**: numbered `NN-<purpose>-stack`
roots on AWS with EKS, ECR and VPC. This repo's terraform is a single flat
`infra/terraform/envs/prod/` against Cloudflare and Hetzner. Moving it as-is
would put a confidently wrong guide exactly where an agent editing `.tf` files
would load it.

Two ways out, both a decision rather than a cleanup: delete it, or write an
`infra/terraform/AGENTS.md` that describes the stack this repo actually has.

---

## Evaluating the harness

The `harness-eval` skill (`.agents/skills/harness-eval/`) scores the harness
itself: Track A is deterministic correctness, Track B is redundancy and Track C
is usefulness, both with dual blind judges and planted traps.

```bash
SKILL_DIR=.agents/skills/harness-eval
RUN_ID=$(date -u +%Y-%m-%d)-full
python3 "$SKILL_DIR/scripts/inventory_extract.py" --root . --run-id "$RUN_ID"
python3 "$SKILL_DIR/scripts/track_a_correctness.py" --root . --run-id "$RUN_ID"
```

Runs land in `.harness-eval/runs/<run-id>/`, which is gitignored — a run is a
record of one evaluation, not of the repo. What gets committed is the summary
in `docs/harness/eval-log.md` and the claim ledger.

The claim deck runs to ~1,400 rows, which is more than one judge can score in
one answer without quietly truncating, so shard it first:

```bash
node scripts/harness/shard-deck.mjs --run-dir .harness-eval/runs/$RUN_ID --shards 6
```

**This repo's copy of the skill is a local fork.** Several fixes were made to
its scripts on 2026-09-04 (directory cites, workspace-relative resolution,
workspace manifests, nested-checkout pruning, four-digit claim IDs) and the
`skills` CLI lock file was removed so an update cannot silently revert them.
Re-installing the upstream skill over this directory would reintroduce a Track A
that reports ~48 false BROKEN on this repo.

### Proving nothing was lost

`scripts/harness/claim-ledger.mjs` snapshots every claim with the band its
judges gave it, then diffs a later tree against that snapshot:

```bash
node scripts/harness/claim-ledger.mjs --run-dir .harness-eval/runs/$RUN_ID \
  --out docs/harness/claim-ledger-baseline.json
node scripts/harness/claim-ledger.mjs --diff docs/harness/claim-ledger-baseline.json \
  --against . --report docs/harness/claim-ledger-diff.md
```

A claim that disappeared and was in the `Review` band (both judges said keep) or
sat in a `Keep-core` surface is a regression, and the diff exits non-zero
saying so. Restore it rather than arguing with it.

**Know what it covers.** The claim deck extracts sentence-level claims from the
`AGENTS.md` files and every `SKILL.md`, and exactly one routing claim per
reference file. So it proves nothing was lost from the rule files and the skill
entry points; it proves nothing at all about content deleted from
`references/*.md`. For those, the protection is the report that authorised the
cut — a dual-judge Mixed verdict with a per-section KEEP list, confirmed on a
second model family before anything large goes.
