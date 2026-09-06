# Harness Eval: Usefulness Agreement (Track C)

> Run dir: `/home/gabriel/Documents/www/linkhub-v.1/.harness-eval/runs/2026-09-03-baseline`
> Trap gate: PASS (misses=1)
> Fan-in gate: PASS (slim-fanin-blocked=0)
> Judges: J1 model=`claude-sonnet-5` · J2 model=`claude-sonnet-5`
> Bands: Slim = dual SLIM/ROUTING + trap PASS + fan-in PASS; Keep-core = dual KEEP-CORE; Mixed = dual MIXED; Hold = disagree / unclear / missing / slim-fanin-blocked
> **Model-sensitive:** re-judge on a second model before large Slim deletes.
> **Fan-in:** another harness surface hard-loads this path as SoT → Hold, not Slim.
> **Mixed apply:** use `11-mixed-apply.md` only — do not re-judge from this table alone.

## What these words mean

| Word | Meaning | You should |
|------|---------|------------|
| **Keep-core** | Most of the file changes agent behavior | Do **not** slim |
| **Mixed** | Real rules + large theory/examples/overlap | Keep rules; cut bulk — follow `11-mixed-apply.md` |
| **Slim** | Mostly theory / repo-demo / overlap, **and** no other harness surface hard-loads it | Compress or delete body |
| **Hold** | Judges disagreed, unclear, or Slim blocked by fan-in | Do nothing yet (or update consumers first) |
| **Trap PASS** | Planted traps scored correctly | Necessary but not sufficient for Slim |
| **Fan-in blocked** | Another harness file mandates loading this path / treats it as SoT | Do **not** stub/delete until consumers are updated |

This track answers: *does deleting this change agent behavior?* Not the same as redundancy (`07-agreement.md`).

## Executive summary

- Real surfaces scored: 56
- Slim: **4**
- Keep-core: **29**
- Mixed: **7** → apply plan: `11-mixed-apply.md`
- Hold: **16** (fan-in blocked: 0)
- Trap misses: [{'id': 'S903', 'expected': 'KEEP-CORE', 'got': 'SLIM'}]

## Discrimination (plants)

| ID | Expected family | J2 family |
|----|-----------------|-----------|
| S901 | SLIM | SLIM |
| S902 | SLIM | SLIM |
| S903 | KEEP-CORE | SLIM |

Slim by tier: {'T0': 1, 'T2': 3}
Keep-core by tier: {'T0': 2, 'T1': 5, 'T2': 22}
Mixed by tier: {'T1': 2, 'T2': 5}
Hold by tier: {'T0': 1, 'T1': 4, 'T2': 11}

## Slim (compress / delete body candidates)

| ID | Tier | Name | Path | J1 | J2 |
|----|------|------|------|----|----|
| S001 | T0 | CLAUDE.md | `.claude/CLAUDE.md` | ROUTING-ONLY | ROUTING-ONLY |
| S019 | T2 | subagent-runtimes.md | `.agents/skills/deep-review/references/subagent-runtimes.md` | SLIM | SLIM |
| S021 | T2 | GLOSSARY.md | `.agents/skills/harness-eval/references/GLOSSARY.md` | SLIM | SLIM |
| S054 | T2 | sources.md | `.agents/skills/testing-boss/references/sources.md` | ROUTING-ONLY | ROUTING-ONLY |

## Slim fan-in blocked (do not stub/delete)

Dual SLIM/ROUTING-ONLY, but another harness surface hard-loads the path (load/SoT/extract mandate). Update or drop those consumers before Slim apply.

| ID | Path | Citers |
|----|------|--------|
| — | — | none |

## Keep-core

| ID | Tier | Name | Path | J1 | J2 |
|----|------|------|------|----|----|
| S003 | T0 | AGENTS.md | `apps/api/AGENTS.md` | KEEP-CORE | KEEP-CORE |
| S004 | T0 | AGENTS.md | `apps/web/AGENTS.md` | KEEP-CORE | KEEP-CORE |
| S007 | T1 | harness-eval | `.agents/skills/harness-eval/SKILL.md` | KEEP-CORE | KEEP-CORE |
| S008 | T1 | i18n | `.agents/skills/i18n/SKILL.md` | KEEP-CORE | KEEP-CORE |
| S009 | T1 | no-workarounds | `.agents/skills/no-workarounds/SKILL.md` | KEEP-CORE | KEEP-CORE |
| S014 | T1 | testing-boss | `.agents/skills/testing-boss/SKILL.md` | KEEP-CORE | KEEP-CORE |
| S015 | T1 | visual-check | `.agents/skills/visual-check/SKILL.md` | KEEP-CORE | KEEP-CORE |
| S016 | T2 | PROMPT.md | `.agents/skills/deep-review/assets/PROMPT.md` | KEEP-CORE | KEEP-CORE |
| S017 | T2 | context-pack.md | `.agents/skills/deep-review/references/context-pack.md` | KEEP-CORE | KEEP-CORE |
| S018 | T2 | orchestration.md | `.agents/skills/deep-review/references/orchestration.md` | KEEP-CORE | KEEP-CORE |
| S022 | T2 | PROTOCOL.md | `.agents/skills/harness-eval/references/PROTOCOL.md` | KEEP-CORE | KEEP-CORE |
| S023 | T2 | judge-prompts.md | `.agents/skills/harness-eval/references/judge-prompts.md` | KEEP-CORE | KEEP-CORE |
| S026 | T2 | report-template.md | `.agents/skills/qa-execution/assets/report-template.md` | KEEP-CORE | KEEP-CORE |
| S028 | T2 | fix-loop.md | `.agents/skills/qa-execution/references/fix-loop.md` | KEEP-CORE | KEEP-CORE |
| S030 | T2 | persona-fidelity.md | `.agents/skills/qa-execution/references/persona-fidelity.md` | KEEP-CORE | KEEP-CORE |
| S031 | T2 | session-protocol.md | `.agents/skills/qa-execution/references/session-protocol.md` | KEEP-CORE | KEEP-CORE |
| S032 | T2 | status-and-reporting.md | `.agents/skills/qa-execution/references/status-and-reporting.md` | KEEP-CORE | KEEP-CORE |
| S033 | T2 | tours.md | `.agents/skills/qa-execution/references/tours.md` | KEEP-CORE | KEEP-CORE |
| S034 | T2 | bug-template.md | `.agents/skills/qa-report/assets/bug-template.md` | KEEP-CORE | KEEP-CORE |
| S035 | T2 | charter-template.md | `.agents/skills/qa-report/assets/charter-template.md` | KEEP-CORE | KEEP-CORE |
| S036 | T2 | automation-backlog.md | `.agents/skills/qa-report/references/automation-backlog.md` | KEEP-CORE | KEEP-CORE |
| S037 | T2 | bug-registry.md | `.agents/skills/qa-report/references/bug-registry.md` | KEEP-CORE | KEEP-CORE |
| S040 | T2 | qa-docs-layout.md | `.agents/skills/qa-report/references/qa-docs-layout.md` | KEEP-CORE | KEEP-CORE |
| S042 | T2 | state-schema.md | `.agents/skills/qa-report/references/state-schema.md` | KEEP-CORE | KEEP-CORE |
| S044 | T2 | execution-strategy.md | `.agents/skills/spec-implement/references/execution-strategy.md` | KEEP-CORE | KEEP-CORE |
| S045 | T2 | harness.md | `.agents/skills/spec-writer/references/harness.md` | KEEP-CORE | KEEP-CORE |
| S047 | T2 | spec-template.md | `.agents/skills/spec-writer/references/spec-template.md` | KEEP-CORE | KEEP-CORE |
| S055 | T2 | DESIGN.md | `DESIGN.md` | KEEP-CORE | KEEP-CORE |
| S056 | T2 | mcp-servers.md | `docs/mcp-servers.md` | KEEP-CORE | KEEP-CORE |

## Mixed (keep core, slim examples/theory)

Path list only. **Apply instructions:** `11-mixed-apply.md` (KEEP/CUT per ID).

| ID | Tier | Name | Path | J1 | J2 |
|----|------|------|------|----|----|
| S005 | T1 | context7-usage | `.agents/skills/context7-usage/SKILL.md` | MIXED | MIXED |
| S006 | T1 | deep-review | `.agents/skills/deep-review/SKILL.md` | MIXED | MIXED |
| S025 | T2 | workaround-catalog.md | `.agents/skills/no-workarounds/references/workaround-catalog.md` | MIXED | MIXED |
| S041 | T2 | session-charters.md | `.agents/skills/qa-report/references/session-charters.md` | MIXED | MIXED |
| S048 | T2 | ai-writes-tests.md | `.agents/skills/testing-boss/references/ai-writes-tests.md` | MIXED | MIXED |
| S049 | T2 | antipatterns.md | `.agents/skills/testing-boss/references/antipatterns.md` | MIXED | MIXED |
| S053 | T2 | patterns.md | `.agents/skills/testing-boss/references/patterns.md` | MIXED | MIXED |

## Hold

| ID | Tier | Reason | J1 | J2 | Path |
|----|------|--------|----|----|------|
| S002 | T0 | disagree | KEEP-CORE | MIXED | `AGENTS.md` |
| S010 | T1 | disagree | KEEP-CORE | MIXED | `.agents/skills/qa-execution/SKILL.md` |
| S011 | T1 | disagree | KEEP-CORE | MIXED | `.agents/skills/qa-report/SKILL.md` |
| S012 | T1 | disagree | KEEP-CORE | MIXED | `.agents/skills/spec-implement/SKILL.md` |
| S013 | T1 | disagree | KEEP-CORE | MIXED | `.agents/skills/spec-writer/SKILL.md` |
| S020 | T2 | disagree | MIXED | KEEP-CORE | `.agents/skills/deep-review/references/taxonomy.md` |
| S024 | T2 | disagree | SLIM | MIXED | `.agents/skills/no-workarounds/references/philosophical-foundations.md` |
| S027 | T2 | disagree | KEEP-CORE | MIXED | `.agents/skills/qa-execution/references/edge-cases.md` |
| S029 | T2 | disagree | KEEP-CORE | MIXED | `.agents/skills/qa-execution/references/lenses.md` |
| S038 | T2 | disagree | KEEP-CORE | MIXED | `.agents/skills/qa-report/references/journeys-and-flows.md` |
| S039 | T2 | disagree | KEEP-CORE | MIXED | `.agents/skills/qa-report/references/personas.md` |
| S043 | T2 | disagree | KEEP-CORE | MIXED | `.agents/skills/qa-report/references/taxonomy.md` |
| S046 | T2 | disagree | KEEP-CORE | MIXED | `.agents/skills/spec-writer/references/interview-questions.md` |
| S050 | T2 | disagree | MIXED | SLIM | `.agents/skills/testing-boss/references/ci-automation.md` |
| S051 | T2 | disagree | MIXED | SLIM | `.agents/skills/testing-boss/references/foundations.md` |
| S052 | T2 | disagree | MIXED | SLIM | `.agents/skills/testing-boss/references/llm-eval.md` |

## Action guidance

- **Slim:** compress only after trap PASS **and** fan-in PASS; still human-approve; prefer re-judge on a second model if deleting >30% of a skill.
- **Slim fan-in blocked:** do **not** stub/delete; either keep the checklist body or update every citing harness surface in the same change, then re-merge.
- **Mixed:** open `11-mixed-apply.md` and execute KEEP/CUT per ID only. Do **not** re-judge. Do **not** replace KEEP snippets with `See app/...` or defer KEEP contracts to AGENTS.md. Empty Keep-core/Slim cells → skip that path.
- **Keep-core:** do not slim for usefulness reasons.
- **Hold:** no usefulness trim.
- See `08-usefulness-j1.md` / `09-usefulness-j2.md` for raw score rows.
- Fan-in detail JSON: `slim-fanin.json`.

