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
+ TanStack Query + Tailwind v4. What "looks right" means is defined by **`DESIGN.md` at the repo
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

### Why this is the rule and not a preference

Driving the browser one command per Bash call costs, **per action**: one agent round-trip + one
process spawn + one page-tree dump into context. A six-state check of one screen is 15–30 actions,
so that overhead is paid 15–30 times. The browser was never the bottleneck — the loop shape was.

| | scenario script (default) | one command per tool call |
|---|---|---|
| Process spawns for a 6-state check | 1 | ~15 |
| Agent round-trips | 1 | ~15 |
| Browser launches | 1 | ~15 |
| Context growth | one summary block | a page tree per action |
| Iterating after a fix | edit the file, run again | re-type the whole sequence |

**Read the ratio correctly.** In raw process seconds a batched run is only modestly faster, because
both approaches pay the same page loads. The win is in the two columns the clock does not show:

- **15 tool calls collapse to 1.** In an agent loop each command is also a full model round-trip —
  seconds of model time each, and context that grows with every dump. That term dominates, and it is
  the reason this skill batches.
- **Per-call spawn overhead disappears.** Starting a Node process and re-attaching to a browser is
  work that drives nothing.

**Iterating on a check = edit the scenario file and run it again.** A rerun costs one headless launch
(~1s) plus the page loads. That is cheap enough to run after every edit, which is the point: the loop
only helps if you actually close it.

### The performance contract

**A full check of one screen — four states, two themes, the narrow viewport, plus the console/network
gate — completes in one tool call, in seconds, screenshots included.** If a check is taking minutes,
one of three things is true:

1. You are chatting with the browser instead of batching.
2. The Vite dev server is cold and still compiling the route (first run only).
3. **A state is waiting on TanStack Query's retry backoff.** `apps/web/src/lib/query-client.ts` sets
   `staleTime` and `refetchOnWindowFocus` but leaves `retry` at the TanStack default of 3 with
   exponential backoff. A mocked 500 therefore takes several seconds to reach the error branch. That
   is app behavior, not harness overhead. When one state is unavoidably slow, start it on a second
   page with `newUserPage()` and capture the fast states on the main page while it backs off.

If you want real numbers for this repo, read them off an actual run's `time` line and quote those —
do not repeat a figure you did not measure.

### What a scenario looks like

`scripts/visual/scenarios/public-profile.scenario.mjs` is the reference — copy it to start a new
check. It is plain Playwright plus a handful of helpers:

```js
const PROFILE = '**/profiles/**';

// The public profile needs no session. Dashboard scenarios set this to true.
export const requiresAuth = false;

export default async function publicProfile({ goto, shot, mock, unmock, assert, page, resize }) {
  await goto('/profile/seed-react-frontend-003');   // FILLED — real API
  await shot('filled');

  await setTheme(page, 'dark');                     // DARK is not optional (§3)
  await shot('filled-dark');
  await setTheme(page, 'light');

  await resize(1024, 768);                          // narrow layout
  await shot('filled-1024');
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    '1024px: page does not scroll horizontally',
  );
  await resize(1440, 900);

  await mock(PROFILE, { body: { blocks: [] } });    // EMPTY
  await goto('/profile/seed-react-frontend-003');
  await shot('empty');

  await unmock(PROFILE);
  await mock(PROFILE, { status: 500 });             // ERROR — deliberately failing mock
  await goto('/profile/seed-react-frontend-003');
  const retry = page.getByRole('button', { name: /try again/i });
  await retry.waitFor({ timeout: 20_000 });         // Query retries 3× first
  await retry.scrollIntoViewIfNeeded();             // §2.2 — isVisible() is not "on screen"
  await shot('error');
  assert(await retry.isVisible(), 'error: RouteErrorState shows a "Try again" button');
}
```

### The context object

The runner default-exports one async function and hands it a context object:

| Helper | What it does |
|---|---|
| `page`, `context`, `browser` | raw Playwright — anything the helpers don't cover |
| `appUrl` | the resolved app origin (`http://localhost:5173` unless overridden) |
| `goto(pathOrUrl)` | navigates; a bare path resolves against `appUrl`. On the FIRST navigation it verifies the session is alive when the scenario declares `requiresAuth` |
| `shot(name)` | writes `.visual/<scenario>-<name>.png`. Auto-prefixed — it can never land in the repo root |
| `mock(urlGlob, { body?, status?, delay? })` | fulfils a route. An object `body` is JSON-stringified. `status >= 400` or `delay: Infinity` marks the mock **deliberately failing** (§2.5) |
| `unmock(pattern?)` | removes one mock, or all of them |
| `assert(cond, label)` | **accumulates** instead of throwing, so one bad state does not hide the other five |
| `resize(w, h)` | viewport change |
| `newUserPage(overrides?)` | an extra context+page with the same contract — multi-user checks, or `{ storageState: undefined }` for a logged-out view |
| `log(msg)` | a line in the run output |
| `collectors` | the console/network collectors, if a scenario needs to read the gate mid-run |

### `requiresAuth` — declare it, per scenario

```js
export const requiresAuth = true;   // default is false
```

Unlike a fully gated corporate app, **linkhub has genuinely public pages**. `/profile/$username`
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
and writes a Playwright `storageState` to `.playwright/auth.json` containing the
`linkhub.auth.tokens` localStorage entry. Credentials come from the environment —
`VISUAL_EMAIL` / `VISUAL_PASSWORD` — and default to the seeded recruiter
(`recruiter.seed@linkhub.local`). Seed the database first if that user does not exist:

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

`.playwright/cli.config.json` (committed) pins the things every capture must share, so a screenshot
taken today is comparable with one taken next month. There is exactly one contract; the runner reads
this file.

| Setting | Value | Why |
|---|---|---|
| viewport | 1440 × 900 | the baseline; resize explicitly when you need another |
| `storageState` | `.playwright/auth.json` | the logged-in session |
| `outputDir` | `.visual/` | gitignored evidence folder |
| headless | `true` | the agent does not watch the window, and headless is faster. `npm run visual:run -- <file> --headed` when a human wants to watch |
| allowed origins | `localhost:5173`, `localhost:3333`, Google Fonts | **the API and the fonts must be allowed.** An allowlist that blocks them makes every screenshot render with fallback fonts and empty data, and the agent then "verifies" the wrong screen |
| blocked origins | analytics / telemetry hosts | agent traffic must not pollute product telemetry |
| `testIdAttribute` | `data-testid` | so `getByTestId` matches the repo's convention |
| timeouts | short action, longer navigation | agent iteration wants fail-fast, not patience |

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
them in the same scenario file:

| Capture | When |
|---|---|
| loading | screen fetches data (`RoutePending`, `Skeleton`) |
| empty | API returns an empty list |
| error | API returns 500 (`RouteErrorState` + "Try again") |
| filled | happy path with real data |
| **dark** | **always — see §3** |
| logged-out | any page reachable without a session (`/profile/$username`) |
| each variant/prop | component renders differently per prop (§5) |
| 1024px wide | any new layout, to prove it does not overflow |
| dialog / drawer open | screen opens a Radix dialog or alert-dialog |
| hover / focus / disabled | interactive elements whose style changes |
| mid-drag | `features/profile-layout` — dnd-kit / react-grid-layout have their own visual states |

**Force the states — do not wait for luck.** `mock()` intercepts the network, which is the fastest
way to reach empty/error/loading without touching real data:

```js
await mock('**/profiles/**', { body: { blocks: [] } });   // empty
await mock('**/profiles/**', { status: 500 });            // error
await mock('**/search**', { body: knownPayload });        // a known payload
await mock('**/search**', { delay: Infinity });           // loading — never answers
await unmock();                                           // back to real data
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
await shot('error');
```

This is a real failure mode, not a hypothetical: the first version of a reference scenario asserted
the "Try again" button and screenshotted a page that did not contain it.

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

The run prints one compact summary and exits non-zero on any failure:

```
── visual-check · public-profile ────────────────────────────
  assertions   6 passed, 0 failed
  console      0 errors, 3 warnings
  network      0 bad requests
  expected     9 (from deliberately failing mocks)
  screenshots  6 → .visual/public-profile-*.png
  time         12.1s
✅ PASS
```

Failures, warnings and expected entries are listed in full above the summary block, so one run gives
you the whole picture without a second command.

### 2.4 COMPARE — structured, not "looks fine"

Read the target and the screenshots side by side and fill this table. Vague conclusions hide bugs; a
table forces you to look at each dimension.

| Dimension | What to check |
|---|---|
| Layout | element order, alignment, column widths, nothing overflowing or clipped |
| Spacing | gaps/padding on the Tailwind scale, not eyeballed px |
| Typography | size, weight, line-height, truncation with ellipsis instead of overflow |
| Color | tokens and the palette `DESIGN.md` defines — no stray hardcoded hex |
| Surfaces | the shared constants in `apps/web/src/shared-components/surface.ts` (`SURFACE`, `SURFACE_PROFILE`, `SURFACE_GLASS`, …), not a fresh fork of the border/background literal. Sibling blocks reading as different materials is exactly the drift those constants exist to stop |
| Components | the primitives in `apps/web/src/shared-components/` (`Button`, `Dialog`, `Input`, `Select`, `Skeleton`, `Avatar`, …) where one fits, not a hand-rolled div |
| **Dark mode** | **every surface, border, text color and icon has a `dark:` variant and is legible (§3)** |
| States | the 4 states exist and are styled; buttons show loading/disabled correctly |
| Content | no raw placeholder text on screen. linkhub has no i18n — strings are hardcoded English, so a wrong string is a wrong string, not a missing key |
| Empty data | nothing shows `undefined`, `NaN`, `null`, `Invalid Date`, or an empty box |

For a "must not change" check, diff the accessibility trees instead of squinting at two PNGs — dump
them from inside the scenario:

```js
import { writeFileSync } from 'node:fs';
writeFileSync('.visual/before.yml', await page.locator('body').ariaSnapshot());
```

Run the scenario before your change and after it, then `diff` the two files.

Then report **each difference as a concrete line**: *"the section title is 24px in the design and
renders 16px"*, never *"close enough"*. If there is no difference, say so explicitly.

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
- Telemetry hosts are blocked on purpose and the collectors filter them out. `ERR_BLOCKED_BY_CLIENT`
  for a blocked analytics host is expected and is **not** a finding.
- A request duplicated on every render is a bug even when the pixels match. It shows up in the run as
  a pile of identical entries — worth watching on `/dashboard/search`, where a re-render storm is
  cheap to introduce and invisible in a screenshot.

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

`apps/web/src/lib/theme.ts`:

- `initializeTheme()` reads `localStorage["linkhub-theme"]` and falls back to
  `prefers-color-scheme`.
- `applyTheme()` toggles the `.dark` class on `document.documentElement` and sets
  `style.colorScheme`.

So there are two honest ways to reach dark mode, and one dishonest one.

**Preferred — set the stored preference and reload.** Deterministic, and it runs the app's own
initialization path:

```js
async function setTheme(page, theme) {
  await page.evaluate((value) => window.localStorage.setItem('linkhub-theme', value), theme);
  await page.reload();
}
```

**Also valid — emulate the OS preference** for a first-visit user with nothing stored:

```js
await page.emulateMedia({ colorScheme: 'dark' });
await page.reload();
```

**Not valid — forcing the class yourself.** `document.documentElement.classList.add('dark')` skips
`applyTheme`, leaves `colorScheme` wrong, and would still "work" if theme initialization were
completely broken. Patching the app to make a screenshot look right is banned (§8).

### The missing-`dark:` heuristic

An element whose computed background is **identical in both themes** usually has no `dark:` variant.
It is a heuristic, not a proof — some elements are intentionally theme-independent (brand colors, a
cover image, a fixed-color badge) — so treat a hit as "go look at it", not as a failure:

```js
const bgIn = async (selector) =>
  page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, selector);

await setTheme(page, 'light');
const light = await bgIn('[data-testid="profile-card"]');
await setTheme(page, 'dark');
const dark = await bgIn('[data-testid="profile-card"]');
assert(light !== dark, 'profile card background changes between themes (has a dark: variant)');
```

### Dark-mode checklist for the screenshot

- Text contrast on every surface — including muted/secondary text and placeholder text.
- Borders still visible (the `zinc-700` vs `zinc-800` distinction `surface.ts` exists to keep
  consistent).
- Icons (`react-icons` `fi` set) not black-on-dark.
- Translucent surfaces (`SURFACE_PROFILE`, `SURFACE_GLASS`) still readable over the user's accent
  color and cover image.
- Focus rings still visible.
- Charts / AI Match % indicators still legible.
- Radix dialog overlays and their content, in both themes.

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
   (`/profile/$username` with an unknown username).
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
`/profile/$username`.

---

## 7. Hand-off — what to give the dev at the end

```markdown
**Visual check (`npm run visual:run -- scripts/visual/scenarios/search.scenario.mjs`, 14.2s)**

| Route | States captured | Result |
|---|---|---|
| /dashboard/search | filled, empty, error, loading, 1024px — light + dark | matches DESIGN.md |
| /profile/seed-react-frontend-003 | filled, logged-out — light + dark | unchanged vs. before |

- Console: 0 errors, 0 warnings
- Network: no unexpected 4xx/5xx
- Dark mode: every captured surface has a working `dark:` variant
- Remaining differences: none  (or: list them, with why they were accepted)
```

Then tell the dev which screens **they** should open, one per usage shape: the route, how to navigate
there, the filters or seed user needed to reach that exact state, and whether to look in light or
dark mode.

---

## 8. Exploration — when you don't know the next action yet

The scenario is the default because you usually know the sequence. When you genuinely do not — an
unfamiliar screen, "does this menu even open?", finding the right locator — you still write a
scenario, just a throwaway one that **looks** instead of asserting:

```js
export const requiresAuth = true;

export default async function explore({ goto, page, log, shot }) {
  await goto('/dashboard/posts/review');
  log(await page.locator('body').ariaSnapshot());   // the tree, once, in the run output
  await shot('explore');
}
```

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
  Setting `localStorage["linkhub-theme"]` and reloading is driving the app; injecting a `.dark` class
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

| Item | Value |
|---|---|
| Default driver | **scenario script** — `npm run visual:run -- scripts/visual/scenarios/<file>` |
| Reference scenario | `scripts/visual/scenarios/public-profile.scenario.mjs` |
| Runner | `node scripts/visual/run.mjs <scenario.mjs> [--headed]` |
| Session | `node scripts/visual/session.mjs login\|check\|setup` · `npm run visual:login` · `npm run visual:check` |
| Config | `.playwright/cli.config.json` |
| Web app | [http://localhost:5173](http://localhost:5173) (`npm run dev:web`; `VISUAL_APP_URL` overrides) |
| API | [http://localhost:3333](http://localhost:3333) (`npm run dev:api`; Swagger at `/docs`) |
| Infra | `bash db-manage.sh start` · seed with `bash db-manage.sh seed-all` |
| Routes | `/` · `/dashboard` · `/dashboard/search` · `/dashboard/layout` · `/dashboard/posts` · `/dashboard/posts/review` · `/dashboard/settings` · `/profile/$username` (public) |
| Seed profile | `/profile/seed-react-frontend-003` |
| Baseline viewport | 1440 × 900 (also verify 1024 × 768) |
| Themes | light **and** dark, every check — `localStorage["linkhub-theme"]`, `.dark` on `<html>` |
| Evidence folder | `.visual/` — gitignored |
| Auth session | `.playwright/auth.json` — gitignored |
| Design authority | `DESIGN.md` (repo root) |
| Scenario exports | `export default async function(ctx)` · `export const requiresAuth = false` |
| Scenario helpers | `page` `context` `browser` `appUrl` `goto` `shot` `mock` `unmock` `assert` `resize` `newUserPage` `log` `collectors` |
| Force a state | `mock(glob, { body })` · `{ status: 500 }` · `{ delay: Infinity }` · `unmock()` |
| Graduate to | vitest + `@testing-library/react`, or a `@repo/schemas` parse of a real payload |
