---
name: deep-review
description: >-
  Deep review of branch diffs, GitHub PRs or the working tree at any size, judged
  against this repo's own rubric (root and per-workspace AGENTS.md, DESIGN.md, and
  the local skills) and against CraftHub's six review priorities — @repo/schemas
  contract drift, disclosure-policy leaks, missing dark-mode variants, Drizzle N+1
  queries, unbounded OpenAI spend, and missing four-state UI handling. Use when the
  user asks for a CodeRabbit-grade review, an incremental re-review after new
  commits, or a conformance review against spec artifacts. Don't use for applying
  fixes, reviewing specs or PRDs as documents, or quick single-file feedback.
disable-model-invocation: true
argument-hint: "[--pr N | --base <ref> | --staged | --worktree] [--files p1,p2] [--spec <path>] [--max-cohort-files N] [--publish] [--full] [--out <dir>] [--no-workflow]"
---

# Deep Review

Review at CodeRabbit grade with no file cap and one assertive posture: funnel the diff, discover root/nested project instructions and relevant local skills, shard defects and polish into independent cohorts, fan out reviewers, then merge with complete hunk/rule accounting. Defects require causal evidence and control the verdict; advisories require a concrete improvement and always remain visible.

Steps 1–4 drive an idempotent artifact pipeline under `<out>`: every stage gate is a bundled-script exit 0, valid agent outputs are never re-run, and an interrupted round resumes by re-running the same commands.

`<skill-dir>` below means the directory containing this SKILL.md; run every bundled command from the repo root.

## Inputs (all optional)

| Flag | Meaning | Default |
| --- | --- | --- |
| `--pr <n>` | Review a GitHub PR (requires authenticated `gh`; head fetched locally) | — |
| `--base <ref>` / `--staged` | Local diff scope | merge-base with the origin default branch |
| `--worktree` | Review uncommitted + untracked work against the base ref (always a full round) | — |
| `--files <p1,p2>` | Restrict review to these paths | full diff |
| `--spec <path>` | Spec file or directory; its contract-bearing artifacts become the conformance baseline (spec-parity sweep + verdict gate) | — |
| `--max-cohort-files <n>` | Maximum files assigned to one cohort; the ~6,000 changed-line cap still applies | `100` |
| `--publish` | Post walkthrough + review to the PR | off — local report only |
| `--full` | Ignore prior state; review the whole diff again | incremental when state exists |
| `--out <dir>` | Artifact directory | `.deep-review/<target>/` |
| `--no-workflow` | Skip the Workflow tool; use Agent fan-out | Workflow when available |

## Repo config — `.deep-review.yaml`

Optional repo-root file, the skill-native config standard. Any key absent there falls back to its `.coderabbit.yaml` counterpart (`reviews.*`), so repos migrating from CodeRabbit work unconfigured. Top-level keys, all optional:

| Key | Meaning |
| --- | --- |
| `path_filters` | Globs over repo-relative paths: `!pat` excludes; bare patterns, when present, restrict review to their matches and beat any exclude; built-in excludes (locks, vendor, generated, testdata, snapshots) always append |
| `path_instructions` | `path` glob + verbatim `instructions` entries — the highest-precedence rubric source (Step 2) |
| `request_changes_workflow` | publish-mode review-event gate |

The manifest builder resolves `path_filters` into manifest.json; the knowledge stage ingests `path_instructions` together with project instructions and skills.

## CraftHub: runtime, rubric sources, priorities, and artifacts

**Runtime — `native` is the only supported one here.** The upstream `--subagent claude-opus|grok|codex` values dispatch through `compozy exec`, and `compozy` is not installed in this repo (`command -v compozy` → nothing). Those values are removed from the flag list above and from the argument hint; **do not pass `--subagent`**. Step 3 runs on the Workflow/Agent engines in `references/orchestration.md`. If `compozy` is ever installed, verify it first and only then read `references/subagent-runtimes.md`.

**Rubric sources this repo actually has.** `build_knowledge.py` auto-discovers root and nested `AGENTS.md` / `CLAUDE.md`, `.deep-review/learnings.md`, and every `SKILL.md` under `.claude/skills/`. Two high-value sources it does **not** discover must be added to `<out>/rules.json` by hand in Step 2, each read in full:

| Source | Status | What it binds |
|---|---|---|
| `AGENTS.md` (repo root) | auto-discovered | The project law across all workspaces |
| `apps/api/AGENTS.md`, `apps/web/AGENTS.md` | auto-discovered (nested) | Per-workspace depth. Scope each to its own directory subtree — do not fold them into the root entry |
| `.claude/skills/*/SKILL.md` | auto-discovered | Domain law per area — `testing-boss` (test shape and where a test belongs), `no-workarounds` (fix shape, the W-31…W-36 CraftHub catalog), `context7-usage` (which library APIs must not be written from memory) |
| **`DESIGN.md`** (repo root) | **add manually**, scope to `apps/web/**` | CraftHub's design language: tokens, typography, spacing, elevation, motion, and the light/dark pairing. A hardcoded color or a missing dark-mode variant is a defect against it |
| **`README.md`** (repo root) | **add manually**, low yield | Orientation: workspace boundaries and which parts are recorded debt. Read it so a finding does not "discover" something already written down |

**The six CraftHub review priorities** — contract drift against `@repo/schemas`, disclosure-policy leaks, missing dark-mode variants, N+1 queries through Drizzle, unbounded OpenAI spend, and missing four-state UI handling — are defined with their severity calibration at the end of `references/taxonomy.md`. Every defect cohort checks all six against its scope. `references/context-pack.md` carries the architecture model and the recorded-debt list a reviewer needs before extracting rules.

**Do not report a missing `t()` call or any i18n gap.** CraftHub has no i18n layer: `<html lang="en">` and all user-visible strings are hardcoded English, by decision. A finding that asks for translation infrastructure is a finding against the reviewer.

**Linter lanes here** (from the repo root, in this order):

```bash
npm run build:schemas                       # ALWAYS first — everything types against dist/
npm run check-types                          # the real CI gate
node scripts/guardrails/lint-changed.mjs     # ratcheted; reports NEW findings only
```

Findings from those lanes are recorded as `linter-overlap`, never re-reported as review defects. The full gate is `node scripts/guardrails/pre-push.mjs` — authoritative but slow, since it also runs tests. `references/context-pack.md` §3 has the caveats, including why `npm run test --workspace=api` is not a safe blanket lane.

**`.deep-review/` and `<out>` are generated artifacts and must be gitignored.** Confirm `.gitignore` carries `.deep-review/` before the first round, and if `--out` is pointed somewhere else, give that directory its own ignore line first: a review round is hundreds of generated files, and they must never reach a commit.

**Bundled scripts:** pure Python **standard library** (`argparse`, `json`, `hashlib`, `pathlib`, `re`, `shlex`, `shutil`, `subprocess`, `os`, `sys`, `threading`, `webbrowser`, `concurrent.futures`, `collections`, `datetime`) — no pip install, no virtualenv. `python3` here is **3.12.3**, which satisfies them (they use `from __future__ import annotations` and PEP 604 unions; 3.10+ is enough).

## Hard rules

- Source is read-only and **frozen**: the manifest pins `worktree_snapshot`, and run_jobs.py / render_review.py refuse a drifted checkout. Writes go only to `<out>`, `.deep-review/` state, and — with `--publish` — the target PR.
- No file-count cap: a large selection means more cohorts, never a skipped or silently truncated review. Every selected file lands in exactly one cohort.
- Every defect starts with `Premise → Path → Verdict`; every advisory starts with `Premise → Improvement → Fix`. Investigated rejections remain visible in the suppression ledger.
- Every selected hunk line receives both defect and polish coverage. Every bound rule receives an explicit compliant/violated/not-applicable assessment.
- Run the repo's linters first and record every overlapping candidate as `linter-overlap` rather than reporting it again.
- Cite rubric rules verbatim with their source path; severity comes from the taxonomy, never inflated.
- Publishing needs `--publish` or the user's explicit go-ahead in this session; otherwise the review stays local. **This repo is on GitHub**, so `--pr` and `--publish` both apply — they need an authenticated `gh`. Resolve `owner/repo` from the checkout (`gh repo view --json nameWithOwner --jq .nameWithOwner`), never from memory. Default branch is `main`.
- Every review ends with a **SHIP / FIX_BEFORE_SHIP / REWORK** verdict derived by render_review.py and stated only after that script exits 0.
- Step 3 runs on the `native` runtime; `--subagent` is unavailable in this repo (see "CraftHub: runtime, rubric sources, priorities, and artifacts").
- Run `npm run build:schemas` before any lane that type-checks. A fresh tree fails against a missing `packages/schemas/dist/` for reasons unrelated to the diff, and that failure is `unavailable`, not a wall of findings.

## Procedure

**Step 1: Funnel — build the manifest**

1. Run the bundled manifest builder (bootstrap helper; reads the repo and `gh`, writes only under `--out`):

   ```bash
   python3 <skill-dir>/scripts/build_manifest.py --out <out> \
     [--pr N | --base REF | --staged | --worktree] [--files p1,p2] [--full]
   ```

   It resolves repo path filters, detects generated / trivial / renamed files, scopes to the incremental delta when prior state exists, and pins the source-freeze snapshot.
2. Read the printed summary. On `--pr`, the script errors with the exact `git fetch` command when the head SHA is absent — run it and retry.

*Done when:* `<out>/manifest.json` exists, every changed file is accounted for as selected, ignored(reason), or skipped(reason), and every selected file carries its hunk list (the units of judgment and the publish anchors).

**Step 2: Knowledge + plan — project rules, cohorts, walkthrough**

1. STOP. Read `<skill-dir>/references/context-pack.md` and `<skill-dir>/references/taxonomy.md` in full before extracting rules or defining reviewer lanes. Run the bootstrap helper (reads the repo, writes only under `<out>`):

   ```bash
   python3 <skill-dir>/scripts/build_knowledge.py --out <out>
   ```

   Read every source left pending in `<out>/rules.template.json` in full, including direct references of selected project skills. Write `<out>/rules.json` with every source marked applied or not-applicable (reason required), then extract verdict-bearing rules verbatim with scope globs. Assemble `<out>/context-pack.md` and run/fold the detected linter lanes.
2. Read `<skill-dir>/references/orchestration.md` (cohort rules, sweep triggers) and `<skill-dir>/references/output-contracts.md` (walkthrough anatomy, effort scale) in full. Write `<out>/plan.json` — cohorts of up to `<max-cohort-files>` files (default 100) / ~6,000 changed lines plus any sweep whose trigger fires — and `<out>/walkthrough.md`.
3. Run the bootstrap plan gate (reads repo artifacts, writes only under `<out>`):

   ```bash
   python3 <skill-dir>/scripts/build_jobs.py --out <out> \
     [--max-cohort-files N]
   ```

   It rejects incomplete source accounting, proves defect ownership, derives smaller polish cohorts (≤20 files / 1,200 changed lines), injects bound rules into every lane and sweep, and materializes `<out>/jobs.json`.

*Done when:* build_jobs.py exits 0, every discovered source has an audited decision in rules.json, context-pack.md lists applied source/rule and linter outcomes without copying the full registry, and walkthrough.md satisfies its contract.

**Step 3: Fan-out — parallel review**

Execute `<out>/jobs.json` with the mutating runner and engine contract loaded in Step 2. In this repo the runtime is always `native` — `compozy` is not installed, so `references/subagent-runtimes.md` does not apply (read it only if `command -v compozy` starts returning a path). Completion is engine-independent — re-dispatch whatever is listed as pending/invalid until exit 0:

```bash
python3 <skill-dir>/scripts/run_jobs.py --out <out> --validate-only
```

*Done when:* run_jobs.py `--validate-only` exits 0 — every defect, polish, and sweep output matches the schema and completely accounts for assigned hunks and rules.

**Step 4: Merge + report**

Run the bootstrap merger, mutating state/report renderer, and bootstrap HTML hydrator:

```bash
python3 <skill-dir>/scripts/merge_findings.py --out <out>
python3 <skill-dir>/scripts/render_review.py --out <out> [--rework "<structural rationale>"]
python3 <skill-dir>/scripts/render_html.py --out <out>
```

merge_findings.py emits `<out>/findings.json` plus `<out>/review-stats.json`, deduplicates both result classes, reconciles rounds, and fails unless every selected hunk line has defect and polish coverage. render_review.py derives the verdict from defects only. render_html.py shows defects, advisories, suppressions, and coverage separately in `<out>/review.html`.

When ReportFindings is available, report defects first and every advisory afterward. The user-facing summary states the verdict, defect/advisory counts, every Critical/Major defect, coverage status, and artifact paths.

*Done when:* render_review.py and render_html.py exit 0 and the final message states the verdict, every Critical and Major defect, and the review.html path.

**Step 5: Publish (only with `--publish`)**

1. Read `<skill-dir>/references/publish-github.md` in full and execute its recipes: upsert the walkthrough, publish every anchorable in-diff defect and advisory inline, keep only unanchorable/outside-diff results in the body, and edit resolved prior-round comments.

*Done when:* the PR shows the updated walkthrough and the new review, and both URLs are cited in the final message.

**Step 6: Learnings**

1. state.json was already written at Step 4. When the user — or a PR reply — rebuts or dismisses a result, read `<skill-dir>/references/state-and-learnings.md` in full, distill the correction into `.deep-review/learnings.md`, and mark that fingerprint `dismissed` in the state ledger.

*Done when:* every user correction from the session is captured as a learning or explicitly declined.

## Incremental rounds

With prior state (or fingerprints recovered from the PR thread), Step 1 scopes to commits since the last reviewed head and archives the prior round's artifacts under `<out>/rounds/`. Unresolved prior results re-surface once under Duplicates; dismissed fingerprints stay suppressed; resolved ones receive the ✅ edit in publish mode. `--full` reviews the whole diff again. Each round's Step 4 regenerates `<out>/review.html`, so a browser tab left open on it tracks the rounds by itself.

## Error handling

- `--pr` or `--publish` without a passing `gh auth status` → stop and name the gap; publishing by any other transport is out of scope. Run a local scope (`--base`, `--staged`, `--worktree`) instead, or have the user authenticate `gh` and retry.
- Workflow tool unavailable → automatic Agent fallback; record the mode in walkthrough.md's Review details.
- `--subagent` passed in this repo → stop and say so: `compozy` is not installed, `native` is the only runtime. Do not silently ignore the flag.
- Empty selection after the funnel → report "nothing reviewable" with the manifest counts; write no findings.
- A linter lane unavailable → proceed and state in review.md that overlap suppression did not run for that lane.
- A bootstrap gate failing (build_manifest.py, build_knowledge.py, build_jobs.py, merge_findings.py) → stop and surface stderr. Missing knowledge accounting or incomplete defect/polish coverage is a review failure, not a warning.
- run_jobs.py exit 2 (blocked) → a provider limit interrupted the fan-out; valid outputs are preserved and `<out>/run-blocker.json` lists the pending jobs — resume by re-running the same command once the limit clears. Providers that signal limits differently need extra `--block-on` patterns.
- run_jobs.py exit 3 or a render_review freeze failure → the checkout drifted mid-round; findings would anchor to stale lines. Restart from Step 1 — the round increments and prior artifacts are archived.
- More than 75 publishable results → use the Step 5 batching contract.

## Bundled implementation

`assets/PROMPT.md`, `assets/findings.schema.json`, and `assets/REVIEW_UI.html` are author-tooling sources consumed by the bundled scripts; agents use their rendered prompt/schema/report artifacts rather than loading these assets directly. `<skill-dir>/scripts/_common.py` is a read-only library imported by the CLIs and is never invoked directly.
