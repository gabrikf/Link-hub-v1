/**
 * The revived `/profile/:username` path.
 *
 *   npm run visual:run -- scripts/visual/scenarios/legacy-profile-redirect.scenario.mjs
 *
 * `/profile/:username` was the profile URL for the whole life of the product
 * before the short URL shipped, so it is the address in every link shared
 * before the change. Removing it made all of them land on the app's 404 screen.
 * `legacyProfileRoute` (apps/web/src/router.tsx) redirects them.
 *
 * A unit test can assert `router.state.location.pathname`. What it cannot do is
 * notice that the visitor saw a flash of the wrong screen, or that the profile
 * behind the redirect renders broken — which is the whole reason this runs in a
 * browser.
 *
 * PREREQUISITES: `npm run dev` (web 5173, api 3333) and a seeded database.
 * No session: an old shared link is opened by strangers.
 */
export const requiresAuth = false;

const USERNAME = process.env.VISUAL_PROFILE_USERNAME || "seed-react-frontend-003";
const LEGACY = `/profile/${USERNAME}`;
const SHORT = `/${USERNAME}`;

export default async function legacyProfileRedirect({
  goto,
  shot,
  assert,
  setTheme,
  page,
  log,
}) {
  /* ── The plain old link ─────────────────────────────────────────────── */
  await goto(LEGACY);
  await page.getByRole("heading").first().waitFor({ timeout: 15_000 });
  await shot("redirected-light");

  const landed = new URL(page.url());
  log(`${LEGACY} -> ${landed.pathname}`);
  assert(
    landed.pathname === SHORT,
    `the old path lands on the short URL (got "${landed.pathname}")`,
  );
  assert(
    await page.getByRole("heading").first().isVisible(),
    "the profile behind the redirect actually renders",
  );
  // The bug this whole change exists to fix, stated as the thing a visitor
  // would see: the profile's own not-found state.
  assert(
    !(await page
      .getByText(/not found|não encontrado|no encontrado/i)
      .first()
      .isVisible()
      .catch(() => false)),
    "the redirect does not land on a not-found state",
  );

  /* ── Dark, because the destination is a full page render ────────────── */
  await setTheme("dark");
  await goto(LEGACY);
  await page.getByRole("heading").first().waitFor({ timeout: 15_000 });
  await shot("redirected-dark");
  assert(
    await page.evaluate(() => document.documentElement.classList.contains("dark")),
    "dark: the theme bootstrap survives the redirect",
  );
  await setTheme("light");

  /* ── A shared link carries baggage ──────────────────────────────────── */
  // The links this route exists for are the ones that went through a campaign,
  // a newsletter or a CV — i.e. the ones with a query string and an anchor.
  await goto(`${LEGACY}?tab=posts&utm_source=cv#links`);
  await page.getByRole("heading").first().waitFor({ timeout: 15_000 });
  await shot("redirected-with-query");

  const withQuery = new URL(page.url());
  log(`query: "${withQuery.search}"  hash: "${withQuery.hash}"`);
  assert(
    withQuery.pathname === SHORT,
    "a link with a query string still reaches the profile",
  );
  assert(
    withQuery.searchParams.get("utm_source") === "cv" &&
      withQuery.searchParams.get("tab") === "posts",
    "the query string survives the redirect",
  );
  assert(withQuery.hash === "#links", "the fragment survives the redirect");

  /* ── An old link whose handle is now an app route ───────────────────── */
  // `redirect({ to: "/$username" })` builds a TOP-LEVEL path, and the router
  // resolves those against the static routes first. Without the reserved-name
  // guard this would open the real dashboard — an app screen nobody asked for,
  // reached from somebody else's stale link.
  await goto("/profile/dashboard");
  await page.waitForLoadState("networkidle").catch(() => {});
  await shot("reserved-handle");

  const reserved = new URL(page.url());
  log(`/profile/dashboard -> ${reserved.pathname}`);
  assert(
    reserved.pathname !== "/dashboard",
    "a reserved handle is NOT redirected onto the real dashboard",
  );
  assert(
    await page
      .getByText(/404|not found|não encontrado|no encontrado/i)
      .first()
      .isVisible()
      .catch(() => false),
    "a reserved handle renders the app's not-found screen",
  );
}
