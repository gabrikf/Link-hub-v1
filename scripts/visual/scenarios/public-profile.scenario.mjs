/**
 * Reference scenario — the public profile (`/:username`, the short URL that
 * replaced `/profile/:username`).
 *
 * This is the page the whole product exists to produce: the thing a developer
 * shares and a stranger opens. It is also the only major screen with NO session,
 * which is why it is the reference — a check that needs a live login, a seeded
 * database and a running worker is a check nobody runs.
 *
 *   npm run visual:run -- scripts/visual/scenarios/public-profile.scenario.mjs
 *
 * One run visits every state the screen can render — loading, error, not-found,
 * filled — in both themes, plus the narrow-viewport layout. Copy this file when
 * you start a new check.
 *
 * PREREQUISITES: `npm run dev` (web on 5173, api on 3333) and a seeded database
 * (`bash db-manage.sh start && bash db-manage.sh seed-all`).
 */

/** Public page: no storageState, captured exactly as a stranger sees it. */
export const requiresAuth = false;

/**
 * `seed-realistic.ts` mints logins as `seed-<blueprint-slug>-<NNN>`, where the
 * number comes from a GLOBAL sequence across all blueprints — so the suffix is
 * not stable across reseeds. If this one 404s, pick a real one:
 *
 *   bash db-manage.sh connect
 *   select login from users where login like 'seed-react-frontend%' limit 3;
 *
 * then export VISUAL_PROFILE_USERNAME=<that login>.
 */
const USERNAME = process.env.VISUAL_PROFILE_USERNAME || "seed-react-frontend-003";
const PROFILE = `/${USERNAME}`;

/**
 * The profile fetch. Matching on the path rather than the full origin keeps the
 * scenario working whether VITE_API_URL points at localhost or a preview API.
 *
 * Still `/profile/...`: this is the API route, which did NOT move. Only the
 * page URL became `/:username`.
 */
const PROFILE_API = `**/profile/${USERNAME}**`;

export default async function publicProfile({
  goto,
  shot,
  mock,
  unmock,
  assert,
  resize,
  setTheme,
  page,
  log,
}) {
  /* ── FILLED — real data, the happy path ─────────────────────────────── */
  await goto(PROFILE);
  // First SPA boot: `goto` resolves at `load`, before React has painted the
  // lazily-loaded route chunk. This one wait is legitimately slower than the
  // 3s fail-fast default the runner sets.
  await page.getByRole("heading").first().waitFor({ timeout: 15_000 });
  await shot("filled-light");

  assert(
    await page.getByRole("heading").first().isVisible(),
    "filled: the profile renders a heading",
  );
  assert(
    !(await page
      .getByText(/undefined|NaN|Invalid Date|\[object Object\]/)
      .first()
      .isVisible()
      .catch(() => false)),
    "filled: no undefined/NaN/Invalid Date leaked into the page",
  );

  /* ── DARK — every surface must carry its dark: variant ──────────────── */
  // Set through localStorage, not by forcing the class: forcing it bypasses
  // applyTheme() in apps/web/src/lib/theme.ts, so a broken theme bootstrap would
  // still screenshot as a perfectly good dark page.
  await setTheme("dark");
  await page.getByRole("heading").first().waitFor({ timeout: 15_000 });
  await shot("filled-dark");

  const bodyBackground = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  log(`dark body background: ${bodyBackground}`);
  assert(
    await page.evaluate(() => document.documentElement.classList.contains("dark")),
    "dark: the theme bootstrap applied the .dark class",
  );

  await setTheme("light");

  /* ── 1024px — the layout must not scroll sideways ───────────────────── */
  await resize(1024, 768);
  await goto(PROFILE);
  await page.getByRole("heading").first().waitFor({ timeout: 15_000 });
  await shot("filled-1024");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "1024px: the page does not scroll horizontally",
  );
  await resize(1440, 900);

  /* ── LOADING — hold the response open so the branch stays on screen ─── */
  await mock(PROFILE_API, { delay: Infinity });
  await goto(PROFILE);
  await shot("loading");
  await unmock(PROFILE_API);

  /* ── NOT FOUND — a username nobody owns ─────────────────────────────── */
  await goto("/definitely-not-a-real-user-000");
  // `isVisible()` means "in the DOM with a box", NOT "in the viewport", so a
  // state below the fold needs scrolling into view or the screenshot is
  // evidence of nothing.
  const notFound = page.getByText(/not found|doesn't exist|does not exist/i).first();
  await notFound.waitFor({ timeout: 20_000 }).catch(() => {});
  await notFound.scrollIntoViewIfNeeded().catch(() => {});
  await shot("not-found");
  assert(
    await notFound.isVisible().catch(() => false),
    "not-found: an unknown username renders a not-found state, not a blank page",
  );

  /* ── ERROR — the API answers 500 ────────────────────────────────────── */
  // The generous timeout is deliberate: TanStack Query retries 3x with
  // exponential backoff (apps/web/src/lib/query-client.ts leaves `retry` at the
  // default) before the error branch renders.
  await mock(PROFILE_API, { status: 500, body: { message: "boom" } });
  await goto(PROFILE);
  const errorState = page
    .getByText(/something went wrong|try again|error/i)
    .first();
  await errorState.waitFor({ timeout: 25_000 }).catch(() => {});
  await errorState.scrollIntoViewIfNeeded().catch(() => {});
  await shot("error");
  assert(
    await errorState.isVisible().catch(() => false),
    "error: a 500 renders an error state rather than a white screen",
  );

  await unmock();
}
