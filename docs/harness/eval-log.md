# Harness eval log

One entry per `harness-eval` run, with what changed as a result. Full runs live
in `.harness-eval/runs/<id>/`, which is gitignored — a run is a record of one
evaluation, not of the repo.

---

## 2026-09-03-baseline — before the split

**Scope:** Q1 = include `DESIGN.md` and `docs/mcp-servers.md`, exclude the rest
(config, not instruction). Q2 = `B+C`.

**Judges:** `claude-sonnet-5` for all four, recorded in every score file. The
plan called for `claude-opus-5`; the first attempt at that hit a session rate
limit and killed all fourteen judges mid-run, so the whole run was redone on
Sonnet 5 — an allowlisted non-fast model — with the model held constant across
both tracks so the post-run comparison stays meaningful. A separate
`claude-opus-5` pass ran the protocol's second-model pre-delete re-check
(`12-second-model-recheck.md`), which is where a second family is actually
required.

**Deck sharding:** 1,429 claims is more than one judge can score in one answer
without quietly truncating, so the deck was split into six shards with
`scripts/harness/shard-deck.mjs` and each shard scored independently by both
judges. Merge parses score rows with a regex over the whole file, so
concatenating the shards is equivalent to one answer.

### Inventory

| | Count |
|---|---|
| T0 surfaces | 4 (`AGENTS.md`, `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, `.claude/CLAUDE.md`) |
| T1 skills | 11 |
| T2 refs | 43 |
| Atomic claims | 1,429 |

### Track A — correctness

**0 BROKEN**, after the sensor itself was fixed (see below). The unfixed sensor
reported 48, of which every single one was a false positive.

### Track B — redundancy

Trap gate **PASS**. Ship **83** · Review **993** · Hold **353**.

The trap failed on the first merge, and the reason is worth recording: the blind
judge scored all six plants `UNCLEAR` because it checked whether each quote
really appeared in the file the deck named, found it did not, and refused to
classify. That is the judge being more rigorous than the trap design expects —
provenance is Track A's question, not Track B's. The six plants were rescored
against the text itself, per the skill's own troubleshooting entry, and the gate
passed.

The 83 Ship rows are **authorised, not applied**. Ship means "an agent would
rediscover this cheaply", which permits a cut; it does not require one. Phase 2
of the split moved claims and corrected false ones; it did not spend its risk
budget on sentence-level redundancy trimming. The rows remain in
`07-agreement.md` for whoever picks that up.

### Track C — usefulness

Trap gate **PASS** (1 miss, threshold 1). Fan-in blocked: **0**.
Slim **4** · Keep-core **29** · Mixed **7** · Hold **16**.

All three always-on rule files came back Keep-core from Judge1, and the root
came back Hold (judges disagreed), so **nothing in the T0 files was cut on
usefulness grounds** — the split moved them, it did not thin them.

Because both Track C judges ran on the same model, every Slim and Mixed
candidate went through a second-model re-check on `claude-opus-5` before any
deletion. That pass **blocked one of the four Slim rows** (`.claude/CLAUDE.md`,
which is the only record of the symlink layout and is read by
`scripts/harness/claim-ledger.mjs`), confirmed two deletes with named companion
edits, and downgraded a third to Mixed.

### What the eval found that the plan did not anticipate

1. **Four skills asserted that CraftHub has no i18n layer** and instructed
   agents to suppress `t()` findings — on a repo that ships three locales and
   gates them on every push. Both same-model judges and the second-model
   re-check flagged it independently. 23 occurrences across 12 files, all
   corrected. This is the single most valuable finding of the run: an
   instruction to ignore a live guardrail costs more than any redundancy.
2. **Two known-debt items were stale.** `apps/mcp` was recorded as having zero
   tests and a coverage floor of 0; it has seven test files and floors of
   92/96/97/92. The `pluguins/` typo directory does not exist and never appears
   in git history. Both retired, with the retirement recorded so nobody
   re-adds them from an old branch.
3. **`container.ts` was recorded as ~1900 lines.** It is 2,202.
4. **The lint backlog was recorded as 30 errors.** It is 29. The ratchet was
   lowered to match, and the prose now points at `LINT_ERROR_BASELINE` rather
   than repeating a number that had already drifted once.
5. **`DESIGN.md` said the only hex in the codebase lives in `index.css` and
   `brand-logo.tsx`.** The link-icon brand colours and the accent presets moved
   into `lib/link-icons.tsx` and `features/profile/components/profile-theme.ts`.
   Corrected, and the new palette sensor encodes the exception instead of
   leaving it to whoever reads the rule next.
6. **The layer rule was already broken in four `apps/api/src/core/` files.**
   Found the moment it became a check. Recorded in `known-debt.md`; the sensor
   blocks the sixth.

### Sensor fixes made before the sensor was trusted

`harness-eval`'s own Track A reported 48 BROKEN on a harness with zero broken
cites. Fixed in this repo's copy of the skill:

- directory cites (`apps/web`, `.agents/skills`) were checked with `is_file()`
- `lib/...` and `.agents/…` elisions were treated as real paths
- workspace-relative cites (`src/router.tsx` in a file about `apps/web`) were
  only resolved from the repo root
- `npm run` cites were checked against the root manifest only, so every
  workspace script read as missing
- nested `AGENTS.md` were classed as optional docs rather than T0
- nested git worktrees under `.claude/worktrees/` were scanned as if they were
  part of this checkout, inflating the deck from 1,429 claims to 2,391
- `merge_agreement.py` matched claim IDs with `\d{3}`, so every row past C999
  parsed as no score and landed in Hold as "missing-score"

The last one matters most: on a deck this size it would have reported a
truncated run as a cautious one.

---

## 2026-09-04 — the split

What Phase 2 actually did, and what it deliberately did not.

### Sizes

| File | Before | After |
|---|---|---|
| `AGENTS.md` | 220 lines / 10,061 B | 94 lines / ~5,100 B |
| `apps/api/AGENTS.md` | 212 lines / 8,131 B | 173 lines / 8,135 B |
| `apps/web/AGENTS.md` | 166 lines / 6,349 B | 149 lines / ~7,000 B |
| `packages/schemas/AGENTS.md` | — | 68 lines / 2,715 B (new) |
| `.claude/CLAUDE.md` | 21 lines of HTML comment | 19 lines, pointing at `docs/harness/agent-harness.md` |

The root is now an index: identity, the gate, the non-negotiables, an MCP table,
a "where the rest lives" table, and the Output contract verbatim.

### The nested line budget moved from 150 to 200

The split targeted 150 lines per nested file. `apps/api/AGENTS.md` could only
reach it by dropping the list of test files that hang without docker — content
both usefulness judges scored `Keep-core`, and the claim ledger flagged its
removal as a protected cut. Given the choice between an internal target and
content two independent judges said to keep, the target moved to 200, which is
Claude Code's published per-file ceiling and the number with an external basis.

The byte budget did not move. 8 KB per nested file plus 6 KB at the root keeps
every root-to-file chain far under Codex's 32 KiB `project_doc_max_bytes`, which
is the constraint that actually truncates instructions.

### The no-loss proof

`node scripts/harness/claim-ledger.mjs --diff docs/harness/claim-ledger-baseline.json --against .`

Final numbers, against the tree as committed:

| | Claims |
|---|---|
| In the baseline | 1,429 |
| Retained, matched in place | 1,369 |
| Relocated, each verified against a named destination | 17 |
| Deleted because the claim was **false**, each with evidence | 4 |
| Cut | 39 — of which 37 are named by `11-mixed-apply.md`, and 2 are the routing claims of the two files the second model confirmed for deletion |
| **Protected cuts** | **0** |
| **Gate** | **PASS** |

It did not pass first time, and most of the failures were the ledger's own fault
rather than the change's. Recording them because a proof nobody stress-tested is
not a proof:

- **21 protected cuts, all real.** The compressed `apps/api` test-file lists and
  the `S3_REGION` exclusion clause, both `Review` + `Keep-core`. Restored rather
  than argued with. That is why the nested line budget moved instead of the
  content.
- **A tokenizer bug.** Trailing punctuation survived tokenization, so "Redis."
  at the end of a sentence and "Redis" mid-list were different words.
- **The corpus included the ledger's own output.** `claim-ledger-diff.md` prints
  the quote of every cut claim, so a deleted rule could match its own obituary
  and come back RETAINED.
- **Whole-file matching, which a review caught.** The first version scored a
  claim against the token set of an *entire file* and took the best-scoring file
  anywhere in the corpus, so "retained" meant "60% of these words appear
  somewhere in some one file". A root `AGENTS.md` pointer was scoring 0.57
  against `deep-review/SKILL.md`, a file with nothing to do with it. It now
  matches against a sliding 12-line window, and the reported cuts went from 1 to
  60 — the honest number, before the resolutions below explained 21 of them.

Two of those fixes made the number **worse**, not better. That is the point.

### Relocations and corrections, verified rather than asserted

A rule that moved *and* was reworded fails a window match while being perfectly
present, and a claim deleted because it was false is a fix rather than a loss.
Both get an answer in `docs/harness/claim-resolutions.json` — and every answer
is re-checked by the ledger on every run:

- a **relocated** entry must name a file that really contains the text it
  claims;
- a **corrected** entry must name evidence that really exists.

An entry that does not hold up is discarded, the claim goes back to being a cut,
and the gate fails with `bogus_resolutions`. Three of the seventeen relocation
rows were wrong when first written — the check caught all three and named the
file that did not contain what the row promised.

### What the ledger does and does not cover

The claim deck extracts sentence-level claims from **T0 and T1** — the
`AGENTS.md` files and every `SKILL.md` — and exactly **one routing claim per T2
reference file**, which the ledger verifies by checking the path exists rather
than by matching boilerplate. So the ledger is a real no-loss proof for the rule
files and the skill entry points, and it is **not** one for content deleted from
`references/*.md`.

Those trims were protected differently: a dual-judge Mixed verdict, an explicit
per-section KEEP list in `11-mixed-apply.md`, a second-model re-check on a
different family that named what must survive, and an applying agent that
reported back what it removed. That is weaker than the ledger, and it is worth
knowing which one you are relying on. The reports are committed under
`docs/harness/reports/` so the basis for each cut is checkable on a fresh clone.

### What was applied, and what was not

**Applied:** the structural split; the `11-mixed-apply.md` KEEP/CUT plan for the
seven Mixed surfaces; the two Slim deletes the second model confirmed
(`deep-review/references/subagent-runtimes.md`,
`testing-boss/references/sources.md`), each with its companion citer edits; the
size restructure of `spec-implement` and `visual-check` into `references/`; and
every correctness fix listed in the baseline entry.

**Not applied, on purpose:**

- **The 83 Track B `Ship` rows.** Ship means an agent would rediscover the text
  cheaply, which permits a cut and does not require one. Sentence-level
  redundancy trimming across eleven skills is its own change with its own
  review; spending this change's risk budget on it would have obscured the
  split. The rows are in `07-agreement.md`.
- **Two of the four Track C `Slim` rows.** `.claude/CLAUDE.md` was blocked by
  the second-model re-check — it is the only record of the symlink layout and
  the claim ledger reads it. `harness-eval/references/GLOSSARY.md` came back
  MIXED rather than SLIM on the second model, because its "what you should do"
  column is instruction rather than definition.

### Guides promoted to sensors

Five, each verified against a deliberate violation before being wired in:

| Sensor | Replaces | Found on arrival |
|---|---|---|
| `harness-check.mjs` | cite resolution, size budgets, skill frontmatter | the size overruns this change then fixed |
| `design-tokens.mjs` | the banned palette scales, and hex inside a Tailwind class | nothing — the tree was already clean |
| eslint `no-restricted-imports` on `apps/api/src/core/**` | the core/infra layer rule | **7 violations in 4 files** |
| eslint `no-restricted-imports` for `react-icons` | one icon family | 5 files, all legitimate brand marks — encoded as a named exception |
| `router-lazy.test.ts` | every route component is lazy | nothing |

The layer-rule violations are recorded in `docs/harness/known-debt.md`. The gate
lints only changed files, so nothing is red today; the rule blocks the eighth.

What was considered and left in `docs/harness/sensor-backlog.md`, with the rule
text each would replace: the `dark:` counterpart rule, hand-written `SURFACE*`
strings, hex outside a class, and `no-explicit-any` as an error.

---

## 2026-09-04-post — after the split

Same Q1 scope, same judge model (`claude-sonnet-5`) as the baseline, so the two
runs are comparable.

| | Baseline | Post |
|---|---|---|
| T0 surfaces | 4 | 5 (`packages/schemas/AGENTS.md` is new) |
| T1 skills | 11 | 11 |
| T2 refs | 43 | 47 |
| Claims | 1,429 | 1,326 |
| Track A BROKEN | 0 (after the sensor fix) | **0** |
| Track C trap gate | PASS | **PASS** |
| Track C Keep-core | 29 | **35** |
| Track C Slim | 4 | **1** |
| Track C Mixed | 7 | **6** |
| Track C fan-in blocked | 0 | 0 |

**The four known OVERLAPs.** Judge1 confirmed lint debt and Tests guidance are
resolved — lint debt lives only in `docs/harness/known-debt.md` and is
referenced from three files rather than copied into them, and root's Tests
guidance is a short universal principle while the workspace files carry
non-overlapping execution detail. It flagged the four-state rule and the design
primitives as still duplicated.

**Caveat, stated because it matters:** the surface deck both post judges scored
was extracted before those last two were fixed. Root now carries a one-line
mandate plus a pointer for each, and the same treatment was applied to the
contract-first bullet against `packages/schemas/AGENTS.md`, which Judge1 raised
separately. The judges did not see that version. A third run would confirm it;
this entry says so rather than implying they blessed the final text.

**Track B was not re-run.** The baseline's 83 `Ship` rows were never applied, so
a second redundancy pass would measure a dimension this change did not act on.
The 12 sharded judges it would cost buy a comparison number and nothing else.

**What the post run found that was still wrong**, all fixed:

- `qa-report/SKILL.md` and `spec-writer/references/harness.md` still carried the
  "CraftHub has no i18n" claim in phrasings the first sweep's patterns missed
  ("CraftHub has none today", "no translation helper").
- `testing-boss/references/foundations.md` attributed a quote to a
  "CLAUDE.md, MOST_CRITICAL section" that does not exist — a fabricated internal
  citation, the third of its kind found in this change. Replaced with the rule
  stated directly, plus a pointer to where this repo actually says it.
- `container.ts` was still recorded as "~1900 lines" in two skill references.

## The review

A fresh-context reviewer read the whole diff against `develop`. Its findings and
what happened to each:

| Finding | Outcome |
|---|---|
| The no-loss proof did not reproduce; the log claimed PASS the diff file did not show | **Fixed.** The log had been written mid-work. Numbers above are from the final tree, and the ledger is re-run as the last step. |
| `RETAINED` was a much weaker claim than reported — whole-file matching | **Fixed.** Sliding 12-line window, and the reported cuts went from 1 to 60 before resolutions. |
| A **new false claim**: "five files / eight violations" in `src/core` — `update-post.use-case.ts` has no infra import | **Fixed.** It is seven violations across four files. Corrected in `known-debt.md`, `apps/api/AGENTS.md`, `sensor-backlog.md` and here. Exactly the class of error this change existed to remove, introduced by this change. |
| The reports that authorise every cut are gitignored | **Fixed.** The five decision-bearing reports are committed under `docs/harness/reports/`. |
| Forked Track A could miss a dead cite across workspaces (`src/router.tsx` cited from `apps/api`) | **Fixed.** A cite in a file that lives in a workspace now resolves against *that* workspace only. Verified with a fixture; the repo is still 0 BROKEN. |
| `harness-check` misses a bare top-level filename cite | **Not fixed, deliberately.** The harness cites `router.tsx`, `surface.ts` and `tasks.md` as shorthand, and `tailwind.config.js` precisely because it does not exist. All would fail. The reasoning is now a comment in the script. |
| Two `SKILL.md` files sit 2-9 lines under the 500 ceiling | Acknowledged. No headroom, and the check will say so the moment either grows. |
| A concurrent session was editing the tree during the review | That session was this work, still in progress. The ledger was among the files changing, which is why its verdict moved — twice in the direction of *more* reported loss. |
