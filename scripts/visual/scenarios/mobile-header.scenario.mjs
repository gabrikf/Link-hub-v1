/**
 * The mobile header chrome, in both themes.
 *
 * Two things here are invisible to a unit test and to a light-mode-only eye:
 * a hamburger that has to read as INK on the bar rather than as a bordered
 * chip, and a theme switch whose knob has to actually travel — plus the label
 * beside it, whose longest translation is what decides how much room the knob
 * may take. Both are measured rather than eyeballed.
 *
 *   npm run visual:run -- scripts/visual/scenarios/mobile-header.scenario.mjs
 *
 * NOTHING HERE ASSUMES THE ACCOUNT'S STORED PREFERENCES. Theme and language
 * are server-side per user (`usePreferencesSync`), so a scenario that set
 * `localStorage` and then asserted on an English string in light mode was
 * really asserting that the last run had tidied up after itself. This one
 * reads the painted theme off `<html>` and drives the switch to get where it
 * wants to be — which is also the path a person takes.
 */
export const requiresAuth = true;

const PHONE = { width: 390, height: 844 };

/** The narrowest screen still worth supporting, and the one the longest
 *  translation ("Mudar para o tema escuro") runs out of room on first. */
const NARROWEST = 320;

const HAMBURGER = /Open menu|Abrir menu|Abrir menú/;

export default async function ({ goto, shot, assert, resize, page, log }) {
  await resize(PHONE.width, PHONE.height);

  /* `/dashboard/posts` rather than `/dashboard`: the seeded recruiter has no
     resume, so the dashboard's own 404 would be reported as a bad request and
     fail a run that has nothing to do with it. */
  const openSheet = async () => {
    const hamburger = page.getByRole("button", { name: HAMBURGER });
    // `waitFor`, not `isVisible()`: the latter answers immediately and calls a
    // React tree that has not committed yet "not visible".
    await hamburger.waitFor({ state: "visible" });
    if ((await hamburger.getAttribute("aria-expanded")) !== "true") {
      await hamburger.click();
      await page.waitForTimeout(400);
    }
    return hamburger;
  };

  /** What is actually painted, not what anything was asked for. */
  const paintedTheme = () =>
    page.evaluate(() =>
      document.documentElement.classList.contains("dark") ? "dark" : "light",
    );

  const themeSwitch = () =>
    page
      .getByRole("button", {
        name: /Switch to (light|dark) theme|Mudar para o tema|Cambiar al tema/,
      })
      .last();

  await goto("/dashboard/posts");
  await openSheet();

  /* English first, and by its ENDONYM — the one button label that reads the
     same whichever locale the account happens to be left in. */
  await page.getByRole("button", { name: "English" }).click();
  await page.waitForTimeout(400);

  // Start from light whatever the account was storing.
  if ((await paintedTheme()) === "dark") {
    await themeSwitch().click();
    await page.waitForTimeout(500);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  for (const theme of ["light", "dark"]) {
    assert((await paintedTheme()) === theme, `${theme}: is the painted theme`);

    const hamburger = page.getByRole("button", { name: HAMBURGER });
    await hamburger.waitFor({ state: "visible" });

    const paint = await hamburger.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        borderWidth: style.borderTopWidth,
        background: style.backgroundColor,
        color: style.color,
      };
    });
    log(`${theme}: hamburger ${JSON.stringify(paint)}`);
    assert(paint.borderWidth === "0px", `${theme}: hamburger draws no border`);
    assert(
      /rgba\(0, 0, 0, 0\)|transparent/.test(paint.background),
      `${theme}: hamburger draws no background`,
    );
    await shot(`${theme}-bar`, {
      clip: { x: 0, y: 0, width: PHONE.width, height: 64 },
    });

    await openSheet();
    await shot(`${theme}-sheet`);

    const row = themeSwitch();
    await row.waitFor({ state: "visible" });
    const box = await row.boundingBox();
    const knobX = () =>
      row.evaluate((el) => {
        const knob = el.querySelector("span[aria-hidden='true']");
        return knob.getBoundingClientRect().x - el.getBoundingClientRect().x;
      });

    const before = await knobX();
    log(
      `${theme}: switch ${Math.round(box.width)}x${Math.round(box.height)}, knob at ${Math.round(before)}px`,
    );
    assert(
      theme === "light" ? before < 8 : before > box.width / 2,
      `${theme}: knob parks on the ${theme === "light" ? "sun" : "moon"} end`,
    );
    await shot(`${theme}-switch`, { target: row });

    // Pressing it is what moves BOTH the knob and the page into the next
    // theme, which is the next turn of this loop.
    await row.click();
    await page.waitForTimeout(500);
    const after = await knobX();
    log(`${theme}: knob travelled to ${Math.round(after)}px`);
    assert(
      Math.abs(after - before) > box.width / 3,
      `${theme}: knob travels to the other end when pressed`,
    );
    await shot(`${theme}-switch-pressed`, { target: row });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }

  /*
   * The label decides the layout, so it is checked in the language that makes
   * it longest, on the screen that gives it least. A clipped label here means
   * the knob's gutter has grown, not that the translation is too long.
   */
  await openSheet();
  for (const [language, label] of [
    ["Português", /Mudar para o tema/],
    ["Español", /Cambiar al tema/],
  ]) {
    await page.getByRole("button", { name: language }).click();
    await page.waitForTimeout(400);
    await resize(NARROWEST, 568);
    await page.waitForTimeout(200);

    const row = page.getByRole("button", { name: label }).last();
    await row.waitFor({ state: "visible" });
    const box = await row.boundingBox();
    const fits = await row
      .locator("span")
      .last()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        const gutters =
          parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        return {
          needs: Math.round(el.scrollWidth - gutters),
          has: Math.round(el.clientWidth - gutters),
        };
      });

    log(
      `${language} @${NARROWEST}px: label needs ${fits.needs}px, has ${fits.has}px`,
    );
    assert(
      fits.needs <= fits.has,
      `${language}: label is not clipped at ${NARROWEST}px`,
    );
    assert(
      Math.round(box.height) === 44,
      `${language}: row is still one 44px line`,
    );
    await shot(`${NARROWEST}-${language}`, { target: row });

    await resize(PHONE.width, PHONE.height);
    await page.waitForTimeout(200);
  }

  // Leave the account on English so the next run starts where this one did.
  await page.getByRole("button", { name: "English" }).click();
  await page.waitForTimeout(400);
}
