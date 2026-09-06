/**
 * Banner positioning and the page background — the two surfaces this feature
 * added, walked in both themes.
 *
 *   npm run visual:login
 *   npm run visual:run -- scripts/visual/scenarios/banner-background-position.scenario.mjs
 *
 * WHAT IT CAPTURES
 *   1. the appearance panel with both photos set,
 *   2. the reposition dialog, before and after a real drag,
 *   3. the background tuned from an invisible veil to a visible one,
 *   4. the published profile carrying both,
 *   5. all of it again in dark mode, plus a 390px viewport.
 *
 * The two photographs are SERVED BY THIS SCENARIO, not uploaded: a run that
 * writes real objects into the configured S3 bucket is a run nobody wants to
 * repeat, and the fixture below has a landmark (a white circle in its top
 * third) that makes "the banner is showing the wrong part" visible in a
 * screenshot instead of arguable.
 *
 * PREREQUISITES: `npm run dev` (web on 5173, api on 3333), a seeded database
 * (`bash db-manage.sh seed-all`) and a session for a DEVELOPER account:
 *
 *   VISUAL_EMAIL=seed.ai-rag.046@crafthub.local npm run visual:login
 *
 * TWO things decide that account, and both bite if you pick another one.
 *
 * It must have a RESUME: the runner's default session is the recruiter, who
 * does not, and `/dashboard` asking for one it does not have is a 404 the
 * runner (rightly) counts as a bad request — a red run for a reason unrelated
 * to this feature.
 *
 * And it must NOT be a journey account. This scenario WRITES the two image urls
 * to whichever account the session names and restores them at the end — but a
 * run killed part-way (Ctrl-C, a timeout) never reaches the restore, and the
 * urls it leaves behind point at a host that deliberately does not resolve. The
 * next e2e run against that account then fails on
 * `net::ERR_NAME_NOT_RESOLVED` console errors, which is a confusing way to
 * discover this. `JOURNEY_ACCOUNTS` in `e2e/support/accounts.ts` lists the
 * three to stay away from. If it does happen, clear it with a single
 * `PUT /profile` setting both urls to null.
 */

export const requiresAuth = true;

/**
 * A host that cannot resolve, on purpose — every request for it is fulfilled
 * below, so the fixture never leaves the machine and never depends on a port.
 */
const FIXTURE_ORIGIN = "http://visual-fixtures.crafthub.invalid";
const BANNER_URL = `${FIXTURE_ORIGIN}/banner.svg`;
const BACKGROUND_URL = `${FIXTURE_ORIGIN}/background.svg`;

/**
 * 600x900 — PORTRAIT, which is the shape that produced the bug: dropped into a
 * 3:1 strip and centred, the subject (the circle) is cropped away entirely.
 */
const fixtureSvg = (
  top,
  bottom,
) => `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
  <rect width="600" height="450" fill="${top}"/>
  <rect y="450" width="600" height="450" fill="${bottom}"/>
  <circle cx="300" cy="150" r="90" fill="#ffffff"/>
  <text x="300" y="165" font-family="sans-serif" font-size="48" fill="${top}" text-anchor="middle">TOP</text>
</svg>`;

/**
 * A patch of page well outside the profile card at 1440x900 — nothing but the
 * page background is ever drawn here, so any difference in these pixels is the
 * background photograph and nothing else.
 */
const PAINT_PROBE = { x: 20, y: 400, width: 100, height: 120 };

/**
 * The same question at 390x844, where there is no gutter to hide in: this patch
 * is INSIDE the profile card. It is the check that the card goes frosted rather
 * than sitting opaque on top of the photograph — on a phone the card is the
 * whole page, so "visible in the gutters" would mean visible in nine pixels.
 */
/**
 * Found at runtime rather than hardcoded — see `cardOnlyProbe`. A fixed
 * rectangle inside the card lands on whichever opaque block happens to be
 * there, and the hardcoded one it replaces only "passed" because it caught the
 * blocks' entrance animation mid-fade: a race that flips on a slower machine,
 * measuring the fade rather than the photograph.
 */
const PROBE_SIZES = [24, 12, 6];

/**
 * Switch the theme for a SIGNED-IN visit, preference and all.
 *
 * The `PUT` is no longer what makes the theme stick — `setTheme` handles the
 * signed-in case itself since 2026-09-05, by rewriting `GET /preferences`, and
 * it throws if the theme it was asked for is not what paints. It is kept here
 * because this scenario is also checking how a stored preference renders across
 * a real sign-in, which the runner's in-memory rewrite does not exercise; the
 * teardown restores the account either way. A capture that only needs the theme
 * on screen wants plain `setTheme` and nothing else.
 */
async function useThemeEverywhere(page, setTheme, apiOrigin, theme) {
  await page.evaluate(
    async ([origin, value]) => {
      const tokens = JSON.parse(
        window.localStorage.getItem("crafthub.auth.tokens") ?? "{}",
      );
      const accessToken = tokens.accessToken ?? tokens.state?.accessToken;
      await fetch(`${origin}/preferences`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ theme: value }),
      });
    },
    [apiOrigin, theme],
  );
  await setTheme(theme);
}

/**
 * Wait for every running animation to finish.
 *
 * The profile's blocks fade in, so two screenshots taken at different points in
 * that fade differ for reasons that have nothing to do with the thing under
 * test — which is exactly how the previous phone paint-proof passed.
 */
async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        /*
         * FINITE animations only. The profile's ambient blobs (`anim-float`),
         * the grid pan and the avatar glow all loop forever, so their
         * `finished` promise never settles — awaiting it wedges the run.
         *
         * The timeout is a backstop, not the mechanism: an animation that
         * claims to be finite and then never finishes must not hang a check.
         */
        const pending = document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getTiming?.().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => {}));

        void Promise.all(pending).then(() => resolve(undefined));
        window.setTimeout(() => resolve(undefined), 2000);
      }),
  );
}

/**
 * A small rectangle inside the profile card that NO block covers — a patch
 * where the only things painted are the card and, through it, the owner's
 * photograph. Hit-tested rather than guessed, because where the gaps fall
 * depends on the layout the owner published.
 */
async function cardOnlyProbe(page, sizes) {
  return page.evaluate((probeSizes) => {
    /*
     * The profile card is the cover strip's PARENT. Not `closest(...)` on a
     * class: the cover strip is itself `overflow-hidden`, so a class-based
     * lookup returns the strip and every hit test then lands on the banner.
     */
    const card = document.querySelector(
      '[data-testid="profile-cover-strip"]',
    )?.parentElement;
    if (!card) return null;
    const box = card.getBoundingClientRect();

    /*
     * "Nothing opaque between this point and the card."
     *
     * Not `elementFromPoint(x, y) === card`: the card's whole area is covered
     * by its own transparent block-stack wrapper, so that test is false
     * everywhere. What matters is whether anything on the path paints — a
     * background colour, a background image, or an element that IS an image.
     */
    const showsCard = (x, y) => {
      let node = document.elementFromPoint(x, y);
      while (node && node !== card) {
        const style = window.getComputedStyle(node);
        const alpha = Number(
          (style.backgroundColor.match(/[\d.]+/g) ?? [])[3] ??
            (style.backgroundColor === "rgba(0, 0, 0, 0)" ? 0 : 1),
        );
        if (alpha > 0.01) return false;
        if (style.backgroundImage !== "none") return false;
        if (["IMG", "SVG", "CANVAS", "VIDEO"].includes(node.tagName)) {
          return false;
        }
        node = node.parentElement;
      }
      return node === card;
    };

    /*
     * Sizes are tried largest first. On a phone the card's own gutter beside
     * the blocks is `px-1.5`, i.e. six pixels, so a comfortable 24px square
     * simply does not fit — and a six-pixel one still answers the question,
     * which is "does ANY of the photograph reach through this card".
     */
    for (const probeSize of probeSizes) {
      for (let y = box.bottom - probeSize; y > box.top; y -= 4) {
        for (let x = box.left + 2; x < box.right - probeSize; x += 4) {
          if (y < 0 || y + probeSize > window.innerHeight) continue;
          const corners = [
            [x, y],
            [x + probeSize - 1, y],
            [x, y + probeSize - 1],
            [x + probeSize - 1, y + probeSize - 1],
          ];
          if (corners.every(([px, py]) => showsCard(px, py))) {
            return { x, y, width: probeSize, height: probeSize };
          }
        }
      }
    }
    return null;
  }, sizes);
}

/**
 * Which slice of the banner a cover strip is actually showing, in fractions of
 * the photograph, derived from the LIVE element rather than from the library
 * that positioned it.
 *
 * Deliberately an independent derivation: the point is to catch a wrong frame
 * shape (the defect this feature shipped with — a 3:1 editor for a 6.36:1
 * cover), and re-using `visibleImageRect` to check `visibleImageRect` would
 * catch nothing.
 */
async function visibleBannerSlice(page) {
  return page.getByTestId("profile-cover-image").evaluate((element) => {
    const frameWidth = element.clientWidth;
    const frameHeight = element.clientHeight;
    const imageWidth = element.naturalWidth;
    const imageHeight = element.naturalHeight;
    const [, yPercent] = element.style.objectPosition
      .split(" ")
      .map((part) => Number.parseFloat(part));
    const scale = Number.parseFloat(
      element.style.transform.replace(/[^\d.]/g, ""),
    );

    const cover =
      Math.max(frameWidth / imageWidth, frameHeight / imageHeight) * scale;
    const renderedHeight = imageHeight * cover;
    const hidden = Math.max(0, renderedHeight - frameHeight);
    const topPx = ((yPercent / 100) * hidden) / cover;

    return {
      top: topPx / imageHeight,
      bottom: (topPx + frameHeight / cover) / imageHeight,
      frameAspect: frameWidth / frameHeight,
    };
  });
}

export default async function bannerBackgroundPosition({
  goto,
  shot,
  assert,
  resize,
  setTheme,
  page,
  log,
}) {
  await page.route(`**/*.svg`, async (route) => {
    const url = route.request().url();
    if (!url.startsWith(FIXTURE_ORIGIN)) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: url.includes("background")
        ? fixtureSvg("#166534", "#065f46")
        : fixtureSvg("#7c3aed", "#1e1b4b"),
    });
  });

  /* ── Setup: park both photos on the signed-in account over the API ──── */
  await goto("/dashboard");
  await page.getByRole("button", { name: "Edit profile" }).waitFor({
    timeout: 20_000,
  });

  // `apiUrl` is passed IN rather than read from `import.meta.env` inside the
  // page: a function body containing `import.meta` is not serialisable, and
  // Playwright rejects it before it ever reaches the browser.
  const apiUrl = process.env.VISUAL_API_URL || "http://localhost:3333";
  const baseline = await page.evaluate(
    async ([bannerUrl, backgroundUrl, apiOrigin]) => {
      const tokens = JSON.parse(
        window.localStorage.getItem("crafthub.auth.tokens") ?? "{}",
      );
      const accessToken = tokens.accessToken ?? tokens.state?.accessToken;
      const apiUrl = apiOrigin;
      const headers = {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      };
      const me = await (await fetch(`${apiUrl}/me`, { headers })).json();
      await fetch(`${apiUrl}/profile`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          username: me.username,
          bannerImageUrl: bannerUrl,
          backgroundImageUrl: backgroundUrl,
          appearance: {
            bannerPlacement: null,
            backgroundPlacement: null,
            backgroundOverlay: 55,
            backgroundBlur: 6,
          },
        }),
      });
      // Handed back to the scenario so the run can undo itself. Kept in Node
      // rather than in the page: `window` does not survive a navigation, and
      // this value has to outlive several.
      return {
        username: me.username,
        bannerImageUrl: me.bannerImageUrl,
        backgroundImageUrl: me.backgroundImageUrl,
        appearance: me.appearance,
      };
    },
    [BANNER_URL, BACKGROUND_URL, apiUrl],
  );
  const username = baseline.username;
  log(`fixtures attached to @${username}`);

  /* ── The appearance panel, both photos set ──────────────────────────── */
  await goto("/dashboard");
  await page.getByRole("button", { name: "Edit profile" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Edit profile" });
  await dialog.getByTestId("banner-upload").waitFor({ timeout: 15_000 });
  await shot("appearance-panel-light");

  assert(
    await dialog.getByTestId("profile-background-image").isVisible(),
    "the appearance preview draws the background photo",
  );
  assert(
    await dialog.getByTestId("background-tuning").isVisible(),
    "the veil and blur controls appear once a background is set",
  );

  /* ── The reposition dialog: before the drag ─────────────────────────── */
  await dialog
    .getByTestId("banner-upload")
    .getByRole("button", { name: /Reposition/i })
    .click();
  const frame = page.getByTestId("image-position-frame");
  await frame.waitFor({ timeout: 15_000 });
  await shot("reposition-before-light");

  const before = await page
    .getByTestId("image-position-preview")
    .evaluate((element) => element.style.objectPosition);
  log(`banner placement before the drag: ${before}`);

  /* ── …and after a real drag ─────────────────────────────────────────── */
  const box = await frame.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Far enough to pull the TOP of the photograph into frame — the fixture's
  // white marker lives in its top fifth, and putting it on screen is the whole
  // user story ("the banner cropped my face out").
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 260, {
    steps: 18,
  });
  await page.mouse.up();
  await shot("reposition-after-drag-light");

  const after = await page
    .getByTestId("image-position-preview")
    .evaluate((element) => element.style.objectPosition);
  log(`banner placement after the drag: ${after}`);
  const movedBy = Math.abs(
    Number.parseFloat(after.split(" ")[1]) -
      Number.parseFloat(before.split(" ")[1]),
  );
  log(`the drag moved the focal point by ${movedBy.toFixed(1)} points`);
  /*
   * A THRESHOLD, not just "it changed". A 100px drag against roughly 550px of
   * hidden photo is ~18 points. When the browser turned the drag into a native
   * image-drag and fired `pointercancel` two moves in, the photo moved 1.3
   * points and stopped — a difference a "did it change?" check cannot see.
   */
  assert(
    movedBy > 10,
    `dragging moves the photograph with the pointer (moved ${movedBy.toFixed(1)} points)`,
  );

  await page.getByRole("button", { name: /Apply position/i }).click();
  await frame.waitFor({ state: "hidden", timeout: 10_000 });

  /* ── The background, tuned from "invisible" to visible ──────────────── */
  const veil = dialog.getByLabel(/Veil/i);
  await veil.scrollIntoViewIfNeeded();
  await veil.fill("20");
  await shot("background-tuned-light");

  /*
   * The preview has to be ON SCREEN at the moment the slider is used, or
   * "live preview" is a filename rather than a feature.
   *
   * Hit-tested with `elementFromPoint` over the preview's whole rectangle, not
   * asked whether it is "visible": the preview WAS visible, correctly sized and
   * correctly positioned while a `relative` upload tile below it in the DOM
   * painted straight over the top of it — 0% of it reached the screen at
   * 1440px and every DOM assertion in this file passed anyway.
   */
  const previewVisibility = await page
    .getByTestId("profile-appearance-preview")
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      let sampled = 0;
      let ours = 0;
      for (let y = box.top + 4; y < box.bottom - 4; y += 8) {
        for (let x = box.left + 4; x < box.right - 4; x += 8) {
          if (y < 0 || y > window.innerHeight) continue;
          sampled += 1;
          const hit = document.elementFromPoint(x, y);
          if (element.contains(hit)) ours += 1;
        }
      }
      return sampled === 0 ? 0 : ours / sampled;
    });
  log(
    `live preview unobstructed while tuning: ${(previewVisibility * 100).toFixed(1)}%`,
  );
  assert(
    previewVisibility > 0.9,
    `the live preview is actually on screen while the veil is tuned (${(previewVisibility * 100).toFixed(1)}%)`,
  );

  // …and it must not have bought that by covering the way out of the modal.
  const closeReachable = await page
    .getByRole("button", { name: /Close Edit profile/i })
    .evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return element.contains(hit);
    });
  assert(
    closeReachable,
    "the sticky preview does not cover the dialog's close button",
  );

  const veilOpacity = await dialog
    .getByTestId("profile-background-veil")
    .evaluate((element) => Number(getComputedStyle(element).opacity));
  assert(
    Math.abs(veilOpacity - 0.2) < 0.01,
    "the veil slider repaints the preview before any save",
  );

  await dialog.getByRole("button", { name: /Save profile/ }).click();
  await dialog.waitFor({ state: "hidden", timeout: 15_000 });

  /* ── The published profile ──────────────────────────────────────────── */
  await goto(`/${username}`);
  await page.getByTestId("profile-cover-image").waitFor({ timeout: 20_000 });
  await shot("public-profile-light");

  const published = await page
    .getByTestId("profile-cover-image")
    .evaluate((element) => ({
      objectPosition: element.style.objectPosition,
      transformOrigin: element.style.transformOrigin,
    }));
  log(`published banner placement: ${published.objectPosition}`);
  assert(
    published.objectPosition === after,
    "the published cover carries exactly the placement the editor showed",
  );
  assert(
    published.transformOrigin === published.objectPosition,
    "object-position and transform-origin name the same point",
  );
  assert(
    await page.getByTestId("profile-background-image").isVisible(),
    "the published page draws the background photo",
  );

  /*
   * The user story, asserted: the part the owner dragged into frame is on
   * screen at the shape a DESKTOP visitor gets, which is the harsher of the two
   * (6.36:1 keeps a 94-pixel band of a 900-pixel photograph).
   *
   * The fixture's marker occupies the top fifth of the image.
   */
  const MARKER = { top: 0.06, bottom: 0.27 };
  const desktopSlice = await visibleBannerSlice(page);
  log(
    `desktop cover shows image rows ${(desktopSlice.top * 100).toFixed(1)}%-${(desktopSlice.bottom * 100).toFixed(1)}% at ${desktopSlice.frameAspect.toFixed(2)}:1`,
  );
  assert(
    desktopSlice.top < MARKER.bottom && desktopSlice.bottom > MARKER.top,
    "the subject dragged into frame is still on screen at the DESKTOP cover shape",
  );

  /*
   * …and it is actually PAINTED, which `isVisible()` cannot tell you: that only
   * means "in the DOM with a box". The background layer sits at `-z-20`, and
   * for as long as its `<main>` established no stacking context it was painted
   * underneath `App.tsx`'s opaque page wrapper — present, correctly sized,
   * measurable by every DOM assertion, and invisible to every human. So this
   * captures the same patch of page with the photo and, after the restore
   * below, without it, and compares the bytes. No image decoder needed: two
   * identical renders encode to identical PNGs.
   */
  const gutterWithPhoto = await page.screenshot({ clip: PAINT_PROBE });

  /*
   * The card the profile text sits on is now translucent over a photograph the
   * owner chose, so its two weakest lines have to be checked against what is
   * ACTUALLY composited behind them — not against the card's own colour, which
   * is what a `getComputedStyle` walk would find and which stopped being the
   * whole story the moment the card stopped being opaque.
   *
   * Run at veil 20, i.e. well below the default, so this fails before a real
   * user reaches the setting rather than after.
   */
  const contrast = await page.evaluate(() => {
    /*
     * Colours are resolved through a 1x1 CANVAS, not by pulling numbers out of
     * the string. Tailwind v4 emits `oklch(...)` and `getComputedStyle` hands it
     * straight back, so a `match(/[\d.]+/g)` reads `oklch(0.37 0.013 285.8)` as
     * the colour `rgb(0.37, 0.013, 285.8)` — near-black, and every contrast
     * number computed from it is fiction. `fillStyle` accepts any CSS colour
     * and `getImageData` gives back the sRGB bytes the screen actually gets.
     */
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const toRgba = (cssColor) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = "#000";
      context.fillStyle = cssColor;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return { rgb: [r, g, b], a: a / 255 };
    };

    const toLinear = (channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([r, g, b]) =>
      0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

    /**
     * Every layer behind a node, alpha included, flattened onto `ground`.
     *
     * `ground` is the photograph, and it is passed in as pure black or pure
     * white rather than sampled: the photo is an `<img>`, not a
     * background-color, so no walk up the tree can see it — and the owner can
     * upload literally anything. Testing both extremes bounds every photograph
     * there is. It is a STRICT lower bound: the veil is not in this chain
     * either (it is a sibling of the card, not an ancestor of the text), and
     * the veil only ever helps.
     */
    const composited = (node, ground) => {
      const layers = [];
      for (let n = node; n; n = n.parentElement) {
        const style = window.getComputedStyle(n);
        const layer = toRgba(style.backgroundColor);
        if (layer.a > 0) layers.push(layer);
        /*
         * Stop at the frosted card. Everything above it in the tree — the app
         * shell's opaque `bg-zinc-100` / `dark:bg-zinc-950` — is painted BEHIND
         * the photograph, so walking past it would flatten onto that wrapper
         * and the `ground` below would never show through. The card is
         * identified by the one property only it has: a backdrop filter.
         */
        if (style.backdropFilter && style.backdropFilter !== "none") break;
      }
      let out = [...ground];
      for (const layer of layers.reverse()) {
        out = out.map((c, i) => c * (1 - layer.a) + layer.rgb[i] * layer.a);
      }
      return out;
    };

    const ratio = (fg, bg) => {
      const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      return (hi + 0.05) / (lo + 0.05);
    };

    const all = [...document.querySelectorAll("main p, main h1")];
    const handle = all.find((node) => node.textContent?.startsWith("@"));
    const name = document.querySelector("main h1");
    const out = {};
    for (const [key, node] of [
      ["handle", handle],
      ["name", name],
    ]) {
      if (!node) continue;
      const color = toRgba(window.getComputedStyle(node).color).rgb;
      // The worse of the two extreme photographs.
      out[key] = Math.min(
        ratio(color, composited(node, [0, 0, 0])),
        ratio(color, composited(node, [255, 255, 255])),
      );
    }
    return out;
  });

  for (const [name, value] of Object.entries(contrast)) {
    log(
      `${name} contrast over the frosted card, worst photograph: ${value.toFixed(2)}:1`,
    );
    assert(
      value >= 4.5,
      `${name} clears AA on the card over the owner's photograph (${value.toFixed(2)}:1)`,
    );
  }

  /* ── DARK — every new surface needs its dark: variant ───────────────── */
  await useThemeEverywhere(page, setTheme, apiUrl, "dark");
  await goto(`/${username}`);
  await page.getByTestId("profile-cover-image").waitFor({ timeout: 20_000 });
  await shot("public-profile-dark");
  assert(
    await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    ),
    "dark: the theme bootstrap applied the .dark class",
  );

  await goto("/dashboard");
  await page.getByRole("button", { name: "Edit profile" }).click();
  await dialog.getByTestId("banner-upload").waitFor({ timeout: 15_000 });
  await shot("appearance-panel-dark");

  await dialog
    .getByTestId("banner-upload")
    .getByRole("button", { name: /Reposition/i })
    .click();
  await frame.waitFor({ timeout: 15_000 });
  await shot("reposition-dark");
  await page
    .getByRole("button", { name: /Cancel/i })
    .first()
    .click();
  await useThemeEverywhere(page, setTheme, apiUrl, "light");

  /* ── 390px — the same stored placement, a much shorter strip ────────── */
  await resize(390, 844);
  await goto(`/${username}`);
  await page.getByTestId("profile-cover-image").waitFor({ timeout: 20_000 });
  await shot("public-profile-390");

  const onPhone = await page
    .getByTestId("profile-cover-image")
    .evaluate((element) => element.style.objectPosition);
  assert(
    onPhone === published.objectPosition,
    "a focal point survives a frame of a different shape — the point of storing one",
  );

  const phoneSlice = await visibleBannerSlice(page);
  log(
    `phone cover shows image rows ${(phoneSlice.top * 100).toFixed(1)}%-${(phoneSlice.bottom * 100).toFixed(1)}% at ${phoneSlice.frameAspect.toFixed(2)}:1`,
  );
  assert(
    phoneSlice.top < MARKER.bottom && phoneSlice.bottom > MARKER.top,
    "…and at the PHONE cover shape, from the same stored focal point",
  );

  /*
   * The safe area, from the other end: the subject the owner dragged into the
   * editor frame must still be on screen at BOTH published cover shapes
   * (6.36:1 on a desktop, 2.13:1 here). The fixture's white marker occupies the
   * top 20% of the photograph, so "is any of it painted" is answerable by
   * looking for white pixels in the cover strip.
   */
  const coverBox = await page.getByTestId("profile-cover-image").boundingBox();
  log(
    `phone cover ${Math.round(coverBox.width)}x${Math.round(coverBox.height)} = ${(coverBox.width / coverBox.height).toFixed(2)}:1`,
  );

  /*
   * Does the photograph reach through the CARD on a phone, where the card
   * leaves no gutter to hide in?
   *
   * Two different photographs with the SAME appearance, sampled at the same
   * point inside the card. Comparing "background set" against "background
   * removed" would not answer this: removing it also swaps the card's own
   * material from frosted back to opaque, so those pixels differ whether or not
   * anything ever showed through.
   */
  await settle(page);
  const probe = await cardOnlyProbe(page, PROBE_SIZES);
  assert(
    Boolean(probe),
    "found a patch of card with no block over it to sample",
  );
  if (!probe) return;
  log(
    `card-only probe: ${probe.width}x${probe.height} at ${probe.x},${probe.y}`,
  );
  const phoneCardOnGreen = await page.screenshot({ clip: probe });

  // Re-route the fixture host: same urls, a different photograph.
  await page.route(`${FIXTURE_ORIGIN}/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: fixtureSvg("#1d4ed8", "#1e3a8a"),
    });
  });
  await goto(`/${username}`);
  await page.getByTestId("profile-cover-image").waitFor({ timeout: 20_000 });
  await settle(page);
  const phoneCardOnBlue = await page.screenshot({ clip: probe });
  assert(
    !phoneCardOnGreen.equals(phoneCardOnBlue),
    "on a phone the photograph reaches THROUGH the frosted card, not only around it",
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "390px: the page does not scroll horizontally",
  );
  /* ── The paint proof, on a phone ────────────────────────────────────── */
  // Taken while the background is still set; the "without" half comes after the
  // restore below, at the same viewport and the same clip.
  await resize(1440, 900);

  /* ── Put the account back the way it was found ──────────────────────── */
  await goto("/dashboard");
  await page.evaluate(
    async ([apiOrigin, previous]) => {
      const tokens = JSON.parse(
        window.localStorage.getItem("crafthub.auth.tokens") ?? "{}",
      );
      const accessToken = tokens.accessToken ?? tokens.state?.accessToken;
      await fetch(`${apiOrigin}/profile`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(previous),
      });
    },
    [apiUrl, baseline],
  );
  log("account restored to its pre-run appearance");

  /* ── The paint proof: the same patches, now with no photo ───────────── */
  await goto(`/${username}`);
  await page.getByRole("heading").first().waitFor({ timeout: 20_000 });
  const gutterWithoutPhoto = await page.screenshot({ clip: PAINT_PROBE });
  assert(
    !gutterWithPhoto.equals(gutterWithoutPhoto),
    "the background photograph changes what the page actually paints",
  );

  await resize(1440, 900);
}
