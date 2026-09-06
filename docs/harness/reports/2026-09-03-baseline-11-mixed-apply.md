# Mixed apply plan (Track C)

> Run dir: `/home/gabriel/Documents/www/linkhub-v.1/.harness-eval/runs/2026-09-03-baseline`
> Judges: J1 model=`claude-sonnet-5` · J2 model=`claude-sonnet-5`
> **This file is the only Mixed apply input.** Do not re-judge usefulness.

## What these words mean

| Word | Meaning | Apply must |
|------|---------|------------|
| **KEEP** | Text from judge Keep-core columns | Remain in the harness surface as rule/snippet |
| **CUT** | Text from judge Slim columns | Delete or compress only this bulk |
| **Apply** | Mechanical edit | Not a new design pass |

## Hard rules for apply agents

1. For each Mixed ID below, edit **only** that path.
2. **KEEP** items must survive (same contract — concern/module/section/checklist).
   Do not replace a KEEP teaching snippet with a weaker pattern.
3. **CUT** only what both judges' Slim columns describe (or the union when both
   clearly name the same bulk). If KEEP and CUT conflict, **skip that path** (Hold).
4. Never replace a fenced teaching snippet with `See app/...` / `lib/...` / `test/...`.
5. Never defer KEEP content to AGENTS.md or another surface unless CUT explicitly
   names OVERLAP with that path **and** KEEP still retains the behavior contract.
6. Do not open the repo to invent a different convention than KEEP states.
7. After edits: every KEEP bullet must still be satisfied by the file text.

## Paths (7)

### S005 — `.agents/skills/context7-usage/SKILL.md`

- Tier: `T1` · Name: `context7-usage`
- Overall: J1 `MIXED` · J2 `MIXED`

#### KEEP (do not remove or degrade)

- **J1:** KEEP: "HIGHEST RISK" section — `zod/v4` import path, no `tailwind.config.js`, TanStack Router code-based-only — more precise than AGENTS.md's one-line mention (BEHAVIOR-CHANGING)
- **J2:** BEHAVIOR-CHANGING: "HIGHEST RISK" block — Tailwind v4 CSS-first (no `tailwind.config.js` in repo, verified), `zod/v4` import path, Vite 8, code-based TanStack Router — genuinely surprising traps a model gets wrong from memory

#### CUT (only this bulk)

- **J1:** CUT: the exhaustive per-workspace library list and "Anti-patterns this skill exists to prevent" — REPO-DEMONSTRATED (discoverable from each `package.json`) and OVERLAP with the HIGHEST RISK section restating the same three facts
- **J2:** THEORY/REPO-DEMONSTRATED: the long per-workspace "Library list" mostly restates what's already visible in each `package.json`, adding little beyond the HIGHEST RISK section

#### Overlap cites (context only; cut OVERLAP here only if listed under CUT)

- **J1:** `AGENTS.md` (MCP section) already names Tailwind v4/zod4/Vite8/TanStack-code-based
- **J2:** none

---

### S006 — `.agents/skills/deep-review/SKILL.md`

- Tier: `T1` · Name: `deep-review`
- Overall: J1 `MIXED` · J2 `MIXED`

#### KEEP (do not remove or degrade)

- **J1:** KEEP: "CraftHub: runtime..." binding — `compozy` not installed so `--subagent` is unavailable, the six CraftHub review priorities pointer, deliberate-debt classification, exact linter-lane commands (BEHAVIOR-CHANGING, prevents wasted `--subagent` runs)
- **J2:** BEHAVIOR-CHANGING: "CraftHub: runtime/rubric-sources/priorities" section + Hard rules — verified real (`.agents/skills/deep-review/scripts/{build_manifest,build_knowledge,build_jobs,render_review}.py` all exist; six review priorities are concrete and CraftHub-specific)

#### CUT (only this bulk)

- **J1:** CUT: generic Steps 1-4 pipeline/artifact prose (Funnel/Knowledge/Convergence descriptions) — largely ROUTING/THEORY procedure reusable by any repo, detailed further in `references/orchestration.md`
- **J2:** THEORY/OVERLAP: generic multi-stage artifact-pipeline procedure overlaps `references/orchestration.md` (S018) and `references/context-pack.md` (S017). Also contains a confirmed-FALSE claim, "CraftHub has no i18n layer... do not report a missing t() call" — directly contradicted by S002/S008 and by real files (`apps/web/src/i18n/locales/{pt-BR,en-US,es-ES}.json`, react-i18next in use)

#### Overlap cites (context only; cut OVERLAP here only if listed under CUT)

- **J1:** `.agents/skills/deep-review/references/orchestration.md` (pipeline mechanics restated)
- **J2:** `.agents/skills/deep-review/references/orchestration.md`; `.agents/skills/deep-review/references/context-pack.md`

---

### S025 — `.agents/skills/no-workarounds/references/workaround-catalog.md`

- Tier: `T2` · Name: `workaround-catalog.md`
- Overall: J1 `MIXED` · J2 `MIXED`

#### KEEP (do not remove or degrade)

- **J1:** KEEP: W-31–W-36, the CraftHub-specific set named in `no-workarounds/SKILL.md`'s binding table (contract casts, widened zod schemas, docker-skipped tests, swallowed use-case errors, setTimeout race fixes, inline eslint disables) — BEHAVIOR-CHANGING and hard-mandated ("read in full before choosing the fix")
- **J2:** KEEP-CORE: mandated whenever any of the seven signals fires ("read... in full before choosing the fix"); W-31 through W-36 are explicitly CraftHub-specific bindings (contract casts, widened zod schemas, docker-skipped tests, swallowed use-case errors, setTimeout race fixes, inline eslint-disables)

#### CUT (only this bulk)

- **J1:** CUT: W-01–W-30, generic TypeScript/JS workaround patterns (blanket `any`, empty catch, setTimeout hacks) — THEORY, standard patterns demonstrable in any TS codebase
- **J2:** THEORY: W-01 through W-27 are generic TS/JS before/after patterns applicable to any codebase, largely restating the seven-signals table already inline in SKILL.md (S009)

#### Overlap cites (context only; cut OVERLAP here only if listed under CUT)

- **J1:** —
- **J2:** `.agents/skills/no-workarounds/SKILL.md` (seven-signals table covers the same categories)

---

### S041 — `.agents/skills/qa-report/references/session-charters.md`

- Tier: `T2` · Name: `session-charters.md`
- Overall: J1 `MIXED` · J2 `MIXED`

#### KEEP (do not remove or degrade)

- **J1:** KEEP: the two standing charters (`CH-agent-post-disclosure-leak`, `CH-theme-sweep-changed-surface`) and the coverage-inversion principle, both unique to this project's tracker (BEHAVIOR-CHANGING)
- **J2:** BEHAVIOR-CHANGING: two mandatory "standing charters" specific to CraftHub, triggered by real diff paths (`apps/mcp`, `apps/web/src/**`)

#### CUT (only this bulk)

- **J1:** CUT: "Charter modes" taxonomy (charter-with-tour/freestyle/scenario-based/strategy-based/adversarial-agent/collaborative) — generic exploratory-testing methodology, cites external source (TestCollab), reusable by any QA process
- **J2:** THEORY: generic charter-mode catalog (freestyle/strategy-based/collaborative) and time-box guidance are largely generic exploratory-testing doctrine

#### Overlap cites (context only; cut OVERLAP here only if listed under CUT)

- **J1:** —
- **J2:** none

---

### S048 — `.agents/skills/testing-boss/references/ai-writes-tests.md`

- Tier: `T2` · Name: `ai-writes-tests.md`
- Overall: J1 `MIXED` · J2 `MIXED`

#### KEEP (do not remove or degrade)

- **J1:** KEEP: the seven-gates operational checklist itself (Gate 1-7 prompt blocks) — an actionable, structured procedure `testing-boss` explicitly routes to for agent-generated tests
- **J2:** actionable generic gates that do change agent conduct (e.g. "print INVARIANT before test code," failure protocol) — mandated when a coding agent generates tests

#### CUT (only this bulk)

- **J1:** CUT: the "Why" quote-bombing under each gate and the external-citation density (Anthropic/arXiv/Stanford links); one quoted "user's CLAUDE.md" premise does not match this repo's actual `AGENTS.md` text — likely imported boilerplate
- **J2:** THEORY: zero CraftHub-specific content (grep confirmed no repo terms); the CraftHub-bound version of this doctrine already lives directly in testing-boss SKILL.md's own body

#### Overlap cites (context only; cut OVERLAP here only if listed under CUT)

- **J1:** —
- **J2:** `.agents/skills/testing-boss/SKILL.md` (own Iron Laws cover similar ground)

---

### S049 — `.agents/skills/testing-boss/references/antipatterns.md`

- Tier: `T2` · Name: `antipatterns.md`
- Overall: J1 `MIXED` · J2 `MIXED`

#### KEEP (do not remove or degrade)

- **J1:** KEEP: "Top seven" quick-reference list and Family E (AI-specific anti-patterns: mock-driven confidence, assertion roulette) — more novel/actionable for agent-authored tests
- **J2:** top-7 antipattern list functions as an actionable checklist, mandated for two scenarios (agent-written tests, brittle-suite review)

#### CUT (only this bulk)

- **J1:** CUT: the 25-entry detailed catalog (Families A-D) — generic brittleness/flakiness/mock-misuse patterns sourced entirely from Cypress docs, Fowler, Microsoft docs; well-known general testing knowledge
- **J2:** THEORY: ~27K chars, 25 entries, effectively 100% external quotes/URLs, zero repo binding (grep confirmed) — the largest, most generic file in the deck

#### Overlap cites (context only; cut OVERLAP here only if listed under CUT)

- **J1:** —
- **J2:** none named, but functionally redundant with general testing knowledge

---

### S053 — `.agents/skills/testing-boss/references/patterns.md`

- Tier: `T2` · Name: `patterns.md`
- Overall: J1 `MIXED` · J2 `MIXED`

#### KEEP (do not remove or degrade)

- **J1:** KEEP: the "CraftHub binding" closing section (per file outline) applying the twelve patterns concretely to this repo — BEHAVIOR-CHANGING
- **J2:** KEEP-CORE: dedicated "CraftHub binding" section maps all patterns to concrete repo mechanisms (`build-test-app.ts` fresh-app-per-file, `*-test-factory.ts` files, `scripts/visual/scenarios/*.scenario.mjs` for the page-object pattern)

#### CUT (only this bulk)

- **J1:** CUT: the twelve generic cross-framework patterns themselves (query-by-behavior, selector hierarchy, wait-on-conditions) — sourced from Playwright/Testing-Library/Cypress/Go docs, standard testing-library guidance
- **J2:** THEORY: the cross-framework evidence sections (Playwright/Cypress/Testing-Library quotes) preceding the binding section are large and generic

#### Overlap cites (context only; cut OVERLAP here only if listed under CUT)

- **J1:** —
- **J2:** none

---

