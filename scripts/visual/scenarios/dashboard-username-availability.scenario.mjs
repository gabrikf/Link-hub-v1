/**
 * The username availability check, in the dialog it lives in.
 *
 *   npm run visual:run -- scripts/visual/scenarios/dashboard-username-availability.scenario.mjs
 *
 * The status line under the Username field has five states — idle, checking,
 * available, taken/reserved, and "could not check" — and a component test can
 * only prove the right STRING appears. It cannot see a colour with no `dark:`
 * variant, text that fails contrast, or a layout that jumps when the message
 * arrives. Every state is captured in both themes for that reason.
 *
 * The api answers are MOCKED rather than seeded. The states worth looking at
 * include one the real server will not produce on demand (a failed check), and
 * a scenario that depends on which handles happen to exist in the local
 * database is a scenario that rots.
 *
 * PREREQUISITES: `npm run dev`, a seeded database, and a session
 * (`npm run visual:login`).
 */
export const requiresAuth = true;

const AVAILABILITY_API = "**/username-available**";

/**
 * The account's stored theme, which boot APPLIES over whatever the runner put
 * in `localStorage` — `applyBootPreferences` in apps/web/src/lib/app-boot.ts
 * treats the server as the authority for a signed-in load, by design. So a
 * signed-in scenario cannot capture dark mode with `setTheme` alone; it has to
 * answer as an account whose preference IS dark.
 */
const PREFERENCES_API = "**/preferences";

/**
 * `GET /me/resume` answers 404 when the account has no resume, and the seeded
 * recruiter has none — so a signed-in dashboard capture reports four "bad
 * requests" that have nothing to do with this screen. Verified pre-existing:
 * the untouched `header-signed-in.scenario.mjs` produces the identical four on
 * a clean tree.
 *
 * Mocked with the SAME 404 the server sends, so nothing is hidden — it just
 * moves into the runner's "expected" column, where a fixture's shape belongs,
 * instead of failing a run about the username field. Delete this the day the
 * resume panel is what a scenario is looking at.
 */
const RESUME_API = "**/me/resume";

/** Must match the id in dashboard-profile-form.tsx — stable across locales. */
const USERNAME_FIELD = "#profile-username";
const STATUS_LINE = "#profile-username-status";

export default async function usernameAvailability({
  goto,
  shot,
  mock,
  unmock,
  assert,
  setTheme,
  page,
  log,
}) {
  /*
   * English for the whole run. The seeded account carries its own language
   * preference, and a scenario whose assertions depend on which one would fail
   * for a reason that has nothing to do with the screen under test.
   */
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    ["crafthub-language", "en-US"],
  );

  const openDialog = async () => {
    await goto("/dashboard");
    const edit = page.getByRole("button", { name: /edit profile/i }).first();
    await edit.waitFor({ timeout: 20_000 });
    await edit.click();
    await page.locator(USERNAME_FIELD).waitFor({ timeout: 10_000 });
  };

  /** Types a handle and waits past the 400ms debounce for a settled verdict. */
  const type = async (value) => {
    await page.locator(USERNAME_FIELD).fill(value);
    await page.waitForTimeout(1200);
  };

  const statusText = () => page.locator(STATUS_LINE).innerText();

  await mock(RESUME_API, { status: 404, body: { message: "No resume" } });

  await openDialog();

  /* ── IDLE — an untouched form carries no commentary ──────────────────── */
  await shot("idle-light");
  const idle = (await statusText()).trim();
  log(`idle status line: "${idle}"`);
  assert(idle === "", "idle: the untouched handle gets no verdict at all");

  /* ── AVAILABLE ───────────────────────────────────────────────────────── */
  await mock(AVAILABILITY_API, {
    body: { username: "mariana", isAvailable: true, reason: null },
  });
  await type("mariana");
  await shot("available-light");
  assert(
    (await statusText()).includes("available"),
    "available: a free handle is reported as free",
  );

  /* ── TAKEN ───────────────────────────────────────────────────────────── */
  await mock(AVAILABILITY_API, {
    body: { username: "ada", isAvailable: false, reason: "taken" },
  });
  await type("ada");
  await shot("taken-light");
  assert(
    (await statusText()).includes("taken"),
    "taken: a handle somebody owns is reported as taken",
  );

  /* ── RESERVED — a different problem, so a different sentence ─────────── */
  await mock(AVAILABILITY_API, {
    body: { username: "dashboard", isAvailable: false, reason: "reserved" },
  });
  await type("dashboard");
  await shot("reserved-light");
  assert(
    (await statusText()).toLowerCase().includes("reserved"),
    "reserved: a reserved name says so, rather than 'taken'",
  );

  /* ── UNKNOWN — the check itself failed ───────────────────────────────── */
  // The one state the real server will not produce on request, and the one
  // that must never read as a green light.
  await mock(AVAILABILITY_API, { status: 500, body: { message: "boom" } });
  await type("mariana-again");
  await shot("unknown-light");
  const unknown = await statusText();
  log(`failed-check status line: "${unknown.trim()}"`);
  assert(
    unknown.toLowerCase().includes("could not check"),
    "unknown: a failed check says so",
  );
  assert(
    !unknown.toLowerCase().includes("is available"),
    "unknown: a failed check is never dressed up as availability",
  );

  /* ── CHECKING — hold the response open so the branch stays on screen ─── */
  await mock(AVAILABILITY_API, { delay: Infinity });
  await page.locator(USERNAME_FIELD).fill("mariana-typing");
  await page.waitForTimeout(700);
  await shot("checking-light");
  assert(
    (await statusText()).toLowerCase().includes("checking"),
    "checking: the in-flight state is visible while the answer is outstanding",
  );

  /* ── DARK — every one of the four colours needs its dark: variant ────── */
  // `unmock()` with no argument drops EVERY route, the resume fixture included.
  await unmock(AVAILABILITY_API);
  await setTheme("dark");
  await mock(PREFERENCES_API, { body: { theme: "dark", language: null } });

  for (const [name, body] of [
    ["available", { username: "mariana", isAvailable: true, reason: null }],
    ["taken", { username: "ada", isAvailable: false, reason: "taken" }],
    ["reserved", { username: "dashboard", isAvailable: false, reason: "reserved" }],
  ]) {
    await mock(AVAILABILITY_API, { body });
    await openDialog();
    await type(body.username);
    await shot(`${name}-dark`);
  }

  await mock(AVAILABILITY_API, { status: 500, body: { message: "boom" } });
  await openDialog();
  await type("mariana-again");
  await shot("unknown-dark");

  assert(
    await page.evaluate(() => document.documentElement.classList.contains("dark")),
    "dark: the theme bootstrap applied the .dark class",
  );

  /*
   * The status line reserves its own height, so an arriving verdict must not
   * move the field above it — a form that jumps under the cursor while you type
   * is how a mistyped handle gets saved.
   */
  const box = await page.locator(STATUS_LINE).boundingBox();
  log(`status line height: ${box?.height}px`);
  assert((box?.height ?? 0) >= 16, "the status line holds its own height");

  await unmock();
}
