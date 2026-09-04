# Scenario scripting — rationale, the worked example, and the runner contract

Read this when you are about to write your first scenario for a check, when you need the full
helper contract for the context object the runner hands you, or when you want the reasoning behind
"batch, don't chat with the browser" (SKILL.md §0) instead of just the rule.

---

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

---

### Troubleshooting a slow run

A full check of one screen should complete in one tool call, in seconds. If it is taking minutes and
you have ruled out "chatting with the browser instead of batching" and a cold Vite dev server, the
remaining cause is almost always TanStack Query's retry backoff: `apps/web/src/lib/query-client.ts`
sets `staleTime` and `refetchOnWindowFocus` but leaves `retry` at the TanStack default of 3 with
exponential backoff. A mocked 500 therefore takes several seconds to reach the error branch — that is
app behavior, not harness overhead. When one state is unavoidably slow, start it on a second page with
`newUserPage()` and capture the fast states on the main page while it backs off.

---

### What a scenario looks like

`scripts/visual/scenarios/public-profile.scenario.mjs` is the reference — copy it to start a new
check. It is plain Playwright plus a handful of helpers:

```js
const PROFILE = '**/profiles/**';

// The public profile needs no session. Dashboard scenarios set this to true.
export const requiresAuth = false;

export default async function publicProfile({ goto, shot, mock, unmock, assert, page, resize }) {
  await goto('/seed-react-frontend-003');   // FILLED — real API
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
  await goto('/seed-react-frontend-003');
  await shot('empty');

  await unmock(PROFILE);
  await mock(PROFILE, { status: 500 });             // ERROR — deliberately failing mock
  await goto('/seed-react-frontend-003');
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

---

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

### Sample run summary (§2.3)

`npm run visual:run -- <scenario file>` prints one compact summary and exits non-zero on any failure:

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

---

### Hand-off report — worked example (§7)

```markdown
**Visual check (`npm run visual:run -- scripts/visual/scenarios/search.scenario.mjs`, 14.2s)**

| Route | States captured | Result |
|---|---|---|
| /dashboard/search | filled, empty, error, loading, 1024px — light + dark | matches DESIGN.md |
| /seed-react-frontend-003 | filled, logged-out — light + dark | unchanged vs. before |

- Console: 0 errors, 0 warnings
- Network: no unexpected 4xx/5xx
- Dark mode: every captured surface has a working `dark:` variant
- Remaining differences: none  (or: list them, with why they were accepted)
```

---

### The exploration throwaway scenario

When you genuinely do not know the next action yet (SKILL.md §8 — an unfamiliar screen, "does this
menu even open?", finding the right locator), write a scenario that **looks** instead of asserting:

```js
export const requiresAuth = true;

export default async function explore({ goto, page, log, shot }) {
  await goto('/dashboard/posts/review');
  log(await page.locator('body').ariaSnapshot());   // the tree, once, in the run output
  await shot('explore');
}
```

One run gives you the tree and a picture; then write the real scenario.
