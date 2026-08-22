# QA Run Report — <YYYY-MM-DD> — <scope>

- **Scope:** <branch/PR diff summary or cycle name — what user-visible change this run covers>
- **Cadence tier:** <smoke | targeted | full | sanity>
- **Build:** <commit SHA> · **Environment:** <web http://localhost:5173 · api http://localhost:3333 · parity notes>
- **Seed data:** <`bash db-manage.sh seed-all` run at <time> | pre-existing — state which>
- **Started:** <ISO timestamp> · **Status:** in-progress <!-- in-progress | closed -->

## Personas

| Persona | Base | Device / Network / Theme | Sessions |
|---|---|---|---|
| <name> | <seed base> | <profile> | CH-<slug>, ... |

## Flows in Scope

<!-- One entry per journey; link the journey file, embed or reference its Mermaid flow. -->

- `J-<slug>` — <one-line value statement> (`../journeys/J-<slug>.md`)

## Session Matrix & Results

<!-- Created with every row Pending BEFORE the first session. Updated after each session and each fix. -->

| # | Charter | Journey / Scenario | Persona | Tour | Themes walked | Status | Issue | Fix commit |
|---|---|---|---|---|---|---|---|---|
| 1 | CH-<slug> | J-<slug> / <id> | <name> | <tour> | light+dark | Pending | | |

Status legend: `Pending | Pass | Fixed | Skipped | Blocked (needs human verify) | Blocked (human decision)`

## Session Debriefs

<!-- One block per charter run, written within 5 minutes of the box ending. The charter file stays untouched. -->

### CH-<slug> — <persona>

- **Ran:** <started> → <ended> (box respected: yes/no)
- **Themes:** <light | dark | both>
- **Findings:**
  - <finding, with impact-tier rationale>
- **Edge cases attempted:** <which, and clean-or-not — attempted-and-clean is evidence>
- **Bugs filed/updated:** [BUG-<YYYYMMDD>-<slug>, ...]
- **Scenarios settled:** <id → verdict, ...>
- **Paper cuts:** <persona-felt friction, sharpness noted>
- **Surprises:** <unexpected observations>
- **Suggested next charter:** <what this session did not reach>

## Disclosure Findings

<!-- Mandatory section whenever any charter touched posts, settings, the public profile or the MCP surface.
     If nothing was in scope, write "no agent-authored surface in scope this run" — never leave it empty. -->

| Policy level set | What the agent was asked | What it published | Where it was read back | Verdict |
|---|---|---|---|---|
| <level> | <the real, in-persona request> | <the post as stored> | <UI / list_my_posts / public profile / API payload> | clean / **leak** |

## Theme Coverage

<!-- Every browser surface walked, and in which themes. A surface walked in one theme only is named here. -->

| Surface / route | Light | Dark | Notes |
|---|---|---|---|
| `/dashboard/...` | yes | yes | |

## What Was Fixed

<!-- One entry per governed auto-fix. -->

### BUG-<YYYYMMDD>-<slug>: <title>
- **GitHub issue:** <#nnn — link>
- **Symptom:** <user-side observable>
- **Root cause:** <stated separately from the symptom>
- **Root Cause (taxonomy):** <api-contract | cache-state | auth-permission | disclosure-policy | date-timezone | race-loading | null-data | layout-responsive | dark-mode | search-ranking | regression | third-party>
- **Fix:** <commit SHA, one logical fix>
- **Regression test:** <path — vitest, written FIRST, seen failing for the right reason, passes after> <!-- or: documented replay + reason + automation-backlog entry -->
- **Retested:** <impacted journey + adjacent journeys, fresh sessions, both themes>

## Paper Cuts

<!-- Persona-felt friction that no functional check failed. Sharp ones entered the fix loop. -->

| Persona | Where (journey/step) | Felt | Sharpness | Outcome |
|---|---|---|---|---|
| <name> | J-<slug> step <N> | "<persona language>" | sharp/dull | fixed (SHA) / deferred / watching |

## Runtime Errors Observed

<!-- Console/network errors surfaced during walks, even when the flow visually passed.
     The visual scenario runner fails on these, so anything here it did not catch is worth noting twice. -->

- <error> — <where, evidence path, filed as a registry bug or explained>

## Human Verifications Needed

<!-- Legs only a human can complete. Exact instructions; terminal for this run. -->

- [ ] <what to do, from which entry point, what observable confirms it> (row #N)

## Decisions for a Human

<!-- Escalations from the fix-loop governor: what's broken, options with trade-offs, recommendation.
     Every disclosure-semantics question lands here by rule. -->

### <finding title> (BUG-<YYYYMMDD>-<slug>)
- What's broken: <user-side, evidence path>
- Why not auto-fixed: <governor bound it fails>
- Options: 1. <option — trade-off> 2. <option — trade-off>
- Recommendation: <option + reason>

## Learnings

<!-- Patterns worth carrying forward: candidate tours, persona insights, planning gaps found. -->

- <learning>

## Final Status

<!-- Written LAST, after the exit gate. -->

- **Exit gate (`npm run build:schemas && node scripts/guardrails/pre-push.mjs`):** <result, verbatim>
- **Issues by user impact:** Blocks-Completion <N> · Data-Loss <N> · Trust-Damage <N> · Friction <N> · Cosmetic <N>
- **Issues by Root Cause:** <cause: N, ...>
- **Disclosure leaks found:** <N — or "none; <M> disclosure edge cases attempted clean">
- **Coverage:** <journeys walked / in scope; skips disclosed>
- **Theme coverage:** <surfaces walked in both themes / total; gaps named>
- **Parity gaps:** <mocked services, missing OPENAI_API_KEY legs, docker stack state — never omit this line>
- **Not visually verified:** <screens the browser could not reach, and why — never omit this line>
- **Verdict:** <ready | not ready | ready with blocked items> — <one actionable sentence>
