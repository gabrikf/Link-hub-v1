/**
 * The Dialog chrome after the close-button restructure.
 *
 * Two things this proves that jsdom cannot:
 *  1. the X lives in its own non-scrolling row, ABOVE the scroll area — so it
 *     can never sit on the body's scrollbar (the reported bug), in either theme
 *     and at both viewports;
 *  2. the appearance preview's avatar is fully visible instead of sliced in half
 *     by the cover strip painted over it.
 */
export const requiresAuth = true;

const geometry = (page) =>
  page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return { missing: "dialog" };
    const header = dialog.querySelector('[data-testid="dialog-header"]');
    const scroller = dialog.querySelector(".overflow-y-auto");
    const close = header?.querySelector("button");
    // Report a missing PART rather than throwing. When someone floats the X
    // back over the body, the header bar disappears — and a TypeError here
    // aborts the run before a single assertion has been evaluated, so the
    // scenario reports "0 passed, 0 failed" instead of naming the regression.
    if (!header) return { missing: "dialog-header" };
    if (!scroller) return { missing: "scroll container" };
    if (!close) return { missing: "close button inside the header" };
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return { top: b.top, right: b.right, bottom: b.bottom, left: b.left };
    };
    return {
      missing: null,
      header: box(header),
      scroller: box(scroller),
      close: box(close),
      scrollable: scroller.scrollHeight > scroller.clientHeight,
      // The gutter the scrollbar would occupy. 0 with overlay scrollbars, ~15
      // with classic ones — the platform the bug was reported on.
      scrollbarWidth: scroller.offsetWidth - scroller.clientWidth,
    };
  });

const isDark = (page) =>
  page.evaluate(() => document.documentElement.classList.contains("dark"));

async function setThemeThroughTheUi(page, wantDark) {
  if ((await isDark(page)) === wantDark) return;
  await page
    .getByRole("button", { name: /switch to (dark|light) theme/i })
    .first()
    .click();
  await page.waitForFunction(
    (want) => document.documentElement.classList.contains("dark") === want,
    wantDark,
    { timeout: 10_000 },
  );
  // Let the PATCH /preferences that the toggle fires actually land, so the next
  // navigation does not get the old preference pushed back over it.
  await page.waitForTimeout(600);
}

const toDarkTheme = (page) => setThemeThroughTheUi(page, true);
const toLightTheme = (page) => setThemeThroughTheUi(page, false);

/**
 * `.dark` on `<html>` is necessary and NOT sufficient — it is exactly what a
 * preference sync removes a moment later. Read a painted colour too, so a theme
 * that flipped back cannot screenshot as a dark page.
 */
async function assertDarkIsReallyPainted(page, assert) {
  await page.waitForTimeout(800);
  const painted = await page.evaluate(() => ({
    hasClass: document.documentElement.classList.contains("dark"),
    background: getComputedStyle(document.body).backgroundColor,
  }));
  assert(painted.hasClass, "dark: the .dark class survived the preference sync");
  // The palette is authored in oklch, so match that first and fall back to rgb.
  // Either way the test is "is the body's ground actually dark", not "does the
  // class say so" — the class is exactly what a preference sync removes.
  const oklch = painted.background.match(/oklch\(\s*([\d.]+)/);
  const rgb = painted.background.match(/rgba?\(\s*(\d+)/);
  const isDarkGround = oklch
    ? Number(oklch[1]) < 0.3
    : rgb
      ? Number(rgb[1]) < 60
      : false;
  assert(
    isDarkGround,
    `dark: the body is actually painted dark (${painted.background})`,
  );
}

async function openEditProfile(page) {
  await page.getByRole("button", { name: /edit profile/i }).first().click();
  await page.getByTestId("profile-appearance-preview").waitFor({
    timeout: 15_000,
  });
}

async function assertCloseIsClearOfTheScrollArea(page, assert, label) {
  const g = await geometry(page);
  assert(
    g.missing === null,
    `${label}: the dialog's chrome is intact (missing: ${g.missing})`,
  );
  if (g.missing !== null) return g;
  assert(g.scrollable, `${label}: the body actually scrolls (the bug's premise)`);
  assert(
    g.close.bottom <= g.scroller.top + 0.5,
    `${label}: the X ends above the scroll area (close.bottom ${g.close.bottom} <= scroller.top ${g.scroller.top})`,
  );
  assert(
    g.header.bottom <= g.scroller.top + 0.5,
    `${label}: the header row does not overlap the scroll area`,
  );
  /*
    The reported bug, restated in the terms it was reported in.

    Headless Chromium draws OVERLAY scrollbars — zero layout width — so the
    overlap the user photographed is literally undrawable here, and a check that
    only looked at what this browser renders would report "looks fine" for the
    exact platform the report came from. So we compute the band a CLASSIC 15px
    scrollbar would occupy (the widest of the three desktop platforms, so a
    button clear of it is clear of every narrower one) and require the X to miss
    it.

    HONEST NOTE ON WHAT THIS ADDS: while the two assertions above hold, this one
    cannot fail — the band starts at `scroller.top`, and the X already ends
    above it. It is kept because it is the only line that says WHY those two
    matter, and because it fails independently if someone ever keeps the header
    row but re-floats the button with a negative margin. The real cross-platform
    guarantee is structural: the scroll area, and therefore its scrollbar of any
    style, begins below the button.
  */
  const CLASSIC_SCROLLBAR_WIDTH = 15;
  const gutter = {
    left: g.scroller.right - CLASSIC_SCROLLBAR_WIDTH,
    right: g.scroller.right,
    top: g.scroller.top,
    bottom: g.scroller.bottom,
  };
  const intersects =
    g.close.right > gutter.left &&
    g.close.left < gutter.right &&
    g.close.bottom > gutter.top &&
    g.close.top < gutter.bottom;
  assert(
    !intersects,
    `${label}: the X misses where a 15px classic scrollbar would be drawn`,
  );

  return g;
}

export default async function dialogChrome({
  goto,
  shot,
  assert,
  resize,
  setTheme,
  page,
  log,
}) {
  /* ── LIGHT, desktop ─────────────────────────────────────────────────── */
  await goto("/dashboard");
  await openEditProfile(page);
  await page.waitForTimeout(500);
  await shot("edit-profile-light");
  const light = await assertCloseIsClearOfTheScrollArea(page, assert, "light");
  log(
    `scrollbar gutter: ${light.scrollbarWidth}px (0 = overlay scrollbars in this browser)`,
  );

  /* ── The avatar the cover used to paint over ─────────────────────────── */
  /*
    A HIT TEST, not a geometry check.

    The straddle on its own proves nothing: the avatar's box overlapped the
    cover's box before the fix too — that is the layout the design asks for, and
    it is exactly why every DOM assertion stayed green while a human saw a
    circle sliced in half. The defect was PAINT ORDER: the cover strip is
    `relative` with `z-index: auto`, so it painted in the positioned-descendant
    step, after the static row beneath it.

    `elementFromPoint` follows paint order. Sampling three points across the
    avatar's top arc — the part that lives over the cover — asks the browser the
    only question that matters: at these pixels, what is the person actually
    looking at? Before the fix the answer is the cover's image or its scrim;
    after it, the avatar.
  */
  const avatarPaint = await page.evaluate(() => {
    const preview = document.querySelector(
      '[data-testid="profile-appearance-preview"]',
    );
    const cover = preview.querySelector('[data-testid="profile-cover-strip"]');
    // The avatar's ring wrapper: the only rounded-full span in the card body.
    const avatar = preview.querySelector(".-mt-10 span.rounded-full");
    const avatarRect = avatar.getBoundingClientRect();
    const coverRect = cover.getBoundingClientRect();

    // Three points inside the circle and above the cover's lower edge. The
    // horizontal offsets stay well inside the arc so a point cannot fall
    // outside the rounded shape.
    const y = Math.min(
      avatarRect.top + avatarRect.height * 0.25,
      coverRect.bottom - 2,
    );
    const samples = [0.35, 0.5, 0.65].map((fraction) => {
      const x = avatarRect.left + avatarRect.width * fraction;
      const hit = document.elementFromPoint(x, y);
      return {
        x: Math.round(x),
        y: Math.round(y),
        // Is what the browser hands back the avatar, or something inside it?
        onAvatar: hit !== null && avatar.contains(hit),
        // What IS on top, when it is not the avatar. Named so a failure says
        // which element stole the pixels.
        hit: hit
          ? `${hit.tagName.toLowerCase()}${
              hit.dataset?.testid ? `[${hit.dataset.testid}]` : ""
            }`
          : "nothing",
      };
    });

    return {
      samples,
      straddles:
        avatarRect.top < coverRect.bottom && avatarRect.bottom > coverRect.bottom,
      sampleAboveCoverEdge: y < coverRect.bottom,
    };
  });

  assert(
    avatarPaint.straddles,
    "the avatar straddles the cover's lower edge, as the design asks",
  );
  assert(
    avatarPaint.sampleAboveCoverEdge,
    "the sampled points really are on the part of the avatar that overlaps the cover",
  );
  for (const sample of avatarPaint.samples) {
    assert(
      sample.onAvatar,
      `the avatar owns its own pixels at (${sample.x}, ${sample.y}) — topmost element is ${sample.hit}`,
    );
  }

  await page
    .getByTestId("profile-appearance-preview")
    .screenshot({ path: ".visual/dialog-chrome-preview-light.png" });

  /* ── Scrolled to the bottom: the X must not have moved ───────────────── */
  await page.evaluate(() => {
    document.querySelector('[role="dialog"] .overflow-y-auto').scrollTop = 99999;
  });
  await page.waitForTimeout(300);
  await shot("edit-profile-light-scrolled");
  const scrolled = await geometry(page);
  assert(
    Math.abs(scrolled.close.top - light.close.top) < 0.5,
    "the X stays pinned while the body scrolls to the bottom",
  );

  /* ── DARK ────────────────────────────────────────────────────────────── */
  /*
   * Through the REAL toggle in the top bar, not `setTheme`'s localStorage seed.
   *
   * On a signed-in screen the seed does not survive: `preferences-sync.ts`
   * pulls the account's saved theme from `/preferences` and applies it a beat
   * after boot, so a localStorage-seeded dark page flips back to light before
   * the screenshot — silently, with `.dark` present on `<html>` for just long
   * enough to make an assertion pass. Clicking the control persists the
   * preference, which is what makes it stick.
   */
  // Fresh navigation first: the previous section left a modal open, and Radix
  // traps focus inside it, so the top bar's toggle is unreachable until it goes.
  await goto("/dashboard");
  await toDarkTheme(page);
  await assertDarkIsReallyPainted(page, assert);
  await openEditProfile(page);
  await page.waitForTimeout(500);
  await shot("edit-profile-dark");
  await assertCloseIsClearOfTheScrollArea(page, assert, "dark");
  await page
    .getByTestId("profile-appearance-preview")
    .screenshot({ path: ".visual/dialog-chrome-preview-dark.png" });

  /* ── PHONE — the viewport the X is the primary way out on ────────────── */
  await resize(390, 844);
  await goto("/dashboard");
  await openEditProfile(page);
  await page.waitForTimeout(500);
  await shot("edit-profile-phone-dark");
  await assertCloseIsClearOfTheScrollArea(page, assert, "phone");

  // Back to the desktop viewport to flip the theme: at 390px the top bar
  // collapses into the hamburger menu and the toggle moves inside it, so the
  // bar-variant control this helper clicks is not on screen.
  await resize(1440, 900);
  await goto("/dashboard");
  await toLightTheme(page);

  await resize(390, 844);
  await goto("/dashboard");
  await openEditProfile(page);
  await page.waitForTimeout(500);
  await shot("edit-profile-phone-light");
  await assertCloseIsClearOfTheScrollArea(page, assert, "phone light");
}
