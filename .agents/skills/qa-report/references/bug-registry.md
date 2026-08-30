# Bug Registry

`<qa-docs-path>/bugs/` is the global, durable bug registry. Bugs outlive the QA rounds that found them — a bug's history (found, fixed, regressed, re-found) is diagnostic knowledge the project keeps forever, keyed by one stable id. This file is the canonical severity model for both `qa-report` and `qa-execution`.

## Contents

- Id minting
- Dedup before filing
- Bug statuses
- The five user-impact tiers (canonical severity model)
- Disclosure leaks: the standing severity floor
- Mapping to technical severity
- Required fields
- CraftHub: the GitHub issue
- CraftHub: Root Cause — the fixed taxonomy
- Anti-patterns

## Id minting

- Ids are `BUG-<YYYYMMDD>-<slug>` — the date the bug was found plus 2-5 kebab-case words naming the symptom from the user's side (e.g. `BUG-20260711-agent-named-employer-on-public-profile`). Global and stable for the life of the project; the date prefix keeps the registry chronologically sorted.
- The id is **content-addressed** — minted from the symptom, never from a counter. Nothing reads "the highest existing number", so parallel branches cannot collide on minting; two branches filing the same symptom on the same day mint the same id, and that add/add merge conflict *is* the dedup step surfacing itself — fold the two files into one.
- Ids never reset per round, per area, or per release, and are never renamed after filing — even when the symptom's understanding evolves; the title line carries the current wording.
- Adopted bugs keep unique legacy ids as-is (grandfathered — the format governs new minting only); only bugs from colliding per-round registries get fresh ids, dated by original discovery when known, with an `Origin:` field pointing at the old artifact and the old id recorded as an alias, never reused.

## Dedup before filing

Before minting, search the registry for the symptom:

1. Grep `<qa-docs-path>/bugs/` for the observable (error copy, journey step, affected element).
2. Check the affected scenario file's `bug_ids` — a scenario that failed before likely links the prior bug.
3. **Same symptom, bug not `verified`** → update the existing file (append a `## Re-found` section with date, persona, report path). Re-finding is signal about persistence, not a new bug.
4. **Same symptom, bug `verified` (fix confirmed)** → the bug regressed: reopen it (status back to `open`, append a `## Regressed` section). A regression on the same id is far more informative than a fresh id.
5. Only mint a new id when the symptom is genuinely new.

One CraftHub-specific dedup trap: **"a surface is unreadable in dark mode" is not one bug.** Each surface authored without its `dark:` variants is its own symptom on its own route, and folding six of them into one id destroys the signal that a *pattern* exists. File them separately and, if the pattern repeats across cycles, raise it as an automation-backlog entry (a theme scenario walk) rather than as a mega-bug.

## Bug statuses

| Status | Meaning |
|---|---|
| `open` | Filed; no fix applied |
| `fixed` | Fix applied (commit SHA recorded); not yet re-verified under the original persona/journey |
| `verified` | Re-walked under the original persona/journey; observable confirmed fixed |
| `wont-fix` | Consciously declined with recorded reasoning (usually a human decision) |
| `invalid` | Not a product bug (session-runner error, environment artifact) — kept for the record, reasoning required |

The status lives in the bug file's header and is mirrored into the linked scenario files via `fix_status`/`retest_status`.

Two things that are **never** `invalid`: a stall caused by the docker stack being down is an environment artifact and should be re-walked rather than filed at all; and a leak produced by feeding the agent persona knowledge its tools never returned is a *fidelity violation*, which invalidates the verdict, not the product — record it in the report's fidelity note and re-run clean.

## The five user-impact tiers

Classify by what the bug does to a real person, not to the technology. Pick exactly one tier; when in doubt between two, pick the higher.

### Blocks-Completion
- **Definition:** a user on a value-delivering journey cannot complete it — they give up or work around into incorrect state.
- **Examples:** the resume import never finishes and leaves the profile unusable; sign-in fails for valid credentials; a layout arrangement "saves" but is gone on reload; a leaked post cannot be deleted.
- **Release impact:** open Blocks-Completion on a P0 journey blocks the release.

### Data-Loss
- **Definition:** user data (entered, uploaded, configured) is destroyed, corrupted, made inaccessible, **or disclosed** without consent — often without the user noticing.
- **Examples:** an import silently drops a job from the career history; a profile arrangement reverts; **an agent publishes an employer name above the chosen disclosure level.** Disclosure belongs here: the user lost control of their own information, which is the same harm as losing it.
- **Release impact:** always a release blocker. Silent loss is worse than visible failure — users can't recover from what they don't notice, and they cannot un-publish what a stranger already read.

### Trust-Damage
- **Definition:** nothing is technically broken, but the user's confidence erodes — they wonder if the product can be relied on.
- **Examples:** the AI Match % changes between two identical searches with no explanation; the disclosure policy's levels don't mean what the copy says; a "last updated" timestamp in the future; a screen reader announcing the match score as a bare number.
- **Release impact:** several Trust-Damage findings on the same journey block a release even when no single one does.

### Friction
- **Definition:** the journey completes, but with extra effort, confusion, or repetition.
- **Examples:** re-pasting a job description because the field cleared; hover-only controls on touch; three seconds of silence before button feedback; a review queue that gives no hint which posts are new.
- **Release impact:** not individually blocking. Repeated Friction in one area is a redesign signal — track the pattern.

### Cosmetic
- **Definition:** visual/wording issues that affect neither completion nor trust.
- **Examples:** tooltip typo; 2px icon misalignment; off-brand hover color.
- **Release impact:** never blocking; batch into polish work. Cosmetic on the public profile — the surface strangers judge the user by — is at least Friction; re-classify. **A dark-mode surface that is unreadable is never Cosmetic** — a reader who cannot read it did not complete the journey.

## Disclosure leaks: the standing severity floor

Because this is the product's defining risk, the tier is not a judgment call:

| Situation | Minimum tier |
|---|---|
| An agent published something above the chosen disclosure level, anywhere a reader can reach it | **Data-Loss** |
| ...and the product offers no way to remove or correct it | **Blocks-Completion** |
| Redaction holds in the UI but the API payload serves the unredacted body | **Data-Loss** (the payload is reader-reachable) |
| The policy fails open when its tool errors or is unset | **Data-Loss** (it is a leak waiting for the next prompt) |
| The policy's levels are ambiguous enough that a user could choose wrongly | **Trust-Damage** |
| An approved post can be edited into new content without re-review | **Data-Loss** |

Never file one of these below its floor to keep a release on schedule. If schedule pressure is the real argument, that belongs in the report's Decisions for a Human, with the tier intact.

## Mapping to technical severity

Keep the `Severity`/`Priority` fields for tooling continuity:

| Impact tier | Default Severity | Default Priority | Override when… |
|---|---|---|---|
| Blocks-Completion | Critical | P0 | Blocked journey is low-priority → High |
| Data-Loss | Critical | P0 | Data reproducible from another source → High (**never** for a disclosure leak: it is not reproducible-away, it is already read) |
| Trust-Damage | High | P1 | Auto-corrected without user effort → Medium |
| Friction | Medium | P2 | Friction sits on a P0 journey → High |
| Cosmetic | Low | P3 | On the public profile or onboarding → Medium |

User-impact totals drive the release go/no-go conversation; severity totals drive engineering triage.

## Required fields

Every bug file (template: `<qa-docs-path>/templates/bug.md`, seed: `assets/bug-template.md`) carries:

- `Impact (user-side):` — one of the five tiers.
- `Persona Affected:` + `Journey Step:` — who is hurt, and when. These two fields let a product owner read the queue without opening the bug.
- `Theme:` — `light` / `dark` / `both`, for anything visual. A visual bug without this field costs the fixer a reproduction attempt.
- `Reproduction:` — exact steps from the persona's entry point, with the charter id (`CH-<slug>`) and tour named.
- `Evidence:` — screenshot/report paths proving the observable. For a disclosure leak, the four-part evidence set from the layout reference's evidence policy.
- `Scenarios:` — the scenario ids this bug affects (kept in sync with their `bug_ids`).
- After a fix: `Fix commit:` (SHA) and `Regression test:` (the vitest test that failed before and passes after — or the documented replay and the stated reason no automated test is meaningful).
- **Required here:** `GitHub:` (the issue link) and — once the bug is closed — `Root Cause:` (one value from the fixed taxonomy). Both sections below.

## CraftHub: the GitHub issue

The registry id and the GitHub issue number are **two different identities and both are kept**:

| | Registry id (`BUG-<YYYYMMDD>-<slug>`) | GitHub issue (`#<n>`) |
|---|---|---|
| Minted by | this skill, from the symptom | GitHub, when the work is scheduled |
| Purpose | the durable QA history: found, re-found, regressed, verified | the engineering ticket: assignee, milestone, branch, PR |
| Lifetime | forever, never renamed | the ticket's |

Rules:

- Every registry bug that reaches engineering gets an issue, filed with the `gh` CLI:
  ```bash
  gh issue create --title "<user-first title>" --body-file <path to the bug file or a summary>
  ```
  Read `git remote -v` for the repository rather than hardcoding it; at the time of writing it is `https://github.com/gabrikf/Link-hub-v1`, default branch `main`.
- The issue link goes in the bug file's `GitHub:` field. The reverse link matters as much: the issue body cites the registry id and the report path, so an engineer landing on the ticket can read the walk that found it.
- **Branches come from the issue**, not from the registry id: `fix/<issue-number>-<summary-slug>` off `main`, and the PR closes the issue. A registry id in a branch name breaks the issue↔PR link.
- A bug that never becomes an issue (Cosmetic batched into polish, or `wont-fix`) leaves `GitHub:` empty with the reason recorded. An empty field with no reason is a gap.
- **Never put the leaked content in a public issue.** A disclosure bug's issue describes the *mechanism* ("a blocked term written in camel case passes the filter") and points at the registry file and evidence paths for the actual string. Filing the leak into a public tracker re-publishes it.

## CraftHub: Root Cause — the fixed taxonomy

The user-impact tier says *how much it hurt*. **Root Cause says where the bug was born** — and it is what makes month-over-month analysis possible instead of anecdotal.

Pick **exactly one**. The taxonomy is fixed — inventing a new value destroys the comparison it exists for:

| Root Cause | The bug was born in… |
|---|---|
| `api-contract` | the response shape changing / not being what the client assumed — the boundary was not parsed through `@repo/schemas` |
| `cache-state` | stale or duplicated state: a TanStack Query cache not invalidated, a Zustand copy of server data, two screens disagreeing about one object |
| `auth-permission` | a session, JWT, API-token or ownership boundary: something shown, hidden, or written for the wrong user |
| `disclosure-policy` | policy enforcement: a filter that missed a spelling, redaction applied at render instead of at storage, a default that failed open, a policy change that didn't reach published content |
| `date-timezone` | date/time handling: wrong timezone, wrong format, an off-by-one day, a range that excludes its own edge |
| `race-loading` | ordering: a request resolving after another, a loading state never resolving, a double submit, a request loop, a model read before it finished loading |
| `null-data` | absent data read as if present — the empty state that was never handled |
| `layout-responsive` | layout at a viewport nobody checked; overflow, overlap, an unreachable control |
| `dark-mode` | a surface authored without its `dark:` variants, a hardcoded color where a token belongs, a theme that doesn't persist or flashes |
| `search-ranking` | embedding, pgvector query or the in-browser re-rank producing a wrong, unstable or meaningless AI Match % |
| `regression` | a previously working behavior broken by an unrelated change — no test protected it |
| `third-party` | an external service or library: OpenAI, Google OAuth, GitHub, a dependency's behavior change |

Recording it, at close time:

1. In the **bug file**, as `Root Cause: <value>` inside the `## Fix` section.
2. In the **GitHub issue**, in the closing comment as `Root cause: <value>` (or a label, if the repo grows a labelled set).

When torn between two, pick the one describing **where the bug was born**, not where it surfaced: a `null` crash caused by a field the API stopped sending is `api-contract`, not `null-data`; an employer name visible in a post because the redaction runs in the React component rather than before the row is written is `disclosure-policy`, not `api-contract`.

A cycle's report totals Root Cause alongside impact tier — that distribution is the input to the next guardrail decision, and a cycle whose bugs are mostly one cause is telling you where the next sensor belongs. A cycle heavy in `dark-mode` argues for a theme scenario in the visual runner; a cycle heavy in `api-contract` argues for more `@repo/schemas` contract tests.

## Anti-patterns

- **Counter ids** — `BUG-001` restarting each cycle destroys cross-round tracking, and a global monotonic counter makes parallel branches mint the same number and collide on merge. Both are the same mistake: identity from a sequence instead of from the symptom.
- **Duplicate filing** — a re-found symptom filed under a new id splits the history that makes persistent bugs visible.
- **Mega-bugs** — "dark mode is broken" as one id across six surfaces. One symptom, one id.
- **"Critical" inflation** — reserve Critical for actual Blocks-Completion/Data-Loss, or the scale stops meaning anything. Note that disclosure leaks are Critical by rule, not by inflation.
- **Downgrading a leak** — filing a disclosure leak as Trust-Damage because the release is on Friday.
- **Leaking the leak** — pasting the disclosed employer name or blocked term into a public GitHub issue.
- **Technical framing** — "the MCP tool returned 200" is an observation; the bug is "a developer's client name went live on their public profile after they had set the policy to hide it". Lead with the person, cite the technical detail in reproduction.
- **Fix without regression proof** — `fixed` status with no commit SHA and no vitest regression test/replay is a claim, not a fix. In this repo the test comes **first** and is seen failing (`../qa-execution/references/fix-loop.md`).
- **Inventing a Root Cause** — "other", "misc", a new value that fits better. The taxonomy is fixed precisely so cycles can be compared; a custom value silently deletes that bug from the analysis.
- **Using the GitHub issue number as the registry id** — the issue closes and the QA history goes with it. Two identities, both kept.
