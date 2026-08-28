/**
 * The public profile with the tabs section turned OFF — "simple mode".
 *
 *   VISUAL_EXPECT_TABS=on  npm run visual:run -- scripts/visual/scenarios/profile-tabs-toggle.scenario.mjs
 *   VISUAL_EXPECT_TABS=off npm run visual:run -- scripts/visual/scenarios/profile-tabs-toggle.scenario.mjs
 *
 * Kept rather than scratch, because it is the only thing that proves the switch
 * actually changes what a STRANGER sees. Every other check of this feature is a
 * unit test rendering `ProfileBlocks` with a prop — none of them prove the flag
 * survives the database, the API response and the schema parse on the way to a
 * logged-out visitor.
 *
 * The two runs are driven from outside, by flipping the viewport's own column
 * between them, so both directions are exercised against one real profile.
 * `tabs_enabled` is per-viewport — `users.tabs_enabled` no longer exists — and
 * this scenario drives the DESKTOP viewport, so it is the pc column that counts:
 *
 *   psql -c "UPDATE users SET tabs_enabled_pc=false WHERE login='gabrielkochf'"
 *
 * Setting only `tabs_enabled_pc` is deliberate: leaving `tabs_enabled_mobile`
 * true means a passing tabs-off run also proves the two viewports are genuinely
 * independent, all the way through the API and the schema parse.
 *
 * PREREQUISITES: `npm run dev` (web 5173, api 3333) and a seeded database. The
 * profile must have MORE THAN ONE tab, or the assertions are vacuous — the tab
 * strip is already hidden at one tab, so a single-tab profile passes the
 * tabs-off check without the feature existing at all.
 */

/** Public page: captured signed out, exactly as a stranger sees it. */
export const requiresAuth = false;

const USERNAME = process.env.VISUAL_PROFILE_USERNAME || "gabrielkochf";
const PROFILE = `/profile/${USERNAME}`;

/** "on" = tabs expected; "off" = simple mode expected. */
const EXPECT_TABS = (process.env.VISUAL_EXPECT_TABS || "on") === "on";

export default async function profileTabsToggle({
  goto,
  shot,
  assert,
  setTheme,
  page,
  log,
}) {
  const state = EXPECT_TABS ? "tabs-on" : "tabs-off";

  /*
   * Navigate BEFORE the first `setTheme`. `setTheme` registers an init script
   * that writes `localStorage` and then reloads — on `about:blank` that write
   * throws "Access is denied for this document", which the runner rightly
   * reports as an uncaught console error and fails the run on. The document has
   * to be a real origin first.
   */
  await goto(PROFILE);
  // First SPA boot resolves at `load`, before the lazy route chunk paints.
  await page.getByRole("heading").first().waitFor({ timeout: 15_000 });

  for (const theme of ["light", "dark"]) {
    await setTheme(theme);
    await page.getByRole("heading").first().waitFor({ timeout: 15_000 });
    /*
     * The profile blocks enter with `.anim-blur-in` and a staggered
     * `animationDelay`, so a shot taken the instant the heading appears is a
     * picture of the animation, not of the page. The assertions still pass
     * against it — the DOM is there — which is exactly what makes it dangerous:
     * a blurred screenshot looks like evidence and shows nothing.
     *
     * A fixed settle rather than waiting for `getAnimations()` to drain: the
     * page also carries AMBIENT animations (`.anim-float`, `.anim-glow-pulse`)
     * which never finish by design, so that wait can only ever time out. Same
     * approach, and the same reason, as `settings-i18n.scenario.mjs`.
     */
    await page.waitForTimeout(1500);
    await shot(`${state}-${theme}`);

    const tablist = page.getByRole("tablist");
    const tablistCount = await tablist.count();

    if (EXPECT_TABS) {
      assert(
        tablistCount === 1,
        `${theme}: the tab strip renders when tabs are on (found ${tablistCount})`,
      );
      // Guards the guard: if this profile only ever had one tab, the tabs-off
      // run below would pass for a reason that has nothing to do with the flag.
      const tabCount = await page.getByRole("tab").count();
      assert(
        tabCount > 1,
        `${theme}: the fixture profile has more than one tab (found ${tabCount}) — ` +
          "otherwise the tabs-off assertions prove nothing",
      );
    } else {
      assert(
        tablistCount === 0,
        `${theme}: NO tab strip renders when tabs are off (found ${tablistCount})`,
      );
      assert(
        (await page.getByRole("tab").count()) === 0,
        `${theme}: no orphan tab buttons survive with the strip removed`,
      );
    }

    // True in both states: turning tabs off must not blank the page. The first
    // tab's blocks and the pinned zone are still the visitor's whole profile.
    assert(
      await page.getByRole("heading").first().isVisible(),
      `${theme}: the profile still renders its heading`,
    );
    assert(
      !(await page
        .getByText(/undefined|NaN|Invalid Date|\[object Object\]/)
        .first()
        .isVisible()
        .catch(() => false)),
      `${theme}: no undefined/NaN/Invalid Date leaked into the page`,
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      `${theme}: the profile does not scroll horizontally`,
    );
    assert(
      await page.evaluate(
        (expected) =>
          document.documentElement.classList.contains("dark") ===
          (expected === "dark"),
        theme,
      ),
      `${theme}: the requested theme is the one actually painted`,
    );

    log(`${state} / ${theme}: ok`);
  }
}
