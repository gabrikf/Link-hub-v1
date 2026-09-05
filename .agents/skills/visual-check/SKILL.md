---
name: visual-check
description: "Use whenever a task changes anything the user can see in the browser — a dashboard route, the public profile, a shared-component in apps/web/src/shared-components/, a layout, styles, a state (loading/empty/error/filled), or a dark-mode variant. Drives the running web app with a scenario script (one headless run per check, `npm run visual:run`) to take screenshots WHILE implementing, compare them against the target (DESIGN.md, a spec, a reference screenshot, or the pre-change behavior), read console errors and failed requests, and iterate until the rendered UI matches the intent. Triggers: 'check it visually', 'take a screenshot', 'does it look right', 'compare with DESIGN.md', 'dark mode', 'pixel-perfect', 'browser check', 'the profile page looks broken'."
argument-hint: "Route or component to check, plus the target (DESIGN.md rule, spec, or 'must not change')."
---

# Visual Check — see what you built before saying it works

`npm run check-types` green + vitest green **does not** mean the screen is correct. A screen can
compile, pass every unit test, and still be misaligned, overflowing, wrong-colored, blank, invisible
in dark mode, or throwing in the console. This skill closes that gap by looking at the actual
rendered page **during** implementation, not after the PR.

**Core rule: never report a UI task as done from code alone. Look at it.**

The web app is `apps/web` — React 19 + Vite + TanStack Router (code-based, `apps/web/src/router.tsx`)

- TanStack Query + Tailwind v4. What "looks right" means is defined by **`DESIGN.md` at the repo
  root**. Read it before you decide a screenshot is acceptable.

---

## 0. Batch, don't chat with the browser

**The default driver is a scenario script, not a sequence of commands.**

Write the whole check — every state, every viewport, every theme, every mock — as one file under
`scripts/visual/scenarios/`, then run it in a single tool call:

```bash
npm run visual:run -- scripts/visual/scenarios/public-profile.scenario.mjs
```

One process. One browser launch. One session. Every state visited back to back, screenshots written,
console and network gate printed at the end.

**Why this is a rule and not a preference:** one command per tool call pays a full agent round-trip,
process spawn and page-tree dump **per action** — 15–30 times for a six-state check — while a
scenario pays that cost once. The full comparison table and the "iterating = edit and re-run" case
are in `references/scenario-scripting.md`, read it if you need to justify batching to someone or
yourself.

### The performance contract

**A full check of one screen — four states, two themes, the narrow viewport, plus the console/network
gate — completes in one tool call, in seconds, screenshots included.** If a check is taking minutes,
one of three things is true:

1. You are chatting with the browser instead of batching.
2. The Vite dev server is cold and still compiling the route (first run only).
3. **A state is waiting on TanStack Query's retry backoff** — expected app behavior, not harness
   overhead. The exact mechanism (`apps/web/src/lib/query-client.ts`'s `retry` default) and the
   `newUserPage()` workaround for capturing the fast states while a slow one backs off are in
   `references/scenario-scripting.md`.

If you want real numbers for this repo, read them off an actual run's `time` line and quote those —
do not repeat a figure you did not measure.

### What a scenario looks like

`scripts/visual/scenarios/public-profile.scenario.mjs` is the reference — copy it to start a new
check. It is plain Playwright plus a handful of helpers (`page`, `goto`, `shot`, `mock`, `unmock`,
`assert`, `resize`, `newUserPage`, `log`, `collectors`) passed in one context object. The full
worked example and the complete helper-by-helper contract are in
`references/scenario-scripting.md` — read it before writing your first scenario, or whenever you
need the exact signature of a helper.

### `requiresAuth` — declare it, per scenario

```js
export const requiresAuth = true; // default is false
```

Unlike a fully gated corporate app, **crafthub has genuinely public pages**. `/$username`
renders for anonymous visitors and is the reference scenario precisely because it needs no session.
Everything under `/dashboard` does. Declare `requiresAuth = true` there so a dead session fails fast
with guidance instead of producing six screenshots of the auth screen.

Checking a public page **while logged out is a distinct state worth capturing** — a public profile
that only renders for its owner is a real bug. Use `newUserPage({ storageState: undefined })` to see
both in one run.

### Scenario files are scratch, like `.visual/`

Treat `scripts/visual/scenarios/*` as throwaway evidence and write scenarios freely. When one is
worth keeping, either commit it deliberately alongside `public-profile.scenario.mjs`, or — better —
graduate the flow into a committed vitest test (§2.7).

---

## 1. Setup

### The servers

```bash
bash db-manage.sh start        # postgres + redis, if they are not already up
npm run dev:api                # http://localhost:3333  (Swagger at /docs)
npm run dev:web                # http://localhost:5173
```

Both must be running. A web-only run renders the shell and then every panel falls into its error
state, and you end up "verifying" a screen made entirely of error cards.

`VISUAL_APP_URL` overrides the web origin for both the session script and the scenario runner.

### The session — the step people skip for `/dashboard`

```bash
npm run visual:check
```

- session valid → go.
- expired / missing → `npm run visual:login`.

`npm run visual:login` performs a **programmatic** login against `POST http://localhost:3333/auth/login`
and writes a Playwright `storageState` (the `crafthub.auth.tokens` localStorage entry) to
`.playwright/auth.json`. Credentials come from `VISUAL_EMAIL` / `VISUAL_PASSWORD` in the environment,
defaulting to the seeded recruiter (`recruiter.seed@crafthub.local`). Seed first if that user is missing:

```bash
bash db-manage.sh seed-all
```

**Credentials are never written into the repo.** Not in a scenario, not in a script, not in a
committed env file, not in a `fill()` call, not in a Bash command you type. Pass them through the
environment or rely on the seeded defaults. `.playwright/auth.json` is gitignored and holds a token,
not a password.

`npm run visual:run` performs the same validity probe before executing a scenario that declares
`requiresAuth`, and refuses to run with the same guidance — so a dead session fails in seconds
instead of producing a screenshot set of the login page.

### What is already configured — don't re-specify it

`.playwright/cli.config.json` (committed) pins the things every capture must share — viewport,
`storageState`, `outputDir`, headless mode, the origin allowlist, `testIdAttribute`, timeouts — so a
screenshot taken today is comparable with one taken next month. There is exactly one contract; the
runner reads this file. The full setting-by-setting table, and why each value is what it is, is in
`references/scenario-scripting.md` — read it before overriding any of these in a scenario.

`data-testid` is thin on the ground in `apps/web` today (a handful of usages). Prefer role- and
text-based locators — `page.getByRole('button', { name: /save/i })` — which are also the locators the
existing `@testing-library/react` tests use, so they port straight into a graduated test (§2.7).

---

## 2. The loop

Run this per visual task. Do **not** batch it to the end — a wrong assumption caught at the first
screenshot costs one edit; caught at the end it costs a rewrite.

```
TARGET ──→ WRITE SCENARIO ──→ RUN ──→ COMPARE ──→ diffs? ──yes──→ FIX ──┐
                  ↑                      │                              │
                  │                      no                             │
                  │                      ↓                              │
                  └───────────────────  DONE  ←────────────────────────┘
```

### 2.1 TARGET — state what "correct" means, in writing, before capturing

Write down what the screenshot must show. One of:

- the relevant rule in **`DESIGN.md`** (surfaces, spacing, color, the dark-mode requirement),
- a design file or mock under `docs/specs/<feature>/`,
- the acceptance criteria from the spec or the user's prompt,
- **the pre-change screenshot** — when the task must NOT change a screen (shared components: §5).

Without a written target you will look at the screenshot and rationalize whatever you see.

### 2.2 REACH + CAPTURE — one scenario that visits every state

Capture **one screenshot per state that can render differently**, not one per screen — and put all of
them in the same scenario file. The full list of states to check for (loading, empty, error, filled,
dark, logged-out, per-variant, 1024px, dialog/drawer open, hover/focus/disabled, mid-drag) is the
first table in `references/capture-and-compare-checklists.md` — read it before deciding a scenario is
complete.

**Force the states — do not wait for luck.** `mock()` intercepts the network, which is the fastest
way to reach empty/error/loading without touching real data:

```js
await mock("**/profiles/**", { body: { blocks: [] } }); // empty
await mock("**/profiles/**", { status: 500 }); // error
await mock("**/search**", { body: knownPayload }); // a known payload
await mock("**/search**", { delay: Infinity }); // loading — never answers
await unmock(); // back to real data
```

`delay: Infinity` is how the **loading** state is captured: the request stays open, so the route sits
on its pending branch for as long as you need. A finite `delay` (ms) is the same trick when you want
the skeleton and then the data.

**The error state is slower than it looks.** TanStack Query retries a failed request 3× with
exponential backoff before the error branch renders, so the wait for "Try again" legitimately exceeds
the fail-fast default. Override that one wait — `await retry.waitFor({ timeout: 20_000 })` — instead
of raising the default for the whole run.

**`isVisible()` does not mean "in the viewport".** It means "in the DOM with a non-empty box" — an
element 900px below the fold passes it. A green assertion plus a screenshot that does not show the
thing you asserted is evidence of nothing. **Scroll the subject into view before the shot:**

```js
await retry.scrollIntoViewIfNeeded();
await shot("error");
```

This is a real failure mode, not a hypothetical — see `references/capture-and-compare-checklists.md`
for the incident that made it a rule.

**Build mock payloads from the shared schemas.** `@repo/schemas` is the contract package every app
types against. A mock body that does not `.parse()` cleanly through the matching zod schema is
testing a screen against a payload the API will never send. Run `npm run build:schemas` first —
everything types against `dist/`.

**Never mutate real data to reach a state.** Use `mock()`. Do not create, edit or delete rows in the
dev database just to take a screenshot; if you need different data, reseed with
`bash db-manage.sh seed-all`.

Refs are not a thing here: a scenario uses ordinary Playwright locators (`page.getByRole`,
`getByText`, `getByTestId`), which auto-wait and never go stale.

### 2.3 RUN

```bash
npm run visual:run -- scripts/visual/scenarios/my-check.scenario.mjs
```

The run prints one compact summary — assertions, console, network, expected (deliberately-failing-mock)
count, screenshot paths, time, PASS/FAIL — and exits non-zero on any failure. A sample summary block
is in `references/scenario-scripting.md` if you want to see the exact shape before your first run.
Failures, warnings and expected entries are listed in full above the summary block, so one run gives
you the whole picture without a second command.

### 2.4 COMPARE — structured, not "looks fine"

Read the target and the screenshots side by side and fill the comparison table — layout, spacing,
typography, color, surfaces, components, dark mode, states, content/i18n, empty-data rendering — that
is the second table in `references/capture-and-compare-checklists.md`. Vague conclusions hide bugs; a
table forces you to look at each dimension.

For a "must not change" check, diff the accessibility trees instead of squinting at two PNGs — dump
them from inside the scenario:

```js
import { writeFileSync } from "node:fs";
writeFileSync(".visual/before.yml", await page.locator("body").ariaSnapshot());
```

Run the scenario before your change and after it, then `diff` the two files.

Then report **each difference as a concrete line**: _"the section title is 24px in the design and
renders 16px"_, never _"close enough"_. If there is no difference, say so explicitly.

### 2.5 CONSOLE + NETWORK gate — automatic, and still part of "done"

The runner attaches the collectors at launch, so **every run reports the gate whether or not the
scenario asked for it**: console errors and warnings (React key/act/prop-type/deps warnings
included), uncaught page errors, failed requests and every 4xx/5xx.

- **Console errors, bad requests and failed assertions make the run exit non-zero.**
- **Warnings are printed but do not fail the run** — read them. A screen that looks right but logs a
  React warning is not done.
- **Errors you caused on purpose do not fail the run.** While a mock with `status >= 400` (or
  `delay: Infinity`) is active, the 5xx responses and the console errors they produce are the
  capture, not a defect — they are reported under `expected` and counted separately. `unmock()`
  closes that window, so anything after it is a real finding again. Without this, every error-state
  capture would fail its own run and the gate would be worthless.
- **An uncaught exception is never excused**, mock or no mock. A 500 the screen does not survive is
  the white-screen bug of §4 — mocking the 500 is how you find it, not a pardon. `pageerror` always
  fails the run.
- Two more edge cases — a blocked telemetry host, a request duplicated on every render — are covered
  in `references/capture-and-compare-checklists.md`, read it if a run's output looks confusing.

### 2.6 FIX and re-run

Fix the cause, run the **same scenario** again, compare again. Loop until the diff list is empty.
This is the step the batching exists for: a rerun is ~1s of launch plus the page loads, so there is
no excuse to skip it. Keep the final screenshots — they go into the hand-off (§6).

### 2.7 GRADUATE — turn the check into a test

When the flow you just walked is worth protecting (a business rule, a bug that was reported, a shared
component's contract), keep it. A scenario is **evidence**, not a test: nothing runs it in CI, and
nothing fails when someone breaks the screen next month.

- Rendering-shaped assertion → a **vitest + `@testing-library/react`** test next to the component
  (`apps/web/src/**/<name>.test.tsx`). **This is the lower layer and therefore the better one** — it
  runs in `npm run test --workspace=web` and in the pre-push gate.
- Payload-shaped assertion → parse a real captured response through the matching `@repo/schemas`
  module in a test. Contract drift then surfaces as a parse failure instead of a silent runtime bug.

Tests are **vitest**, never jest — `describe/it/expect` imported from `vitest`.

The screenshot proves it works now; the test prevents it from breaking again. Load `testing-boss`
before writing it.

---

## 3. Dark mode is a first-class state, not a nice-to-have

**`DESIGN.md` requires every surface to carry a `dark:` variant. A missing one is completely
invisible in light mode.** White text on a white card, a border that vanishes, an icon that
disappears — none of it shows up in `check-types`, in a vitest render, or in a light-mode screenshot.
The only cheap detector is a dark screenshot.

**Every visual check of a surface captures BOTH themes.** A check that captured only light mode did
not check the thing most likely to be broken.

### How the app decides the theme

`apps/web/src/lib/theme.ts` reads `localStorage["crafthub-theme"]` (falling back to
`prefers-color-scheme`) and `applyTheme()` toggles `.dark` on `document.documentElement` and sets
`style.colorScheme`. **That is the FIRST PAINT and nothing more:** for a SIGNED-IN account
`app-boot.ts` then fetches `GET /preferences` and applies the DATABASE's value over the local
mirror. The database is the source of truth; localStorage is a cache of it — which is why a theme
helper has to do two things, not one.

**Use the runner's `setTheme(theme)`.** It seeds the mirror AND rewrites the `/preferences` response
so both halves of the bootstrap agree, and it then **refuses to return until the requested theme is
what is actually painted** — checked after a settle window, because boot applies the server value
_after_ `load`. Navigate before the first call (on `about:blank` the `localStorage` write throws):

```js
await goto("/dashboard");
await setTheme("dark"); // throws if dark is not what paints
await shot("dashboard-dark");
```

**If it throws, read the message** — it names what is painted, the computed background and the usual
cause. A dark check that silently captured light mode does not fail; it PASSES while proving
nothing. `references/dark-mode-detail.md` has the two ways to get there, the seed-only sibling
`seedStoredTheme` (no claim about what paints), and the also-valid
`page.emulateMedia({ colorScheme: 'dark' })` for an anonymous first visit.

**Not valid — forcing the class yourself.** `document.documentElement.classList.add('dark')` skips
`applyTheme`, leaves `colorScheme` wrong, and would still "work" if theme initialization were
completely broken. Patching the app to make a screenshot look right is banned (§8).

### The missing-`dark:` heuristic and the screenshot checklist

An element whose computed background is **identical in both themes** usually has no `dark:` variant
— a heuristic, not a proof, since some elements are intentionally theme-independent. The runnable
detection snippet (compare `getComputedStyle(...).backgroundColor` between themes) and the
full checklist to run down before calling a dark screenshot done (text contrast, borders, icons,
translucent surfaces, focus rings, charts, Radix overlays) are both in
`references/dark-mode-detail.md` — read it whenever a dark screenshot looks suspicious or before
signing off on a dark-mode capture.

---

## 4. When this skill is mandatory

- Any new screen, page, dialog, drawer, or card.
- Any change to an existing route's layout, styles or copy.
- Any change to anything in `apps/web/src/shared-components/` — those have many consumers (§5).
- Any change to `surface.ts`, to a Tailwind theme token, or to `theme.ts`.
- Anything in `features/profile-layout` (dnd-kit / react-grid-layout) — drag interactions are almost
  entirely visual.
- Any bug whose report includes a screenshot or the words "broken", "cut", "overlapping", "blank",
  "dark mode".

Skip it only for changes with no rendered output: pure types, API use-cases, schemas, tests, docs,
config.

---

## 5. White screen = maximum severity

Every capture is also a crash check. If the screenshot is blank or shows `AppErrorBoundary` /
`RouteErrorState` when it should not:

1. Read the run's **Console errors** block → find the throw.
2. It is almost always one of: reading something possibly `undefined`, an API payload that does not
   match what the component assumed, or a route param the screen does not handle
   (`/$username` with an unknown username).
3. Fix the cause, then add the failing test that would have caught it — ideally a
   `@repo/schemas` parse of the real payload (§2.7). The screenshot proves the symptom, the test
   prevents the return.

**Before calling a blank `/dashboard` screen a bug, check you are logged in** (§1). The runner's
session probe catches this for scenarios that declare `requiresAuth`, but a mid-run token expiry
still looks like a broken screen and is not one.

---

## 6. Shared component sweep — one capture per usage shape

When the change touches something in `apps/web/src/shared-components/`, screenshots are the only
cheap proof you did not break the other consumers. This is where batching pays the most: **one
scenario, every shape.**

1. List every consumer (grep the import).
2. **Group consumers by usage shape** — the distinct set of props/variants passed. Ten screens
   passing the same props are ONE shape.
3. In one scenario, visit the representative screen of **each** shape and `shot()` it — in both
   themes, before the change and after it.
4. Compare after vs. before. For shapes that were not meant to change, the target is "identical": any
   visible difference is a regression to fix now, not later. The `ariaSnapshot()` diff (§2.4) catches
   structural regressions the eye misses.
5. Report one screen per shape to the dev (§7) — never a list of routes that all exercise the same
   props.

The dashboard routes are the sweep surface: `/dashboard`, `/dashboard/search`, `/dashboard/layout`,
`/dashboard/posts`, `/dashboard/posts/review`, `/dashboard/settings`, plus the public
`/$username`.

---

## 7. Hand-off — what to give the dev at the end

Report the command and its time, then per route: the states captured, the result against the target,
the console/network gate outcome, a dark-mode confirmation, and remaining differences (or an explicit
"none"). A fully worked example of this report is in `references/scenario-scripting.md` — copy its
shape rather than inventing a new report format each time.

Then tell the dev which screens **they** should open, one per usage shape: the route, how to navigate
there, the filters or seed user needed to reach that exact state, and whether to look in light or
dark mode.

---

## 8. Exploration — when you don't know the next action yet

The scenario is the default because you usually know the sequence. When you genuinely do not — an
unfamiliar screen, "does this menu even open?", finding the right locator — you still write a
scenario, just a throwaway one that **looks** instead of asserting — `goto`, `log` the accessibility
tree once, `shot`, nothing asserted. The worked example is in `references/scenario-scripting.md`.

One run gives you the tree and a picture; then write the real scenario. Add `--headed` when a human
wants to watch it happen:

```bash
npm run visual:run -- scripts/visual/scenarios/explore.scenario.mjs --headed
```

`page.pause()` in a headed run opens Playwright's inspector, which is the fastest way for a **human**
to pick locators. Never leave it in a scenario an agent runs — it hangs the process.

---

## 9. Rules and limits

- **Never commit screenshots or the session.** `.visual/` and `.playwright/auth.json` must stay
  gitignored. `.playwright/cli.config.json` **is** versioned; that is the shared contract.
- **Never put credentials in the repo.** `npm run visual:login` reads `VISUAL_EMAIL` /
  `VISUAL_PASSWORD` from the environment and defaults to the seeded dev user. No password in a
  command, a script, a scenario, a committed env file or a `fill()`.
- **Never navigate outside `localhost:5173` / `localhost:3333`.** No production, no staging, no
  third-party site. The origin allowlist covers the local API and fonts — it is not permission to
  browse.
- **Never let a browser action stand in for a test.** The browser proves it renders now; the vitest
  test prevents the regression. UI work needs both (§2.7).
- **Never mutate real data to reach a state.** Use `mock()`; reseed with `bash db-manage.sh seed-all`
  if you need different data.
- **`page.evaluate` is for reading state**, not for patching the app to make a screenshot look right.
  Setting `localStorage["crafthub-theme"]` and reloading is driving the app; injecting a `.dark` class
  or overwriting a style is faking the result.
- Screenshots are evidence, not a decision: if a difference is intentional, say why in the hand-off
  instead of silently accepting it.

---

## 10. Fallback when the browser cannot run

If the browser cannot run (no Chromium, no display, offline):

1. Say so explicitly — do not silently skip the visual check.
2. Compensate with what is available: render the component in a **vitest + `@testing-library/react`**
   test and assert the rendered structure per prop and per state; assert the `dark:` classes are
   present in the className where dark mode is the concern; run `npm run check-types` and
   `node scripts/guardrails/lint-changed.mjs`.
3. Tell the dev, in the hand-off, exactly which routes, states and themes were **not** visually
   verified and must be opened by hand.

---

## Quick reference

| Item               | Value                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default driver     | **scenario script** — `npm run visual:run -- scripts/visual/scenarios/<file>`                                                                                   |
| Reference scenario | `scripts/visual/scenarios/public-profile.scenario.mjs`                                                                                                          |
| Runner             | `node scripts/visual/run.mjs <scenario.mjs> [--headed]`                                                                                                         |
| Session            | `node scripts/visual/session.mjs login\|check\|setup` · `npm run visual:login` · `npm run visual:check`                                                         |
| Config             | `.playwright/cli.config.json`                                                                                                                                   |
| Web app            | [http://localhost:5173](http://localhost:5173) (`npm run dev:web`; `VISUAL_APP_URL` overrides)                                                                  |
| API                | [http://localhost:3333](http://localhost:3333) (`npm run dev:api`; Swagger at `/docs`)                                                                          |
| Infra              | `bash db-manage.sh start` · seed with `bash db-manage.sh seed-all`                                                                                              |
| Routes             | `/` · `/dashboard` · `/dashboard/search` · `/dashboard/layout` · `/dashboard/posts` · `/dashboard/posts/review` · `/dashboard/settings` · `/$username` (public) |
| Seed profile       | `/seed-react-frontend-003`                                                                                                                                      |
| Baseline viewport  | 1440 × 900 (also verify 1024 × 768)                                                                                                                             |
| Themes             | light **and** dark, every check — `localStorage["crafthub-theme"]`, `.dark` on `<html>`                                                                         |
| Evidence folder    | `.visual/` — gitignored                                                                                                                                         |
| Auth session       | `.playwright/auth.json` — gitignored                                                                                                                            |
| Design authority   | `DESIGN.md` (repo root)                                                                                                                                         |
| Scenario exports   | `export default async function(ctx)` · `export const requiresAuth = false`                                                                                      |
| Scenario helpers   | `page` `context` `browser` `appUrl` `goto` `shot` `mock` `unmock` `assert` `resize` `newUserPage` `log` `collectors`                                            |
| Force a state      | `mock(glob, { body })` · `{ status: 500 }` · `{ delay: Infinity }` · `unmock()`                                                                                 |
| Graduate to        | vitest + `@testing-library/react`, or a `@repo/schemas` parse of a real payload                                                                                 |
