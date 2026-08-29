/**
 * The i18n check — the public profile in all three locales, both themes.
 *
 *   npm run visual:run -- scripts/visual/scenarios/i18n-locales.scenario.mjs
 *
 * Why this screen: `/profile/:username` is the page strangers open, it needs no
 * session, and it renders the widest mix of shared vocabulary — headings, empty
 * states, badges, work history, resume details. If a key is missing anywhere,
 * it is most likely to be visible here and most expensive to leave broken.
 *
 * The two things it asserts that a human eye is bad at:
 *
 *   1. NO RAW KEYS. A missing key renders as `common.save` rather than as
 *      nothing (`returnNull: false` in apps/web/src/i18n/index.ts), which is
 *      deliberately ugly — and this regex is what makes that ugliness fail a
 *      run instead of merely looking odd in a screenshot.
 *   2. NO SIDEWAYS SCROLL. Portuguese and Spanish run roughly 15-25% longer
 *      than English. A button sized to "Save" splits or overflows at "Guardar
 *      cambios", and that is invisible to anyone developing in English.
 *
 * PREREQUISITES: `npm run dev` (web on 5173, api on 3333) and a seeded database
 * (`bash db-manage.sh start && bash db-manage.sh seed-all`).
 */

export const requiresAuth = false;

const USERNAME = process.env.VISUAL_PROFILE_USERNAME || "seed-react-frontend-003";
const PROFILE = `/profile/${USERNAME}`;

/** The three locales, and the `<html lang>` each one must produce. */
const LOCALES = ["en-US", "pt-BR", "es-ES"];

/**
 * Every top-level namespace in the catalogue. A raw key on screen looks like
 * `common.save` or `wizard.verify.connected`, and nothing else in the product's
 * copy is a lowercase word followed by a dot and another lowercase word — the
 * closest false positive would be a domain name, which the `\b` and the
 * namespace list rule out.
 */
const RAW_KEY = new RegExp(
  "\\b(common|enum|nav|errors|notFound|auth|image|dialog|dashboard|links|work|" +
    "resumeImport|profile|posts|resume|layout|search|settings|wizard)" +
    "\\.[a-zA-Z][a-zA-Z0-9_.-]*\\b",
);

/**
 * The profile's entry animations (`anim-blur-in`, `anim-fade-in`) run for a few
 * hundred milliseconds after the heading mounts. Screenshotting before they
 * settle produces a blurred page — evidence of nothing, and the exact failure
 * mode this whole check exists to avoid.
 */
async function settle(page) {
  await page.getByRole("heading").first().waitFor({ timeout: 15_000 });
  // Await the animations that have already started, then a fixed grace period
  // for the staggered ones that had not been created yet when `getAnimations()`
  // was sampled. Without the second half, the shot taken right after a
  // theme-change reload catches the blur mid-flight.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        void Promise.all(
          document.getAnimations().map((animation) => animation.finished),
        )
          .then(() => resolve(undefined))
          .catch(() => resolve(undefined));
        setTimeout(resolve, 2000);
      }),
  );
  await page.waitForTimeout(1200);
}

export default async function i18nLocales({
  goto,
  shot,
  assert,
  setTheme,
  page,
  log,
}) {
  /* ── The switcher itself, driven the way a user drives it ───────────── */
  // FIRST, before the locale sweep below: that sweep works by stacking
  // `addInitScript` calls, and Playwright replays every one of them on every
  // later navigation — so a reload after the sweep would re-apply the last
  // locale it set and this persistence check would be testing the harness
  // rather than the app.
  await goto(PROFILE);
  await settle(page);

  const group = page.getByRole("group", { name: /language|idioma/i });
  assert(
    await group.isVisible().catch(() => false),
    "switcher: the language control is on screen for a signed-out visitor",
  );

  await group.getByRole("button", { name: /português/i }).click();
  await page.waitForFunction(
    () => document.documentElement.lang === "pt-BR",
    undefined,
    { timeout: 5_000 },
  );
  await shot("switcher-switched-to-pt");
  assert(
    await page.evaluate(() => document.documentElement.lang === "pt-BR"),
    "switcher: clicking Português updates <html lang> without a reload",
  );
  assert(
    await page.evaluate(
      () => window.localStorage.getItem("crafthub-language") === "pt-BR",
    ),
    "switcher: the choice is persisted next to crafthub-theme",
  );

  // And it survives a reload, which is the whole point of persisting it.
  await goto(PROFILE);
  await settle(page);
  assert(
    await page.evaluate(() => document.documentElement.lang === "pt-BR"),
    "switcher: the choice survives a reload",
  );

  for (const locale of LOCALES) {
    // Through localStorage, exactly as `setTheme` does it, so the assertion
    // exercises the real bootstrap in apps/web/src/lib/language.ts rather than
    // a value forced in after the fact.
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      ["crafthub-language", locale],
    );

    await goto(PROFILE);
    await settle(page);
    await shot(`${locale}-light`);

    const htmlLang = await page.evaluate(() => document.documentElement.lang);
    log(`${locale}: <html lang> = ${htmlLang}`);
    assert(
      htmlLang === locale,
      `${locale}: <html lang> follows the active language (got "${htmlLang}")`,
    );

    const bodyText = await page.evaluate(() => document.body.innerText);
    const leakedKey = bodyText.match(RAW_KEY);
    assert(
      leakedKey === null,
      `${locale}: no raw translation key rendered${leakedKey ? ` — found "${leakedKey[0]}"` : ""}`,
    );

    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      `${locale}: the page does not scroll horizontally`,
    );

    await setTheme("dark");
    await settle(page);
    await shot(`${locale}-dark`);
    assert(
      await page.evaluate(() =>
        document.documentElement.classList.contains("dark"),
      ),
      `${locale}: dark mode still applies`,
    );
    await setTheme("light");
  }
}
