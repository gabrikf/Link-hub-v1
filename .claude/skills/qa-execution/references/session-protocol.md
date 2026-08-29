# Session Protocol

How one persona walks one journey and produces evidence someone else can audit. The loop is always: **enter as the persona → act → observe → verify → capture → continue**. The browser is the instrument — it cannot be talked into agreeing, which is exactly why its readings are the proof.

## Contents

- Adopting the persona profile
- The core loop (browser)
- The evidence standard
- Paper cuts
- Session logging
- The agent persona (MCP journeys)
- Browser command surface
- Anti-patterns

## Adopting the persona profile

Before the first interaction, materialize the charter's persona physically:

- **Viewport/device:** resize to the persona's screen — 375×812 for phone-small, 768 for tablet, 1440×900 as the desktop baseline (also verify 1024×768, per `visual-check`). Sessions per profile, not one desktop window for everything. The profile editor (`/dashboard/layout`) mirrors a desktop and a mobile arrangement, so a layout charter walks both explicitly.
- **Theme:** CraftHub themes through a `.dark` class on `<html>`, persisted in `localStorage["crafthub-theme"]` (`@custom-variant dark` in `apps/web/src/index.css`). **Every browser leg is walked in light AND dark.** A surface that lost its `dark:` variant renders dark-on-dark text or a white card in a black page — invisible, not subtle. Record the theme on every screenshot path.
- **Network:** throttle to the persona's reality (slow 3G for the mobile persona) when the tooling allows; otherwise record the gap. The recruiter's TensorFlow.js re-rank runs in the browser — on a slow device that is a perceived-performance surface, not a backend one.
- **Entry:** arrive the way the persona arrives — the auth screen at `/`, the dashboard nav, a public profile link someone pasted into a chat. Never paste an internal URL the persona wouldn't have. `/profile/<username>` is public by design and is the one URL a stranger legitimately arrives at cold.
- **Auth:** the real auth path the persona uses, against seeded accounts (`bash db-manage.sh seed-all`): recruiter `recruiter.seed@crafthub.local`, candidates `seed-<slug>-<NN>`, password `12345678` for all of them. The session lives in `.playwright/auth.json`, seeded by `node scripts/visual/session.mjs login` and reused across sessions *of the same persona only* — never carry the recruiter's session into a candidate's walk, and never the reverse. Cross-persona session bleed is itself one of the bugs these sessions exist to find. A scenario that walks a public surface declares `export const requiresAuth = false` and gets no session at all, which is exactly how a stranger arrives.

## The core loop (browser)

For every journey step:

1. **Snapshot** the interactive state — read the accessibility tree, with a `ref` per element, rather than eyeballing a screenshot.
2. **Act** as the persona would — click, fill, drag, scroll. A recruiter skims the AI Match % column and never opens the layout editor; a developer arranging blocks drags with a mouse and expects the arrangement to survive a reload.
3. **Re-snapshot** — refs go stale after a DOM change; never act on a stale ref. The layout editor (dnd-kit + react-grid-layout) rewrites its DOM on every drop, so this matters more there than anywhere else.
4. **Verify** the step's expected observable within the persona's patience window. Note the time-to-feedback for anything that should feel instant.
5. **Capture** at checkpoints (see evidence standard); log the step verdict (`pass` / `friction` / `fail`).
6. **Branch** where the flow branches: follow the charter's marked branch and abandonment paths, recording what resuming looks like.

Assert on the text or element when content lands late — **never** a fixed timeout. A `sleep` that makes a walk pass is the same defect-hiding move as a `setTimeout` in the product.

**Console and network are part of every step, not an afterthought.** Read the console and the request log as you walk. The bar is: zero console errors and React warnings, no unexpected 4xx/5xx, and no request firing in a loop. Any of those is a finding even when the screen looks right — and the visual scenario runner fails the walk on exactly these, so a scenario that passes it has already cleared the bar.

## The evidence standard

A step or scenario is `Pass` only when ALL of:

1. **The action produced its observable in the UI/CLI/MCP surface** the persona used — visible, in user language.
2. **An independent read path confirms it.** A fresh load, a different surface (the public profile for something edited in the dashboard, the review queue for something an agent posted, `list_my_posts` for something created through MCP), or a second session shows the same state. Optimistic UI is not confirmation, and TanStack Query's cache showing what you just wrote is not an independent read — force a refetch or reload.
3. **It survives refresh and deep-link.** Reload the page; revisit by URL. State that evaporates was never saved. For the layout editor this is the whole point: an arrangement that looks right until F5 is a `Data-Loss` bug, not a cosmetic one.
4. **Evidence is captured**: screenshot at the goal state and at every divergence, in the theme being walked, with paths recorded in the session log.

Route-renders and list-counts are smoke, not proof: "the page loaded" and "there are 3 posts" only count when tied to the specific object this session created. The default assumption for any anomaly is **product bug until disproven** — never "probably my environment" without checking.

Screenshots go to `<qa-docs-path>/evidence/<report-slug>/<charter>-<step>-<theme>.png` — checkpoints and failures only, per the evidence policy of the QA docs layout (owned by the `qa-report` skill).

**The one sanctioned exception to the public-interface rule is a read-only database peek**, and only through the restricted `postgres-mcp` server pointed at the local dev database — to prove a write actually landed under a correlation id after the UI already claimed it did. It **corroborates** a UI observable; it never replaces one, and it never substitutes for the fresh-load check. Anything beyond a read on the local dev database is a fidelity violation.

## Paper cuts

Paper cuts are the second judgment of every session: friction too small to fail a functional check but real enough to degrade the experience. The functional walk answers "does it work?"; the paper-cut hunt answers "would this persona come back?"

- Capture in the persona's words: *"I couldn't tell whether the agent's post was already live or waiting for me"*, not *"review-queue badge lacks a state distinction"*.
- Rate each: **sharp** (the persona would complain or hesitate to return) or **dull** (noticed, shrugged off).
- Sharp paper cuts enter the fix loop as findings (usually `Friction` or `Trust-Damage` tier); dull ones go to the report's Paper Cuts section for pattern-watching.
- Paper cuts are a lens, not a second instrument: the same mind re-reading its own walk. Trust the browser's readings over the persona's feelings when they disagree — and record both.

## Session logging

Log every session as it runs (this feeds the session debrief in the report):

```yaml
- charter: CH-<slug>
  journey: J-<slug>
  persona: <name>
  entry: <how the session entered>
  theme: light | dark | both
  steps:
    - step: 1
      attempted: <verb>
      observed: <what actually happened>
      evidence: <path, when captured>
      time_to_feedback_s: <observed, when relevant>
      verdict: pass | friction | fail
  goal_reached: yes | no | partial
  true_end_state: confirmed | not-confirmed | blocked (<why>)
  abandonment_paths: [<which were followed, outcome>]
  paper_cuts:
    - felt: "<persona language>"
      sharpness: sharp | dull
  bugs: [BUG-<YYYYMMDD>-<slug>]
  scenarios_settled: {<id>: <qa_status>}
```

## The agent persona (MCP journeys)

The coding agent that publishes posts is a first-class persona, and it does not use a browser. It walks through the `crafthub` MCP server (`apps/mcp`, stdio, a thin HTTP client over the API) with exactly the tools a real agent is given:

| Loop step | Tool |
|---|---|
| Learn what it is allowed to say | `get_disclosure_policy` |
| Learn what it has been working on | `get_work_context` |
| Publish | `create_post`, `create_commit_summary_post` |
| Amend / withdraw | `update_post`, `delete_post` |
| Independent read path | `list_my_posts` |

Rules that make an agent session real:

- **Its API token is the persona's token.** Never a token minted for a different user, never a direct call to `http://localhost:3333` with credentials the agent wouldn't have. If a leg needs an API token, mint it the way a developer does: `/dashboard/settings`.
- **It only knows what the tools told it.** An agent that "happens to know" the employer name because the session runner read the seed data is not the agent — it is the runner. Feed it only what `get_work_context` returned.
- **Its true end state is human-side.** An agent's post is not verified when `create_post` returns success. It is verified in `/dashboard/posts/review` and, once approved, on the public profile — read in a logged-out browser, which is the surface a stranger actually sees.
- **The extractor** (`apps/extractor`, the CLI and Claude Code hook that turns local git history into hashed activity) is walked with its real CLI verbs against a real local repository, never with hand-written fixture JSON.
- `apps/mcp` has **zero tests** — that is known, deliberate debt and not a finding. What *is* a finding is any behavior difference between what the MCP tool reports and what the human sees.

## Browser command surface (via the `visual-check` skill)

The driver in this repo is the **`visual-check`** skill against the app served by `npm run dev:web` at **http://localhost:5173**, talking to `npm run dev:api` on **3333**. Load it before the first session; it owns the driving conventions and this table is the mapping from the loop above onto them.

Its default shape is a **scenario script**, not a chat with the browser: one file under `scripts/visual/scenarios/` describing every state, viewport and theme, executed in one process.

```bash
node scripts/visual/run.mjs scripts/visual/scenarios/<name>.scenario.mjs   # add --headed for a human
node scripts/visual/session.mjs login    # seed .playwright/auth.json first
node scripts/visual/session.mjs check    # confirm the stored session is still valid
```

One browser launch walks every state of a screen — loading, empty, error, filled — and fails on console errors, uncaught exceptions and 4xx/5xx that were not deliberately mocked. That failure mode is why a scenario is worth writing: it re-walks the journey later without a human present.

Exploratory legs are the exception, not the default. A first pass at an unfamiliar surface genuinely branches on what the last action showed; **the moment the journey is known** (a regression pass, the same flow across personas, themes or viewports), it becomes a scenario.

| Loop step | In a scenario | Notes |
|---|---|---|
| Navigate | `goto(path)` | `/`, `/dashboard`, `/dashboard/search`, `/dashboard/layout`, `/dashboard/posts`, `/dashboard/posts/review`, `/dashboard/settings`, `/profile/<username>` |
| Snapshot interactive state | read the accessibility tree | prefer it over a screenshot for verifying text and structure |
| Act | `page.click` / `type` / `fill` / `press` / `hover` / drag / upload | |
| Wait | `assert` on the text or element that should appear | never a fixed timeout |
| Force a state | `mock(glob, { body })`, `{ status: 500 }`, `{ delay: Infinity }`, `unmock()` | use it to *reach* loading/empty/error, never to fake the state under test |
| Evidence | `shot(name)` → `.visual/` | copy checkpoints into the run's evidence dir with the theme in the filename |
| Diagnostics | the run's console/network gate | read it every step, not only at the end |
| Persona device | `resize(w, h)` | 375×812 phone-small, 768 tablet, 1440×900 desktop baseline, 1024×768 also |
| Theme | toggle as the product does — its own control or `localStorage["crafthub-theme"]` | both themes, every visual leg |
| A stranger's view | `export const requiresAuth = false` | no session at all, which is how the public profile is really read |

**A walked flow worth protecting graduates into a committed test.** The locators used in a session become a `scripts/visual/scenarios/<name>.scenario.mjs` walk, or a **vitest** + `@testing-library/react` test beside the component — the screenshot proves today, the test protects tomorrow (`testing-boss` owns how to write it). Tests in this repo are vitest; there is no jest.

## Anti-patterns

- **Verifying from the developer seat** — reading the code or hitting the API with a privileged token to decide a step passed. The independent read path must be one the product exposes to its users. (The read-only local-dev DB peek described above corroborates; it never decides.)
- **Screenshot-everything** — hundreds of images per run bury the ones that matter. Checkpoints and failures.
- **Stale-ref action** — acting on refs from before a DOM change produces phantom results; the drag-and-drop layout editor is where this bites first.
- **One desktop window for every persona** — the Mobile persona in a 1280px window finds no mobile bugs.
- **Light-mode-only walks** — half the theme surface goes unverified, and the `dark:`-variant bug class is exactly what a light-only walk cannot see.
- **Optimistic-UI trust** — "Saved" on screen with no fresh-load check is the most common false pass; a warm TanStack Query cache is the second.
- **Working around a stall** — a hang, a dead button, an infinite spinner is a *finding*. Record it, file it, move on (per the persona-fidelity guardrails, routed together with this file at Step 3).
