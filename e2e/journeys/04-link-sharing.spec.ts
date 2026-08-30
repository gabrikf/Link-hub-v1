import type { Browser, Page } from "@playwright/test";
import {
  API_URL,
  JOURNEY_ACCOUNTS,
  WEB_URL,
  uniqueSuffix,
} from "../support/accounts";
import { apiLogin } from "../support/api";
import { expect, loginAs, test, watchPage } from "../support/fixtures";

/**
 * JOURNEY 4 — "share my links like a Linktree page".
 *
 * The public profile is the artifact the whole product exists to produce: it is
 * unauthenticated, mostly opened on a phone, and it is the first thing a
 * stranger ever sees of a user. So every assertion here is written from the
 * stranger's side of the fence — a fresh browser context with no tokens — and
 * the owner-side dashboard is only ever used to *cause* the change.
 *
 * Links live in their own `links` table (NOT the layout editor's "button
 * block"): they are managed on `/dashboard` and published by the `links` block
 * of `/$username`.
 */

const OWNER = JOURNEY_ACCOUNTS.links;
const PUBLIC_PATH = `/${OWNER.login}`;

/** Must match THEME_STORAGE_KEY in apps/web/src/lib/theme.ts. */
const THEME_KEY = "crafthub-theme";
/** Must match USER_INFO_STORAGE_KEY in apps/web/src/lib/user-info-store.ts. */
const USER_INFO_KEY = "crafthub.auth.user-info";

/**
 * Every row this journey creates carries this prefix so `sweepE2eLinks` can
 * remove them all afterwards. The nightly loop never resets the database, so a
 * journey that leaks rows silently grows the profile it is asserting against.
 */
const E2E_PREFIX = "e2e-share";

const externalUrl = (slug: string) => `https://example.com/${slug}`;

function e2eTitle(what: string): string {
  return `${E2E_PREFIX}-${what}-${uniqueSuffix()}`;
}

/* ------------------------------------------------------------------ *
 * Owner-side helpers
 * ------------------------------------------------------------------ */

/**
 * `loginAs` writes only the token pair, but `DashboardPage` gates on
 * `getAuthTokens() && userInfo` and bounces to `/` when the persisted
 * `user-info` store is empty — only the login FORM ever writes it. So the
 * dashboard is unreachable from tokens alone and this journey has to persist
 * the same zustand envelope the app writes. Reported as a harness gap rather
 * than fixed in the shared fixture, which other journeys are using right now.
 */
async function signInAsOwner(page: Page): Promise<string> {
  await loginAs(page, OWNER);

  const session = await apiLogin(OWNER.email, OWNER.password);

  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [
      USER_INFO_KEY,
      JSON.stringify({ state: { userInfo: session.user }, version: 0 }),
    ] as [string, string],
  );

  return session.accessToken;
}

type SeededLink = { id: string; title: string; url: string };

async function listOwnerLinks(accessToken: string): Promise<SeededLink[]> {
  const response = await fetch(`${API_URL}/links`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`GET /links failed: HTTP ${response.status}`);
  }

  return (await response.json()) as SeededLink[];
}

/** Removes every row this spec could have created, however it failed. */
async function sweepE2eLinks(accessToken: string): Promise<void> {
  const links = await listOwnerLinks(accessToken);

  for (const link of links.filter((item) => item.title.startsWith(E2E_PREFIX))) {
    await fetch(`${API_URL}/links/${link.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }
}

/**
 * The dashboard renders four forms with a "Title" field (link, profile, resume,
 * work history). There is no `data-testid` to pin the link form with and this
 * journey may not add one, so it is scoped by the id its URL input already
 * carries. Everything inside is then queried by role/label.
 */
function linkForm(page: Page) {
  return page.locator("form").filter({ has: page.locator("#link-url") });
}

function linkRow(page: Page, title: string) {
  return page.getByRole("listitem").filter({ hasText: title });
}

async function openDashboard(page: Page): Promise<string> {
  const accessToken = await signInAsOwner(page);
  await page.goto("/dashboard");
  await expect(
    linkForm(page).getByRole("button", { name: "Create link" }),
  ).toBeVisible();
  return accessToken;
}

async function fillLinkForm(page: Page, title: string, url: string) {
  const form = linkForm(page);
  await form.getByLabel("Title").fill(title);
  await form.getByLabel("URL").fill(url);
}

/**
 * Polls for the settled outcome rather than just waiting for the row, so a save
 * that fails reports WHY (the form's field error, or the page-level "Unable to
 * create the link.") instead of a bare "element not found" ten seconds later.
 */
async function createLinkViaUi(page: Page, title: string, url: string) {
  await fillLinkForm(page, title, url);
  await linkForm(page).getByRole("button", { name: "Create link" }).click();

  await expect
    .poll(
      async () => {
        if ((await linkRow(page, title).count()) > 0) {
          return "created";
        }

        const fieldError = linkForm(page).getByRole("alert");
        if ((await fieldError.count()) > 0) {
          return `rejected by the form: ${await fieldError.first().innerText()}`;
        }

        const mutationError = page.getByText(/Unable to create the link/);
        if ((await mutationError.count()) > 0) {
          return "the create-link request failed";
        }

        return "pending";
      },
      { timeout: 20_000 },
    )
    .toBe("created");

  await expect(linkRow(page, title)).toBeVisible();
}

async function deleteLinkViaUi(page: Page, title: string) {
  await page.getByRole("button", { name: `Delete link ${title}` }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(linkRow(page, title)).toHaveCount(0);
}

/* ------------------------------------------------------------------ *
 * Stranger-side helpers
 * ------------------------------------------------------------------ */

type Stranger = {
  page: Page;
  guard: ReturnType<typeof watchPage>;
  close: () => Promise<void>;
};

/**
 * A brand-new context with NO storage state and no init script — the actual
 * shape of a visitor who was handed the link. `browser.newContext()` does not
 * inherit the project's device emulation, so it is copied across explicitly;
 * otherwise the `mobile` project would quietly assert against a desktop
 * viewport and the responsive checks would be theatre.
 */
async function openStranger(
  browser: Browser,
  options: { theme?: "light" | "dark" } = {},
): Promise<Stranger> {
  const projectUse = test.info().project.use;

  const context = await browser.newContext({
    baseURL: WEB_URL,
    viewport: projectUse.viewport,
    userAgent: projectUse.userAgent,
    deviceScaleFactor: projectUse.deviceScaleFactor,
    isMobile: projectUse.isMobile,
    hasTouch: projectUse.hasTouch,
  });

  if (options.theme) {
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [THEME_KEY, options.theme] as [string, string],
    );
  }

  const page = await context.newPage();

  // Self-check: without this, a silently-dropped viewport option would make
  // every `@responsive` assertion below run at 1280x720 on the mobile project
  // and pass for the wrong reason.
  if (projectUse.viewport) {
    expect(
      page.viewportSize(),
      "the stranger context did not inherit the project viewport",
    ).toEqual(projectUse.viewport);
  }

  return { page, guard: watchPage(page), close: () => context.close() };
}

/**
 * Navigate and let the page settle before anything is asserted.
 *
 * The FIRST visit to a public profile from a cold browser context makes Vite's dev
 * server optimise a new dependency and answer with a FULL PAGE RELOAD. That
 * reload throws away the DOM an assertion is holding, and the assertion then
 * burns its whole timeout "waiting for navigation to finish". Production builds
 * never do this; it is purely an artefact of asserting against a dev server.
 */
async function gotoSettled(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => undefined);
}

async function reloadSettled(page: Page): Promise<void> {
  await page.reload();
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => undefined);
}

/** Public link cards in the order the visitor reads them. */
function publicE2eLinks(page: Page) {
  return page.locator("a").filter({ hasText: E2E_PREFIX });
}

/**
 * `watchPage` counts Chrome's own "Failed to load resource: …" console line as
 * an application error. Two problems with asserting on it directly here:
 *
 *  - it duplicates `guard.badRequests`, which records the same failure with the
 *    method, URL and status attached;
 *  - the class also catches machine-level noise (`net::ERR_NETWORK_CHANGED`
 *    fired mid-run on this box and reddened a passing screen) and the
 *    DELIBERATE 404 that the not-found journey exists to trigger.
 *
 * Everything that actually indicates a broken screen still counts: React
 * errors, uncaught exceptions, and `reportError`'s dev-mode `console.error`.
 * Failed requests are asserted separately via `failedRequests`.
 */
function appErrors(guard: ReturnType<typeof watchPage>): string[] {
  return guard.errors.filter(
    (message) => !/^Failed to load resource:/.test(message),
  );
}

/**
 * HTTP 4xx/5xx seen while walking a screen. Transport-level entries (a bare
 * `net::ERR_*` with no status) are dropped on purpose: they are the machine's
 * network flapping, not the app's behaviour, and one `ERR_NETWORK_CHANGED`
 * should not redden a release gate.
 */
function failedRequests(
  guard: ReturnType<typeof watchPage>,
  options: { allow?: RegExp } = {},
): string[] {
  return guard.badRequests
    .filter((entry) => /HTTP \d{3}$/.test(entry))
    .filter((entry) => !options.allow?.test(entry));
}

/**
 * What dnd-kit is telling a screen reader right now. It renders one hidden
 * `role="status"` live region per DndContext; the dashboard mounts exactly one.
 */
function dragAnnouncement(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      document.querySelector("[role='status'][aria-live]")?.textContent ?? null,
  );
}

function requireBox(box: { x: number; y: number; width: number; height: number } | null) {
  if (!box) {
    throw new Error("element has no bounding box — it is not rendered");
  }
  return box;
}

type Rgb = { r: number; g: number; b: number };

/**
 * The text colour and the colour actually behind it, with every translucent
 * ancestor layer composited down to the first opaque one. `SURFACE_PROFILE` is
 * `dark:bg-zinc-900/70` and the profile card paints a gradient (so its
 * `backgroundColor` is transparent), so reading one element's own background
 * would report "transparent" and make any contrast assertion meaningless.
 *
 * Colours are resolved by PAINTING them on a 1x1 canvas rather than parsed as
 * text: Tailwind v4 emits `oklch(...)` and that is what `getComputedStyle`
 * hands back, so a `rgb()`-shaped regex silently reads lightness/chroma/hue as
 * red/green/blue and every contrast number it produces is fiction.
 */
async function readTextAndBackground(
  page: Page,
  selectorText: string,
): Promise<{ color: Rgb; background: Rgb }> {
  return page
    .locator("a")
    .filter({ hasText: selectorText })
    .first()
    .evaluate((element) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");

      const parse = (value: string) => {
        if (!context) {
          return { r: 0, g: 0, b: 0, a: 0 };
        }
        context.clearRect(0, 0, 1, 1);
        // Reset first: an unparseable value leaves fillStyle untouched, and a
        // stale colour would be read as if it were this element's.
        context.fillStyle = "rgba(0, 0, 0, 0)";
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1)
          .data;
        return { r, g, b, a: a / 255 };
      };

      const over = (
        top: { r: number; g: number; b: number; a: number },
        bottom: Rgb,
      ): Rgb => ({
        r: top.r * top.a + bottom.r * (1 - top.a),
        g: top.g * top.a + bottom.g * (1 - top.a),
        b: top.b * top.a + bottom.b * (1 - top.a),
      });

      const layers: Array<{ r: number; g: number; b: number; a: number }> = [];
      let node: Element | null = element;

      while (node) {
        const background = parse(getComputedStyle(node).backgroundColor);
        if (background.a > 0) {
          layers.push(background);
          if (background.a >= 1) break;
        }
        node = node.parentElement;
      }

      // The browser canvas under everything, if no layer was opaque.
      let background: Rgb = { r: 255, g: 255, b: 255 };
      for (let index = layers.length - 1; index >= 0; index -= 1) {
        background = over(layers[index]!, background);
      }

      const color = parse(getComputedStyle(element).color);

      return { color: { r: color.r, g: color.g, b: color.b }, background };
    });
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  );
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

async function assertNoHorizontalScroll(page: Page) {
  const measurement = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));

  expect(
    measurement.scrollWidth,
    `public profile scrolls horizontally: scrollWidth ${measurement.scrollWidth} > innerWidth ${measurement.innerWidth}`,
  ).toBeLessThanOrEqual(measurement.innerWidth + 1);
}

/* ------------------------------------------------------------------ *
 * Journey
 * ------------------------------------------------------------------ */

test.afterAll(async () => {
  const session = await apiLogin(OWNER.email, OWNER.password);
  await sweepE2eLinks(session.accessToken);
});

test("a link added on the dashboard is still there after a reload", async ({
  page,
  guard,
}) => {
  const title = e2eTitle("persist");
  const url = externalUrl("persist");

  const accessToken = await openDashboard(page);

  try {
    await createLinkViaUi(page, title, url);

    await page.reload();

    await expect(linkRow(page, title)).toBeVisible();
    await expect(
      linkRow(page, title).getByRole("link", { name: url }),
    ).toHaveAttribute("href", url);
    expect(appErrors(guard), "console errors on the dashboard").toEqual([]);
  } finally {
    await sweepE2eLinks(accessToken);
  }
});

test("@responsive a signed-out visitor sees the link, with the right href, and can click it", async ({
  page,
  browser,
}) => {
  const title = e2eTitle("public");
  const url = externalUrl("public");

  const accessToken = await openDashboard(page);
  const stranger = await openStranger(browser);

  try {
    await createLinkViaUi(page, title, url);

    await gotoSettled(stranger.page, PUBLIC_PATH);

    const publicLink = stranger.page.getByRole("link", { name: title });
    await expect(publicLink).toBeVisible();
    await expect(publicLink).toHaveAttribute("href", url);
    await expect(publicLink).toHaveAttribute("target", "_blank");

    // A stranger's browser is never signed in, so the page must render without
    // a token — proved by the fact that this context has none.
    await expect(
      stranger.page.getByRole("link", { name: "Login" }),
    ).toBeVisible();

    await assertNoHorizontalScroll(stranger.page);

    const [opened] = await Promise.all([
      stranger.page.waitForEvent("popup"),
      publicLink.click(),
    ]);
    await expect.poll(() => opened.url()).toContain("example.com");
    await opened.close();

    expect(
      appErrors(stranger.guard),
      "console errors on the public profile",
    ).toEqual([]);
    expect(
      failedRequests(stranger.guard),
      "failed requests on the public profile",
    ).toEqual([]);
  } finally {
    await stranger.close();
    await sweepE2eLinks(accessToken);
  }
});

test("editing a link changes what the public profile shows", async ({
  page,
  browser,
}) => {
  const title = e2eTitle("edit");
  const editedTitle = `${title}-edited`;
  const url = externalUrl("edit-before");
  const editedUrl = externalUrl("edit-after");

  const accessToken = await openDashboard(page);
  const stranger = await openStranger(browser);

  try {
    await createLinkViaUi(page, title, url);

    await page.getByRole("button", { name: "Edit link" }).first().click();

    const form = linkForm(page);
    await expect(form.getByLabel("Title")).toHaveValue(title);

    await form.getByLabel("Title").fill(editedTitle);
    await form.getByLabel("URL").fill(editedUrl);
    await form.getByRole("button", { name: "Update link" }).click();

    await expect(linkRow(page, editedTitle)).toBeVisible();

    await gotoSettled(stranger.page, PUBLIC_PATH);

    const publicLink = stranger.page.getByRole("link", { name: editedTitle });
    await expect(publicLink).toBeVisible();
    await expect(publicLink).toHaveAttribute("href", editedUrl);
    await expect(
      stranger.page.getByRole("link", { name: title, exact: true }),
    ).toHaveCount(0);

    expect(
      appErrors(stranger.guard),
      "console errors on the public profile",
    ).toEqual([]);
    expect(
      failedRequests(stranger.guard),
      "failed requests on the public profile",
    ).toEqual([]);
  } finally {
    await stranger.close();
    await sweepE2eLinks(accessToken);
  }
});

test("removing a link removes it from the public profile", async ({
  page,
  browser,
}) => {
  const title = e2eTitle("remove");
  const url = externalUrl("remove");

  const accessToken = await openDashboard(page);
  const stranger = await openStranger(browser);

  try {
    await createLinkViaUi(page, title, url);

    await gotoSettled(stranger.page, PUBLIC_PATH);
    await expect(stranger.page.getByRole("link", { name: title })).toBeVisible();

    await deleteLinkViaUi(page, title);

    await reloadSettled(stranger.page);
    await expect(stranger.page.getByRole("link", { name: title })).toHaveCount(
      0,
    );

    expect(
      appErrors(stranger.guard),
      "console errors on the public profile",
    ).toEqual([]);
    expect(
      failedRequests(stranger.guard),
      "failed requests on the public profile",
    ).toEqual([]);
  } finally {
    await stranger.close();
    await sweepE2eLinks(accessToken);
  }
});

test("reordering links reorders them for the visitor", async ({
  page,
  browser,
}) => {
  const first = e2eTitle("order-first");
  const second = e2eTitle("order-second");

  const accessToken = await openDashboard(page);
  const stranger = await openStranger(browser);

  try {
    await createLinkViaUi(page, first, externalUrl("order-first"));
    await createLinkViaUi(page, second, externalUrl("order-second"));

    await gotoSettled(stranger.page, PUBLIC_PATH);
    await expect(publicE2eLinks(stranger.page)).toHaveCount(2);
    const before = await publicE2eLinks(stranger.page).allInnerTexts();
    expect(before[0]).toContain(first);

    // dnd-kit's PointerSensor has no activation constraint here, so a plain
    // press-move-release on the grip is the real interaction. Intermediate
    // moves are required: a single jump produces one pointermove and dnd-kit
    // never computes a collision.
    const grip = linkRow(page, first).getByRole("button", {
      name: "Drag to reorder",
    });
    const from = requireBox(await grip.boundingBox());
    const onto = requireBox(await linkRow(page, second).boundingBox());

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      from.x + from.width / 2,
      from.y + from.height / 2 + 12,
      { steps: 5 },
    );
    await page.mouse.move(
      from.x + from.width / 2,
      onto.y + onto.height / 2 + 12,
      { steps: 12 },
    );
    await page.mouse.up();

    await expect(page.getByRole("listitem").first()).toContainText(second);

    await reloadSettled(stranger.page);
    await expect(publicE2eLinks(stranger.page)).toHaveCount(2);
    const after = await publicE2eLinks(stranger.page).allInnerTexts();
    expect(after[0]).toContain(second);
    expect(after[1]).toContain(first);

    expect(
      appErrors(stranger.guard),
      "console errors on the public profile",
    ).toEqual([]);
    expect(
      failedRequests(stranger.guard),
      "failed requests on the public profile",
    ).toEqual([]);
  } finally {
    await stranger.close();
    await sweepE2eLinks(accessToken);
  }
});

test("links can be reordered with the keyboard alone", async ({ page }) => {
  const first = e2eTitle("kbd-first");
  const second = e2eTitle("kbd-second");

  const accessToken = await openDashboard(page);

  // The write path is the same one the mouse test proves, so the ONLY thing
  // that can make this test red is dnd-kit never handing `handleDragEnd` a
  // neighbour as `over`. Recording the request separates "the keyboard never
  // started a reorder" from "the reorder was sent and the server refused it".
  const reorderRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      request.url().includes("/links/reorder")
    ) {
      reorderRequests.push(request.url());
    }
  });

  try {
    await createLinkViaUi(page, first, externalUrl("kbd-first"));
    await createLinkViaUi(page, second, externalUrl("kbd-second"));

    // Only this spec's own rows: the nightly database is never reset, so the
    // list also holds whatever other links the account already had.
    const rows = page.getByRole("listitem").filter({ hasText: E2E_PREFIX });
    await expect(rows).toHaveCount(2);
    expect((await rows.allInnerTexts())[0]).toContain(first);

    const grip = linkRow(page, first).getByRole("button", {
      name: "Drag to reorder",
    });
    await grip.waitFor({ state: "visible" });
    await grip.focus();
    await expect(grip).toBeFocused();

    // The documented dnd-kit sortable keyboard path: Space lifts, an arrow key
    // moves the item past its neighbour, Space drops. No pointer is involved.
    //
    // Each step waits for what dnd-kit ANNOUNCES to assistive tech rather than
    // for a delay, which is both the deterministic wait and the thing a
    // screen-reader user actually hears:
    //   "Draggable item <active> was moved over droppable area <over>."
    await page.keyboard.press("Space");
    await expect
      .poll(() => dragAnnouncement(page), { timeout: 5_000 })
      .toMatch(/was moved over droppable area/);

    await page.keyboard.press("ArrowDown");
    await expect
      .poll(
        async () => {
          const [, active, over] =
            /item (\S+) was moved over droppable area ([^.]+)\./.exec(
              (await dragAnnouncement(page)) ?? "",
            ) ?? [];
          return active && over && active !== over ? "travelled" : "stuck";
        },
        {
          timeout: 5_000,
          message:
            "ArrowDown never moved the lifted link over its neighbour — it is still its own droppable",
        },
      )
      .toBe("travelled");

    await page.keyboard.press("Space");

    await expect
      .poll(async () => (await rows.allInnerTexts())[0], { timeout: 10_000 })
      .toContain(second);

    expect(
      reorderRequests,
      "the keyboard drop never sent PATCH /links/reorder",
    ).toHaveLength(1);

    // Persistence, read back from the api rather than from the optimistic
    // cache the drop just wrote.
    const persisted = (await listOwnerLinks(accessToken))
      .filter((link) => link.title.startsWith(E2E_PREFIX))
      .map((link) => link.title);
    expect(persisted).toEqual([second, first]);
  } finally {
    await sweepE2eLinks(accessToken);
  }
});

test("a malformed URL is rejected with a message the user can see", async ({
  page,
}) => {
  const title = e2eTitle("malformed");

  const accessToken = await openDashboard(page);

  try {
    await fillLinkForm(page, title, "not a url at all");
    await linkForm(page).getByRole("button", { name: "Create link" }).click();

    await expect(linkForm(page).getByRole("alert")).toBeVisible();
    await expect(linkForm(page).getByRole("alert")).toContainText(/url/i);
    await expect(linkRow(page, title)).toHaveCount(0);
  } finally {
    await sweepE2eLinks(accessToken);
  }
});

/**
 * RELEASE BLOCKER. `links.url` is validated with a bare `z.string().url()`
 * (packages/schemas/src/links/index.ts) rather than the repo's own
 * `httpUrlSchema`, whose comment says in as many words that the bare version
 * "accepts `javascript:`, `data:`, `vbscript:` schemes — which become
 * stored-XSS when rendered into an `<a href>` on the PUBLIC profile". The
 * public profile renders `href={link.url}` unfiltered
 * (features/profile/components/profile-blocks.tsx).
 *
 * The link is deleted BEFORE the assertion so a failure here cannot leave a
 * live XSS payload on the seeded profile for the next nightly run.
 */
test("a javascript: URL never reaches a public href", async ({
  page,
  browser,
}) => {
  const title = e2eTitle("xss");
  const hostileUrl = "javascript:alert('crafthub-e2e-xss')";

  const accessToken = await openDashboard(page);
  const stranger = await openStranger(browser);

  let rejectedInTheForm = false;
  let publicHrefs: string[] = [];

  try {
    await fillLinkForm(page, title, hostileUrl);
    await linkForm(page).getByRole("button", { name: "Create link" }).click();

    // Either the form refuses it, or a row appears. Both are settled states.
    await expect
      .poll(async () => {
        if ((await linkForm(page).getByRole("alert").count()) > 0) {
          return "rejected";
        }
        if ((await linkRow(page, title).count()) > 0) {
          return "created";
        }
        return "pending";
      })
      .not.toBe("pending");

    rejectedInTheForm =
      (await linkForm(page).getByRole("alert").count()) > 0 &&
      (await linkRow(page, title).count()) === 0;

    if (!rejectedInTheForm) {
      await gotoSettled(stranger.page, PUBLIC_PATH);
      await expect(stranger.page.getByRole("link", { name: title })).toBeVisible();
      publicHrefs = await stranger.page
        .locator("a[href]")
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("href") ?? ""),
        );
    }
  } finally {
    await stranger.close();
    await sweepE2eLinks(accessToken);
  }

  if (rejectedInTheForm) {
    return;
  }

  // React 19 rewrites a `javascript:` href to this inert sentinel instead of
  // emitting it. That is a NEUTRALISATION, not a rejection: the raw payload is
  // still what the API stored and still what `GET /profile/:username` serves to
  // any non-React consumer. See the report accompanying this spec.
  const NEUTRALISED_BY_REACT =
    /^javascript:throw new Error\('React has blocked a javascript: URL/;

  expect(
    publicHrefs,
    "STORED XSS: the raw javascript: payload reached the public page verbatim",
  ).not.toContain(hostileUrl);

  const executable = publicHrefs.filter(
    (href) =>
      /^\s*(javascript|data|vbscript):/i.test(href) &&
      !NEUTRALISED_BY_REACT.test(href),
  );

  expect(
    executable,
    "STORED XSS: the public profile rendered a live non-http(s) href supplied by the profile owner. " +
      "Every visitor to this page executes it on click.",
  ).toEqual([]);
});

test("@responsive the public profile stays readable in light and dark", async ({
  page,
  browser,
}) => {
  const title = e2eTitle("theme");
  const url = externalUrl("theme");

  const accessToken = await openDashboard(page);

  try {
    await createLinkViaUi(page, title, url);

    for (const theme of ["light", "dark"] as const) {
      const stranger = await openStranger(browser, { theme });

      try {
        await gotoSettled(stranger.page, PUBLIC_PATH);
        await expect(
          stranger.page.getByRole("link", { name: title }),
        ).toBeVisible();

        await expect(stranger.page.locator("html")).toHaveClass(
          theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b).*$/,
        );

        const sample = await readTextAndBackground(stranger.page, title);
        const ratio = contrastRatio(sample.color, sample.background);

        expect(
          ratio,
          `${theme}: link text rgb(${Math.round(sample.color.r)}, ${Math.round(
            sample.color.g,
          )}, ${Math.round(sample.color.b)}) on rgb(${Math.round(
            sample.background.r,
          )}, ${Math.round(sample.background.g)}, ${Math.round(
            sample.background.b,
          )}) — a missing dark: variant renders as text the same colour as its surface`,
        ).toBeGreaterThan(3);

        await assertNoHorizontalScroll(stranger.page);

        expect(
          appErrors(stranger.guard),
          `console errors on the public profile (${theme})`,
        ).toEqual([]);
        expect(
          failedRequests(stranger.guard),
          `failed requests on the public profile (${theme})`,
        ).toEqual([]);
      } finally {
        await stranger.close();
      }
    }
  } finally {
    await sweepE2eLinks(accessToken);
  }
});

test("@responsive a username nobody owns shows a not-found state", async ({
  browser,
}) => {
  const stranger = await openStranger(browser);

  try {
    await gotoSettled(stranger.page, `/nobody-owns-this-${uniqueSuffix()}`);

    const notFound = stranger.page
      .getByRole("main")
      .filter({ hasText: "Profile not found." });

    await expect(notFound).toBeVisible();
    await expect(
      notFound.getByRole("link", { name: "Back to login" }),
    ).toBeVisible();

    // A settled screen, not a spinner that never resolves. Scoped to the
    // not-found region: the router's own pending component lives outside it and
    // its `sr-only` "Loading page" label made a page-wide check flaky.
    await expect(notFound.getByText(/loading/i)).toHaveCount(0);
    await expect(notFound.locator(".anim-sheen")).toHaveCount(0);

    await assertNoHorizontalScroll(stranger.page);

    expect(
      appErrors(stranger.guard),
      "console errors on the not-found profile",
    ).toEqual([]);
    expect(
      failedRequests(stranger.guard, {
        allow: /\/profile\/nobody-owns-this-\S* — HTTP 404$/,
      }),
      "failed requests on the not-found profile",
    ).toEqual([]);
  } finally {
    await stranger.close();
  }
});

/**
 * The short URL, asserted end to end — including that the OLD one is gone.
 *
 * `/:username` is now the only public profile path. Every already-shared and
 * search-indexed `/profile/*` link 404s from this deploy onward; that was a
 * deliberate product decision, and this is the test that says so out loud so a
 * future "let's add a redirect back" is a conversation and not a surprise.
 *
 * `page.url()` is also exactly what the Share control copies — it reads
 * `window.location.href` (public-profile-page.tsx) — so pinning the address bar
 * pins what lands in somebody's clipboard.
 */
test("the profile lives at the short URL, and the old one is gone", async ({
  browser,
}) => {
  const stranger = await openStranger(browser);

  try {
    await gotoSettled(stranger.page, PUBLIC_PATH);

    await expect(stranger.page.getByRole("heading").first()).toBeVisible();
    expect(stranger.page.url()).toMatch(new RegExp(`/${OWNER.login}$`));
    expect(stranger.page.url()).not.toContain("/profile/");

    // The removed path. It renders the app's 404 screen, not the profile.
    await gotoSettled(stranger.page, `/profile/${OWNER.login}`);

    await expect(
      stranger.page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();

    // A reserved word can never belong to anybody, so it gets the same 404
    // rather than a pointless "profile not found" round trip.
    await gotoSettled(stranger.page, "/login");

    await expect(
      stranger.page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();

    expect(
      appErrors(stranger.guard),
      "console errors across the short-URL checks",
    ).toEqual([]);
  } finally {
    await stranger.close();
  }
});

/**
 * BUG-20260823-profile-login-tap-eaten.
 *
 * The theme toggle is `fixed right-4 top-3` and is anchored to the VIEWPORT
 * (apps/web/src/App.tsx); the signed-out Login pill is `self-end` in normal flow
 * inside the profile's centred `max-w-md | max-w-6xl` container
 * (public-profile-page.tsx). They overlap at every width where the container's
 * right edge reaches the viewport gutter — which is NOT phones-only:
 * `MOBILE_QUERY` flips the two max-widths at 1024, so 1024-1152 laptops sit in
 * the band too. A 390-only assertion passes against a still-broken laptop, so
 * both widths are pinned here.
 *
 * These viewports are set explicitly rather than inherited, so the check is not
 * tagged `@responsive` — it would only re-run the same two widths on the mobile
 * project.
 */
const LOGIN_PILL_VIEWPORTS = [
  { label: "phone", width: 390, height: 844 },
  { label: "laptop", width: 1024, height: 768 },
] as const;

type PillHit = { x: number; y: number; where: string; owner: string };

/**
 * Who actually receives a tap at each edge and corner of the Login pill.
 * `boundingBox()` only says where the pill IS; `elementFromPoint` says who gets
 * the click, which is the thing the visitor experiences.
 */
async function loginPillHits(page: Page): Promise<PillHit[]> {
  const login = page.getByRole("link", { name: "Login" });
  await expect(login).toBeVisible();
  const box = requireBox(await login.boundingBox());

  // The pill is `rounded-full`, and `elementFromPoint` honours border-radius, so
  // its literal bounding-box corners belong to nobody even when nothing covers
  // it. Inset the columns by the corner radius (= half the height): that is
  // exactly the span of the pill's flat top and bottom edges, which is the part
  // a visitor can actually aim at.
  const radius = box.height / 2;

  const columns = [
    ["left", box.x + radius],
    ["centre", box.x + box.width / 2],
    ["right", box.x + box.width - radius],
  ] as const;
  const rows = [
    ["top", box.y + 1],
    ["middle", box.y + box.height / 2],
    ["bottom", box.y + box.height - 1],
  ] as const;

  const points = columns.flatMap(([column, x]) =>
    rows.map(([row, y]) => ({ x, y, where: `${row}-${column}` })),
  );

  return page.evaluate(
    (probe) =>
      probe.map((point) => {
        const element = document.elementFromPoint(point.x, point.y);
        const owner = element?.closest("a, button");
        const label = owner
          ? `${owner.tagName.toLowerCase()}:${(
              owner.getAttribute("aria-label") ??
              owner.textContent ??
              ""
            ).trim()}`
          : `bare:${element?.tagName.toLowerCase() ?? "none"}`;
        return { ...point, owner: label };
      }),
    points,
  );
}

for (const viewport of LOGIN_PILL_VIEWPORTS) {
  test(`the whole Login pill is tappable on a public profile at ${viewport.width}px`, async ({
    browser,
  }) => {
    // Two contexts, two navigations and a real click — comfortably past the
    // 60s default on a cold dev server.
    test.slow();

    for (const theme of ["light", "dark"] as const) {
      const stranger = await openStranger(browser, { theme });

      try {
        await stranger.page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await gotoSettled(stranger.page, PUBLIC_PATH);

        const hits = await loginPillHits(stranger.page);
        const stolen = hits.filter((hit) => hit.owner !== "a:Login");

        expect(
          stolen,
          `${viewport.label} ${viewport.width}px ${theme}: part of the Login pill is covered by another control`,
        ).toEqual([]);

        // Geometry is the cause; this is the symptom the visitor reports —
        // aiming at the sign-in CTA flips the colour theme instead, and the
        // flip is persisted, so it outlives the page.
        if (theme === "light") {
          const login = stranger.page.getByRole("link", { name: "Login" });
          const box = requireBox(await login.boundingBox());

          await stranger.page.mouse.click(box.x + box.width / 2, box.y + 3);

          await expect(stranger.page).toHaveURL(/\/$/);
          expect(
            await stranger.page.evaluate(
              (key) => window.localStorage.getItem(key),
              THEME_KEY,
            ),
            "tapping the Login pill changed the visitor's saved theme",
          ).toBe("light");
        }
      } finally {
        await stranger.close();
      }
    }
  });
}
