# BUG-<YYYYMMDD>-<slug>: <one-line title, user-first>

- **Status:** open <!-- open | fixed | verified | wont-fix | invalid -->
- **Impact (user-side):** <Blocks-Completion | Data-Loss | Trust-Damage | Friction | Cosmetic>
- **Severity:** <Critical | High | Medium | Low> · **Priority:** <P0 | P1 | P2 | P3>
- **Persona Affected:** <persona name>
- **Journey Step:** <J-<slug> name>, step <N>
- **Theme:** <light | dark | both | n/a>
- **Scenarios:** <scenario ids, semicolon-separated>
- **Found:** <YYYY-MM-DD> · **Report:** <path to the run report>
- **GitHub:** <#nnn — link> <!-- or: none — <reason> -->
- **Origin:** <only for migrated bugs — path of the pre-registry artifact>

## Summary

<What the user experienced, in user language. Lead with the person, not the stack trace.>

## Reproduction

- **Charter:** CH-<slug> · **Tour:** <tour name>
- **Environment:** <device / viewport / network / theme, per the persona row> · <web http://localhost:5173 · api http://localhost:3333> · <seed account used>

1. <exact step from the persona's entry point>
2. <...>

**Expected:** <the observable the flow promises>
**Actual:** <what happened instead>

## Evidence

- <screenshot / log path — theme in the filename>
- <independent read path check — what a fresh load / a second surface / a logged-out read showed>

<!-- For a disclosure leak, all four of these are required:
     1. the settings screen at the policy level that was set
     2. the agent's exact tool call and the response it got
     3. the post as rendered on the LOGGED-OUT public profile
     4. the raw API payload for that same post
     Do NOT paste the leaked employer name or blocked term into a public GitHub issue —
     describe the mechanism there and keep the string here. -->

## Fix

<!-- filled when status moves to fixed -->
- **Root cause:** <symptom vs cause, stated separately>
- **Root Cause (taxonomy):** <api-contract | cache-state | auth-permission | disclosure-policy | date-timezone | race-loading | null-data | layout-responsive | dark-mode | search-ranking | regression | third-party> <!-- exactly one; mirror into the GitHub issue's closing comment -->
- **Fix commit:** <short SHA>
- **Regression test:** <test path — vitest, written FIRST, seen failing for the right reason, passes after> <!-- or: documented replay + why no automated test is meaningful + the automation-backlog entry -->
- **Gate:** <result of `npm run build:schemas && node scripts/guardrails/pre-push.mjs` after the fix>

## Verification

<!-- filled when status moves to verified -->
- **Retested:** <YYYY-MM-DD>, same persona/journey, both themes where visual · **Report:** <path>
- **Result:** <observable confirmed>

<!-- Append `## Re-found (<date>)` or `## Regressed (<date>)` sections instead of filing a new bug for the same symptom. -->
