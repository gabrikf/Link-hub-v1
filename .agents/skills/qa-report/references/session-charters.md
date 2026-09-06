# Session Charters

A charter is a written mission for one QA session: *"for the next 60 minutes, this persona walks this journey through this lens, in these themes."* The charter is the **atomic unit of QA planning** — sessions are what get planned, run, and counted. Test cases don't accumulate; sessions get walked.

> "Exploratory testing is not ad hoc testing. Skilled exploratory testers use charters, time-boxes, and structured note-taking." — TestCollab

## Contents

- Charter anatomy
- Charter file format
- Charter modes
- Cycle planning and cadence tiers
- The standing charters
- The coverage inversion
- The debrief is mandatory
- Anti-patterns

## Charter anatomy

Every charter has seven parts:

1. **Mission** — one sentence: what to investigate and why it matters.
2. **Persona** — who you are while testing (`<qa-docs-path>/personas.md`).
3. **Journey** — which journey (`J-<slug>`) the session walks.
4. **Tour** — the thematic lens driving off-script exploration. The canonical tour catalog lives in the `qa-execution` skill (`../qa-execution/references/tours.md`). Exactly one; mixing dilutes findings.
5. **Themes** — `light`, `dark`, or `both`. For any browser charter the answer is `both` unless a stated reason says otherwise, and that reason goes in the charter.
6. **Time-box** — a hard ceiling: 30 / 60 / 90 minutes.
7. **Scenarios in scope** — the scenario ids this session can settle.

## Charter file format

One file per charter at `<qa-docs-path>/charters/CH-<slug>.md` (template: `<qa-docs-path>/templates/charter.md`, seed: `assets/charter-template.md`). The id is content-addressed like every id in the tree: 2-5 kebab-case words naming the mission (e.g. `CH-agent-post-disclosure-leak`) — two planners writing the same mission mint the same id, which is the dedup working. Charters are durable **and immutable once written**: a charter written for one cycle is re-run in later cycles (smoke/regression cadence), and each run's debrief goes in that run's report — never appended to the charter, so re-runs on parallel branches don't contend over one file. A mission that genuinely changed is a new charter.

## Charter modes

Pick the mode before writing the mission:

- **Charter-with-tour (recommended default)** — mission constrained by one tour. *"As Diego (Power User) in dark mode, run the Multi-Tab Tour through the profile layout editor — two tabs rearranging the same profile must not silently lose one person's work."*
- **Adversarial-agent** — a CraftHub-specific mode. The Autonomous Agent persona is given a realistic, *innocent* task whose honest completion brushes against the disclosure boundary, and the session watches what it publishes. Not a jailbreak attempt: a real agent doing real work is what actually leaks. Use for every Disclosure Tour charter on the MCP surface.
- **Collaborative** — two personas pair on one surface; one drives, one proposes. Use for the agent-plus-human loop: Atlas publishes, Diego reviews, and the session watches the seam between them.

Budget honestly for themes: walking a surface twice is close to twice the time. A 30-minute box that promises both themes across five screens is a 30-minute box that will quietly walk one theme.

## Cycle planning and cadence tiers

A **cycle** is one planned batch of sessions (a branch/PR pass, a release pass, a periodic re-walk). Pick the tier first; the tier picks the journeys:

| Tier | Scope | Sessions | When |
|---|---|---|---|
| **Smoke** | 2-4 highest-value journeys, happy path + true end state | 30-min charters | After any deploy; daily cadence on active work |
| **Targeted** | Journeys touched by the diff + 1 adjacent journey as canary | 30-60-min charters | Every branch/PR with user-visible change |
| **Full** | All P0+P1 journeys, every project persona covered | 60-90-min charters | Release candidates, migrations, big refactors |
| **Sanity** | The fixed journey + 1 adjacent | 30-min charter | After a hotfix |

Order sessions by risk: highest-impact journey × highest-blast-radius tour first — run the fragile combinations while attention is fresh. In this product that ordering is nearly always: disclosure first, then anything that can lose a user's work (layout, import), then search, then the rest.

## The standing charters

Two charters earn a slot in almost every cycle, and it is worth writing them once and re-running them rather than re-deriving them each time:

- **`CH-agent-post-disclosure-leak`** — Adversarial-agent mode, Atlas persona, `J-agent-publishes-post`, Disclosure Tour, 60 minutes. Mandatory whenever the diff touches `apps/mcp`, `apps/extractor`, posts, settings or the public profile. Its must-try list is drawn from the disclosure section of `../qa-execution/references/edge-cases.md`, and its verification always ends on the logged-out public profile plus the API payload behind it.
- **`CH-theme-sweep-changed-surface`** — charter-with-tour, Theme Tour, 60 minutes, on whatever UI the cycle changed. Mandatory whenever the diff touches `apps/web/src/**` or `index.css`. Cheap to run, and it catches the bug class this repo ships most often.

Neither replaces the journey walks; both are additions to the matrix, not substitutes.

## The coverage inversion

The completeness question is **"was every journey in scope walked by a persona this cycle?"** — a session ledger, not a case count.

- Wrong: "every persona has at least one test case", "every tour has a charter". That instinct produces artifact accumulation and zero confidence.
- Right: every in-scope journey has ≥1 charter; every charter has a persona, one tour, named themes, and a time-box; every run charter has a debrief in the run report; every scenario it settles has its verdict updated in its scenario file.

A cycle with 5 deep sessions that walked 5 journeys end-to-end beats a cycle that generated 40 test-case files and walked nothing.

## The debrief is mandatory

A session without a debrief is wasted exploration. When the box ends (written by `qa-execution` into the run report's Session Debriefs section, one block per charter run):

1. Stop the timer — no "just one more thing".
2. Write findings within 5 minutes, before surprises normalize.
3. Record which edge cases were attempted, including the clean ones.
4. File bugs via the global bug registry (routed at Step 6 of the SKILL) — dedup first.
5. Update the settled scenarios' files.
6. Suggest the next charter: what did this session not reach?
7. Note candidate tours: an improvised pattern that found something is a catalog candidate.

## Anti-patterns

- **Drift outside the journey** — interesting bugs elsewhere go to a follow-up charter, not into this debrief's scope.
- **Charter-per-round duplication** — re-drafting the same mission each cycle instead of re-running the existing charter. Charters are durable; debriefs are per-run and live in each run's report.
- **Editing a run charter** — appending debriefs or tweaking the mission in place turns a durable mission into a contended file. Charters are immutable; a changed mission is a new charter.
- **A jailbreak charter instead of an adversarial-agent charter** — trying to trick the agent into leaking measures the prompt, not the product. Give it honest work near the boundary.
- **Case-count completeness** — see the coverage inversion. If the plan's success metric counts files, the plan is wrong.
