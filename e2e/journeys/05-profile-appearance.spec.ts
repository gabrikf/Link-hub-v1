import type { Locator, Page } from "@playwright/test";
// The contract itself, not a hand-written copy of it. A local `type
// ProfileAppearance = {...}` here would keep compiling for exactly as long as
// it took someone to rename a field on the real one.
import type { ProfileAppearance } from "@repo/schemas";
import { API_URL, JOURNEY_ACCOUNTS } from "../support/accounts";
import { apiLogin, type LoginResult } from "../support/api";
import { expect, loginAs, test } from "../support/fixtures";

/**
 * JOURNEY 5 — "configure my whole profile so it looks beautiful".
 *
 * Two surfaces carry this journey, and neither of them is `/dashboard/settings`
 * (that route is the MCP / agent-disclosure screen and owns none of the
 * appearance fields):
 *
 *   - `/dashboard` — the "Edit profile" modal owns name, description, location,
 *     open-to-work, persona, banner/background and the theme preset/accent.
 *   - `/dashboard/layout` — the block/grid studio (react-grid-layout).
 *
 * The public result is `/<login>` — the short URL, which is now the only
 * public profile path.
 *
 * Everything mutating runs against JOURNEY_ACCOUNTS.appearance and is restored
 * in `afterAll`, so a nightly loop keeps finding the same starting state.
 */

const ACCOUNT = JOURNEY_ACCOUNTS.appearance;
const PUBLIC_PATH = `/${ACCOUNT.login}`;
const API_ORIGIN = new URL(API_URL).origin;

/** Must match USER_INFO_STORAGE_KEY in apps/web/src/lib/user-info-store.ts. */
const USER_INFO_KEY = "crafthub.auth.user-info";
/** Must match THEME_STORAGE_KEY in apps/web/src/lib/theme.ts. */
const THEME_KEY = "crafthub-theme";

/* -------------------------------------------------------------------------- */
/* Session                                                                     */
/* -------------------------------------------------------------------------- */

let session: LoginResult | null = null;

async function getSession(): Promise<LoginResult> {
  session ??= await apiLogin(ACCOUNT.email, ACCOUNT.password);
  return session;
}

/**
 * `loginAs` seeds the TOKEN store only. Every dashboard route additionally
 * gates on `hasSession = Boolean(getAuthTokens() && userInfo)`, where
 * `userInfo` is the persisted zustand store that only the sign-in page ever
 * writes — so a token-only session bounces straight back to `/`. Seeding both
 * is exactly what the app does after a real login.
 */
async function signIn(
  page: Page,
  theme: "light" | "dark" = "light",
): Promise<void> {
  await loginAs(page, ACCOUNT);
  const tokens = await getSession();
  const userInfo = JSON.stringify({
    state: { userInfo: tokens.user ?? null },
    version: 0,
  });
  await page.addInitScript(
    ([userInfoKey, userInfoValue, themeKey, themeValue]) => {
      window.localStorage.setItem(userInfoKey, userInfoValue);
      window.localStorage.setItem(themeKey, themeValue);
    },
    [USER_INFO_KEY, userInfo, THEME_KEY, theme] as [
      string,
      string,
      string,
      string,
    ],
  );
  /*
   * Seeding localStorage is NOT enough once a session exists. `usePreferencesSync`
   * applies the signed-in account's STORED preference over the local one, and the
   * seeded accounts carry `theme: "system"` — which a headless browser resolves to
   * light, silently undoing the line above. The server is authoritative for a
   * signed-in user, so write the preference there too. This journey already owns
   * (and mutates) this account, so there is no cross-journey bleed.
   */
  await api("/preferences", { method: "PUT", body: { theme } });
}

/** The public profile needs no session, but it does need a deterministic theme. */
async function useTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [THEME_KEY, theme] as [string, string],
  );
}

/* -------------------------------------------------------------------------- */
/* Typed API access — used for the baseline snapshot, restore and verification  */
/* -------------------------------------------------------------------------- */

type ThemePreset = "violet" | "ocean" | "sunset" | "forest" | "mono";

type ProfileSnapshot = {
  username: string;
  name: string;
  description: string | null;
  userPhoto: string | null;
  backgroundImageUrl: string | null;
  bannerImageUrl: string | null;
  themeAccent: string | null;
  themePreset: ThemePreset | null;
  openToWork: boolean;
  location: string | null;
  persona: string | null;
  appearance: ProfileAppearance | null;
};

type LayoutBlock = {
  id: string;
  kind: string;
  tabId: string | null;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  isVisible: boolean;
  pinnedAllTabs: boolean;
};

type LayoutTab = { id: string; title: string; order: number };
type ViewportLayout = { tabs: LayoutTab[]; blocks: LayoutBlock[] };
type FullLayout = { pc: ViewportLayout; mobile: ViewportLayout };

async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const tokens = await getSession();
  // `content-type: application/json` with no body makes Fastify reject the
  // request with a 400 — so a bodyless DELETE must not carry the header.
  const headers: Record<string, string> = {
    authorization: `Bearer ${tokens.accessToken}`,
  };
  if (init.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(
      `${init.method ?? "GET"} ${path} → HTTP ${response.status} ${detail}`,
    );
  }
  return (await response.json()) as T;
}

const readProfile = (): Promise<ProfileSnapshot> => api<ProfileSnapshot>("/me");
const readLayout = (): Promise<FullLayout> => api<FullLayout>("/me/layout");

/**
 * Tabs are OFF for a new account now — that is the shipped default, changed so
 * a new profile starts as photo + name + links rather than a tab strip nobody
 * asked for. The tab chrome ("Add tab", "Add to tabs section") therefore does
 * not exist until the owner opts in, so a journey that exercises tabs has to
 * turn them on first instead of assuming a seeded account arrives with them.
 * Doing it over the API keeps the setup out of the assertions.
 */
async function enablePcTabs(): Promise<void> {
  await api("/me/layout/tabs-enabled", {
    method: "PATCH",
    body: { viewport: "pc", tabsEnabled: true },
  });
}

function pcTabBlocks(layout: FullLayout, tabId: string): LayoutBlock[] {
  return layout.pc.blocks.filter(
    (block) => !block.pinnedAllTabs && block.tabId === tabId,
  );
}

/* -------------------------------------------------------------------------- */
/* Request instrumentation — performance findings are measured, not guessed     */
/* -------------------------------------------------------------------------- */

type RequestLog = { entries: string[] };

function recordApiRequests(page: Page): RequestLog {
  const log: RequestLog = { entries: [] };
  page.on("request", (request) => {
    let url: URL;
    try {
      url = new URL(request.url());
    } catch {
      return;
    }
    if (url.origin !== API_ORIGIN) {
      return;
    }
    log.entries.push(`${request.method()} ${url.pathname}`);
  });
  return log;
}

const since = (log: RequestLog, mark: number): string[] =>
  log.entries.slice(mark);

const matching = (entries: string[], pattern: RegExp): string[] =>
  entries.filter((entry) => pattern.test(entry));

/* -------------------------------------------------------------------------- */
/* Colour helpers — dark mode is asserted on RENDERED colour, not on classes    */
/* -------------------------------------------------------------------------- */

type ColorPair = { color: string; background: string; ratio: number };

/**
 * An element's text colour, the first opaque background painted behind it, and
 * the WCAG contrast ratio between them. A missing `dark:` variant shows up here
 * as a ratio near 1 — text the same colour as the surface under it.
 */
async function readColorPair(locator: Locator): Promise<ColorPair> {
  return locator.evaluate((element: Element): ColorPair => {
    type Parsed = { rgb: [number, number, number]; alpha: number };

    const numbersIn = (value: string): number[] => {
      const parts = value.match(/-?[\d.]+(?:e-?\d+)?/g);
      return parts ? parts.map(Number) : [];
    };

    const srgbToLinear = (raw: number): number => {
      const channel = raw / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
    };

    const oklabToLinear = (
      lightness: number,
      aAxis: number,
      bAxis: number,
    ): [number, number, number] => {
      const l = (lightness + 0.3963377774 * aAxis + 0.2158037573 * bAxis) ** 3;
      const m = (lightness - 0.1055613458 * aAxis - 0.0638541728 * bAxis) ** 3;
      const s = (lightness - 0.0894841775 * aAxis - 1.291485548 * bAxis) ** 3;
      return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
      ];
    };

    /**
     * Tailwind v4 emits `oklch(...)`, so `getComputedStyle` hands back oklch —
     * an rgb-only parser silently reads every channel as 0 and reports a
     * contrast ratio of ~1 for perfectly readable text. Everything is converted
     * to LINEAR sRGB here, which is also what the luminance formula wants.
     */
    const toLinear = (value: string): Parsed => {
      const trimmed = value.trim().toLowerCase();

      if (trimmed.startsWith("oklch") || trimmed.startsWith("oklab")) {
        const isPercent = /(\d)%/.test(trimmed.split(/[\s(]/)[1] ?? "");
        const parts = numbersIn(trimmed.replace(/%/g, ""));
        const rawLightness = parts[0] ?? 0;
        const lightness = isPercent || rawLightness > 1.5
          ? rawLightness / 100
          : rawLightness;
        const second = parts[1] ?? 0;
        const third = parts[2] ?? 0;
        const alpha = parts.length > 3 ? (parts[3] ?? 1) : 1;
        const [aAxis, bAxis] = trimmed.startsWith("oklch")
          ? [
              second * Math.cos((third * Math.PI) / 180),
              second * Math.sin((third * Math.PI) / 180),
            ]
          : [second, third];
        const linear = oklabToLinear(lightness, aAxis, bAxis);
        return {
          rgb: [
            Math.min(1, Math.max(0, linear[0])),
            Math.min(1, Math.max(0, linear[1])),
            Math.min(1, Math.max(0, linear[2])),
          ],
          alpha,
        };
      }

      if (trimmed.startsWith("#")) {
        const hex = trimmed.slice(1);
        const expanded =
          hex.length === 3
            ? hex
                .split("")
                .map((char) => char + char)
                .join("")
            : hex;
        const int = Number.parseInt(expanded.slice(0, 6), 16);
        return {
          rgb: [
            srgbToLinear((int >> 16) & 255),
            srgbToLinear((int >> 8) & 255),
            srgbToLinear(int & 255),
          ],
          alpha: expanded.length === 8
            ? Number.parseInt(expanded.slice(6, 8), 16) / 255
            : 1,
        };
      }

      const parts = numbersIn(trimmed);
      return {
        rgb: [
          srgbToLinear(parts[0] ?? 0),
          srgbToLinear(parts[1] ?? 0),
          srgbToLinear(parts[2] ?? 0),
        ],
        alpha: parts.length > 3 ? (parts[3] ?? 1) : 1,
      };
    };

    const luminance = (parsed: Parsed): number =>
      0.2126 * parsed.rgb[0] + 0.7152 * parsed.rgb[1] + 0.0722 * parsed.rgb[2];

    const color = window.getComputedStyle(element).color;

    let node: Element | null = element;
    let background = "rgb(255, 255, 255)";
    while (node) {
      const candidate = window.getComputedStyle(node).backgroundColor;
      if (toLinear(candidate).alpha > 0.5) {
        background = candidate;
        break;
      }
      node = node.parentElement;
    }

    const foreground = luminance(toLinear(color));
    const behind = luminance(toLinear(background));
    const lighter = Math.max(foreground, behind);
    const darker = Math.min(foreground, behind);

    return { color, background, ratio: (lighter + 0.05) / (darker + 0.05) };
  });
}

/** Computed value of a CSS custom property on the first matching element. */
async function readCssVariable(
  locator: Locator,
  name: string,
): Promise<string> {
  return locator.evaluate(
    (element: Element, property: string) =>
      window.getComputedStyle(element).getPropertyValue(property).trim(),
    name,
  );
}

/**
 * Assert a themed root's computed accent. Polled rather than read once: the
 * Vite dev server occasionally hard-reloads the page when it optimizes a newly
 * reached route's dependencies, which detaches the element mid-read.
 */
async function expectAccent(page: Page, expected: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const root = page.locator(".profile-root").first();
        try {
          return (await readCssVariable(root, "--profile-accent")).toLowerCase();
        } catch {
          return "";
        }
      },
      {
        message: `--profile-accent on the public profile should be ${expected}`,
        timeout: 20_000,
      },
    )
    .toBe(expected);
}

/**
 * Drive an `<input type="color">` the way the OS picker does. React tracks the
 * previous value on the DOM node, so a plain `input.value = x` is swallowed —
 * the native setter has to be used or `onChange` never fires.
 */
async function setColorInput(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((element: Element, hex: string) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, hex);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const RUN_ID = Date.now().toString(36).slice(-5);
const NEW_NAME = `Appearance QA ${RUN_ID}`;
const NEW_BIO = `Bio rewritten by the nightly appearance journey (${RUN_ID}).`;
const NEW_LOCATION = `Porto Alegre ${RUN_ID}`;
const TEXT_BLOCK_BODY = `Nightly appearance block ${RUN_ID}`;

let baselineProfile: ProfileSnapshot;
let baselineLayout: FullLayout;

test.beforeAll(async () => {
  baselineProfile = await readProfile();
  baselineLayout = await readLayout();
});

test.afterAll(async () => {
  // Profile fields first — a failing layout restore must not skip them.
  try {
    await api("/profile", {
      method: "PUT",
      body: {
        username: baselineProfile.username,
        name: baselineProfile.name,
        description: baselineProfile.description,
        userPhoto: baselineProfile.userPhoto,
        backgroundImageUrl: baselineProfile.backgroundImageUrl,
        bannerImageUrl: baselineProfile.bannerImageUrl,
        themeAccent: baselineProfile.themeAccent,
        themePreset: baselineProfile.themePreset,
        openToWork: baselineProfile.openToWork,
        location: baselineProfile.location,
        persona: baselineProfile.persona,
        ...(baselineProfile.appearance
          ? { appearance: baselineProfile.appearance }
          : {}),
      },
    });
  } catch (error) {
    console.warn(`[journey-05] profile restore failed: ${String(error)}`);
  }

  try {
    const current = await readLayout();
    const baselineBlockIds = new Set(
      [...baselineLayout.pc.blocks, ...baselineLayout.mobile.blocks].map(
        (block) => block.id,
      ),
    );
    const baselineTabIds = new Set(
      [...baselineLayout.pc.tabs, ...baselineLayout.mobile.tabs].map(
        (tab) => tab.id,
      ),
    );

    // Deleting a pc block also removes its mobile twin (they share a groupId),
    // so the second delete legitimately 404s — tolerate it per item.
    for (const block of [...current.pc.blocks, ...current.mobile.blocks]) {
      if (baselineBlockIds.has(block.id)) {
        continue;
      }
      try {
        await api(`/me/layout/blocks/${block.id}`, { method: "DELETE" });
      } catch {
        /* already gone with its twin */
      }
    }
    for (const tab of [...current.pc.tabs, ...current.mobile.tabs]) {
      if (baselineTabIds.has(tab.id)) {
        continue;
      }
      try {
        await api(`/me/layout/tabs/${tab.id}`, { method: "DELETE" });
      } catch {
        /* already gone */
      }
    }

    for (const viewport of ["pc", "mobile"] as const) {
      await api("/me/layout/blocks/positions", {
        method: "PATCH",
        body: {
          viewport,
          positions: baselineLayout[viewport].blocks.map((block) => ({
            id: block.id,
            gridX: block.gridX,
            gridY: block.gridY,
            gridW: block.gridW,
            gridH: block.gridH,
          })),
        },
      });
    }
  } catch (error) {
    console.warn(`[journey-05] layout restore failed: ${String(error)}`);
  }
});

/* -------------------------------------------------------------------------- */
/* Shared page steps                                                           */
/* -------------------------------------------------------------------------- */

async function openProfileDialog(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Edit profile" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Edit profile" });
  await expect(dialog.getByLabel("Name", { exact: true })).toBeVisible();
  return dialog;
}

async function gotoLayoutEditor(page: Page): Promise<void> {
  await page.goto("/dashboard/layout");
  await expect(
    page.getByRole("heading", { name: "Profile layout" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add to always-visible" }),
  ).toBeEnabled();
}

/* ========================================================================== */
/* 1. Profile fields                                                          */
/* ========================================================================== */

test("profile fields survive a reload and reach the public profile", async ({
  page,
  guard,
}) => {
  await signIn(page);
  await page.goto("/dashboard");

  const dialog = await openProfileDialog(page);
  await dialog.getByLabel("Name", { exact: true }).fill(NEW_NAME);
  await dialog.getByLabel("Description", { exact: true }).fill(NEW_BIO);
  await dialog.getByLabel("Location", { exact: true }).fill(NEW_LOCATION);

  // The open-to-work control is a bare `role="switch"` with NO accessible name
  // (dashboard-profile-form.tsx), so the only handle is "the one switch in this
  // dialog". Recorded as an a11y finding rather than papered over.
  const openToWork = dialog.getByRole("switch");
  await expect(openToWork).toHaveCount(1);
  const wasOpenToWork =
    (await openToWork.getAttribute("aria-checked")) === "true";
  await openToWork.click();
  await expect(openToWork).toHaveAttribute(
    "aria-checked",
    String(!wasOpenToWork),
  );

  await dialog.getByRole("button", { name: /Save profile/ }).click();
  await expect(dialog).toBeHidden();

  /* Persisted, not merely optimistic. */
  await page.waitForLoadState("networkidle");
  await page.reload();
  const reopened = await openProfileDialog(page);
  await expect(reopened.getByLabel("Name", { exact: true })).toHaveValue(
    NEW_NAME,
  );
  await expect(reopened.getByLabel("Description", { exact: true })).toHaveValue(
    NEW_BIO,
  );
  await expect(reopened.getByLabel("Location", { exact: true })).toHaveValue(
    NEW_LOCATION,
  );
  await expect(reopened.getByRole("switch")).toHaveAttribute(
    "aria-checked",
    String(!wasOpenToWork),
  );
  await reopened
    .getByRole("button", { name: "Close Edit profile", exact: true })
    .click();

  /* …and visible to the world. */
  await page.goto(PUBLIC_PATH);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(NEW_NAME);
  await expect(page.getByText(NEW_BIO)).toBeVisible();
  await expect(page.getByText(NEW_LOCATION)).toBeVisible();
  /*
   * The open-to-work badge is deliberately NOT on the public cover any more —
   * the banner carries the role/location chip and Share, and nothing else. The
   * flag itself still matters (it gates recruiter search), so this asserts the
   * cover stays clean in BOTH states rather than dropping the coverage.
   */
  await expect(page.getByText("Open to work")).toHaveCount(0);

  expect(guard.errors, "console errors while editing the profile").toEqual([]);
});

/* ========================================================================== */
/* 2. Banner position and background photo                                    */
/* ========================================================================== */

/**
 * A tall photograph in a 3:1 strip, served by Playwright rather than uploaded.
 *
 * Interception, not an upload, for the POSITIONING tests below: they run
 * `@responsive` and repeatedly, and a real object per run is cost this journey
 * does not need to pay to prove that a drag moves a focal point. It also gives
 * the browser a REAL image with a real intrinsic size (600x900 — portrait, so
 * the banner frame genuinely has something to hide vertically).
 *
 * The upload path itself is NOT left untested by that choice — see
 * "a real image upload reaches object storage" at the end of this describe,
 * which does write a real object, to the local MinIO, and is skipped with a
 * printed reason when no object store is reachable.
 */
/*
 * A host that cannot resolve, on purpose: every request for it is fulfilled by
 * the route below, so nothing ever leaves the machine — and if the interception
 * were ever removed, the failure would be a broken image in this journey rather
 * than a silent request to somebody's server. It also keeps the stored URL
 * independent of whichever port the web app happens to be on.
 */
const FIXTURE_ORIGIN = "http://e2e-fixtures.crafthub.invalid";
const FIXTURE_HOST_PATH = "/e2e-appearance-fixture.svg";

function fixtureImage(topColor: string, bottomColor: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
    <rect width="600" height="450" fill="${topColor}"/>
    <rect y="450" width="600" height="450" fill="${bottomColor}"/>
    <circle cx="300" cy="150" r="90" fill="#ffffff"/>
  </svg>`;
}

async function serveFixtureImages(page: Page): Promise<void> {
  await page.route(`**${FIXTURE_HOST_PATH}*`, async (route) => {
    const isBackground = route.request().url().includes("kind=background");
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: isBackground
        ? fixtureImage("#166534", "#065f46")
        : fixtureImage("#7c3aed", "#1e1b4b"),
    });
  });
}

const BANNER_FIXTURE_URL = `${FIXTURE_ORIGIN}${FIXTURE_HOST_PATH}?kind=banner`;
const BACKGROUND_FIXTURE_URL = `${FIXTURE_ORIGIN}${FIXTURE_HOST_PATH}?kind=background`;

/**
 * The properties that carry a focal point, read off the live DOM.
 *
 * BOTH the authored values and what the browser resolved them to. The two
 * cannot be compared as strings — `getComputedStyle` leaves `object-position`
 * in percentages and resolves `transform-origin` to pixels — so the invariant
 * "these two name the same point" is checked in pixels, against the element's
 * own box, by {@link expectFocalPointIsConsistent}.
 */
async function readPlacementStyle(locator: Locator) {
  return locator.evaluate((element) => {
    const image = element as HTMLImageElement;
    const computed = window.getComputedStyle(image);
    return {
      objectPosition: image.style.objectPosition,
      transformOrigin: image.style.transformOrigin,
      transform: image.style.transform,
      resolvedTransformOrigin: computed.transformOrigin,
      width: image.clientWidth,
      height: image.clientHeight,
    };
  });
}

type PlacementStyle = Awaited<ReturnType<typeof readPlacementStyle>>;

/**
 * The one invariant the whole feature rests on: the image point pinned by
 * `object-position` and the point zoom happens around must be the SAME point.
 * If they drift, zooming walks away from whatever the owner dragged into frame.
 */
function expectFocalPointIsConsistent(style: PlacementStyle): void {
  expect(style.transformOrigin).toBe(style.objectPosition);

  const [xPercent, yPercent] = style.objectPosition
    .split(" ")
    .map((part) => Number.parseFloat(part));
  const [xPixels, yPixels] = style.resolvedTransformOrigin
    .split(" ")
    .map((part) => Number.parseFloat(part));

  // Half a pixel of tolerance: `clientWidth`/`clientHeight` are integers while
  // the browser resolves the origin against the fractional border box. A real
  // drift between the two properties is tens of pixels, not fractions of one.
  expect(xPixels).toBeCloseTo(((xPercent ?? 50) / 100) * style.width, 0);
  expect(yPixels).toBeCloseTo(((yPercent ?? 50) / 100) * style.height, 0);
}

/**
 * Scoped in a describe for the sake of `afterEach`: this test parks two
 * FIXTURE image urls on the account, and the fixture host deliberately does not
 * resolve. Leaving them behind makes every LATER test in this file log a dozen
 * `ERR_NAME_NOT_RESOLVED` console errors and fail its own console-error
 * assertion — a failure with nothing to do with the test that reports it.
 */
test.describe("images", () => {
  test.afterEach(async () => {
    try {
      await api("/profile", {
        method: "PUT",
        body: {
          username: baselineProfile.username,
          bannerImageUrl: baselineProfile.bannerImageUrl,
          backgroundImageUrl: baselineProfile.backgroundImageUrl,
          ...(baselineProfile.appearance
            ? { appearance: baselineProfile.appearance }
            : {}),
        },
      });
    } catch (error) {
      console.warn(`[journey-05] fixture image cleanup failed: ${String(error)}`);
    }
  });

  /*
   * `@responsive` so this runs on the Pixel 7 project too. The phone is where
   * the bug was reported from, and it is the harder case: the dialog is 92vw,
   * the drag frame is 178px tall, and `touch-none` on that frame is the only
   * thing stopping the browser reading the gesture as a page scroll.
   */
  test("@responsive a dragged banner and a tuned background reach the public profile", async ({
    page,
    guard,
  }) => {
    await signIn(page);
    await serveFixtureImages(page);

    // Setup, not assertion: put the two photos on the account over the API so the
    // test spends its time on the thing under test — choosing where they sit.
    await api("/profile", {
      method: "PUT",
      body: {
        username: ACCOUNT.login,
        bannerImageUrl: BANNER_FIXTURE_URL,
        backgroundImageUrl: BACKGROUND_FIXTURE_URL,
        appearance: {
          bannerPlacement: null,
          backgroundPlacement: null,
          backgroundOverlay: 55,
          backgroundBlur: 6,
        },
      },
    });

    await page.goto("/dashboard");
    const dialog = await openProfileDialog(page);

    /* ---- the banner: drag it, and watch the preview follow ---- */

    const bannerField = dialog.getByTestId("banner-upload");
    await bannerField.getByRole("button", { name: /Reposition/i }).click();

    const frame = page.getByTestId("image-position-frame");
    await expect(frame).toBeVisible();

    const before = await readPlacementStyle(
      page.getByTestId("image-position-preview"),
    );
    expect(before.objectPosition).toBe("50% 50%");

    // Drag DOWNWARD: the photo follows the pointer, so what comes into frame is
    // the TOP of it — the half with the face in it.
    const box = await frame.boundingBox();
    if (!box) throw new Error("position frame has no box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2,
      box.y + box.height / 2 + 90,
      { steps: 12 },
    );
    await page.mouse.up();

    const dragged = await readPlacementStyle(
      page.getByTestId("image-position-preview"),
    );
    expect(
      dragged.objectPosition,
      "dragging must move the picture, not just the cursor",
    ).not.toBe(before.objectPosition);
    expectFocalPointIsConsistent(dragged);

    await page.getByRole("button", { name: /Apply position/i }).click();
    await expect(frame).toBeHidden();

    /* ---- the background: make it actually visible ---- */

    await dialog.getByLabel(/Veil/i).fill("20");
    await expect(dialog.getByTestId("profile-background-veil")).toHaveCSS(
      "opacity",
      "0.2",
    );

    await dialog.getByRole("button", { name: /Save profile/ }).click();
    await expect(dialog).toBeHidden();

    /* ---- persisted, not optimistic ---- */

    const saved = await readProfile();
    expect(saved.appearance?.bannerPlacement).not.toBeNull();
    /*
     * A THRESHOLD, not just "less than 50". A 90px drag against roughly 550px
     * of hidden photo is ~16 percentage points, so anything above 40 means the
     * gesture died part-way — which is exactly what happened when the browser
     * turned the drag into a native image-drag and fired `pointercancel` two
     * moves in. `y` barely moved and a `< 50` assertion sailed straight past it.
     */
    expect(
      saved.appearance?.bannerPlacement?.y,
      "a 90px drag must move the focal point by ~16 points, not by one",
    ).toBeLessThan(40);
    expect(saved.appearance?.backgroundOverlay).toBe(20);

    /* ---- and it is what a visitor sees ---- */

    await page.goto(PUBLIC_PATH);

    const cover = page.getByTestId("profile-cover-image");
    await expect(cover).toBeVisible();
    const published = await readPlacementStyle(cover);
    const expectedY = saved.appearance?.bannerPlacement?.y ?? 50;
    expect(published.objectPosition).toBe(`50% ${expectedY}%`);
    expectFocalPointIsConsistent(published);

    // The background bug: it rendered under an ~85% veil, i.e. invisibly.
    const background = page.getByTestId("profile-background-image");
    await expect(background).toBeAttached();
    await expect(page.getByTestId("profile-background-veil")).toHaveCSS(
      "opacity",
      "0.2",
    );

    expect(guard.errors, "console errors while positioning images").toEqual([]);
  });

  /* ------------------------------------------------------------------ */
  /* The upload itself                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * A 400x200 gradient PNG, inline. The journey carries its own fixture rather
   * than reading a file: nothing to go stale, nothing to ship alongside it.
   */
  const UPLOAD_FIXTURE_PNG = Buffer.from(
    [
    "iVBORw0KGgoAAAANSUhEUgAAAZAAAADICAIAAABJdyC1AAAIYklEQVR42u3U0xIoBgIE0Rvb",
    "tpOJbdu2bdu2bdu2bXNj23ayOz+xb6eqf6HPgAH5bxso/7aB888g+bsNmr8Gy59t8PwxRH5v",
    "Q+a3NlR+HTq/tGHy87D5qQ2XH4fPD22EfN9GzHcj5ds2cr4ZJV+3UfPVaPmyjZ4v2hj5fMx8",
    "1sbKp2PnkzZOPh43H7Xx8mEbPx9MkPfbhHlvorzbJs47k+TtNmneapPlzcnzRpsiryf/aVPm",
    "tanyaps6r7Rp8vK0ealNlxenzwtthjw/Y55rM+XZmfNMmyVPt1nz1Gx5ss2eJ+bI423OPDZX",
    "Hm1z55E2Tx6eNw+1+fLg/HmgLZD7F8x9baHc2xbOPYvk7rZo7losd7bFc8cSub0tmdvaUrl1",
    "6dzSlsnNy+amtlxuXD43tBVyfVsx162Ua9vKuWaVXN1WzVWr5cq2eq5oa+TyNXNZWyuXrp1L",
    "2jq5eN1c1NbLhW39XLBBzm8b5ryNcm7bOOdskrPbpjlrs5zZNs8ZbYucvmVOa1vl1K1zStsm",
    "J2+bk9p2ObFtnxN2yPFtxxy3U45tO+eYXXJ02zVHtd1y5O45ou2Rw/fMYW2vHLp3Dmn75OC2",
    "bw7aLwe2/XPAAdm/HZj9Dsq+7eDs0w7J3odmr3ZY9jw8e7QjsvuR2a0dlV3b0dnlmOzcjs1O",
    "x2XHdnx2OCHbtxOzXTsp256cbdop2frUbNVOy5anZ4t2RjY/M5u1s7JpOzubnJON27nZ6Lxs",
    "2M7PBhdk/XZh1msXZd2Ls067JGtfmrXaZVnz8qzRrsjq7cqsdlVWbVdnlWuycrs2K12XFdv1",
    "WaHdkOVvzHLtpix7c5Zpt2TpW7NUuy1LttuzxB1ZvN2Zxe7Kou3uLHJPFm73ZqF2Xxa8Pwu0",
    "BzL/g5mvPZR5H8487ZHM3R7NXI9lzvZ45ngis7cnM9tTmbU9nVmeyczt2czUnsuMz2eG9kKm",
    "fzHTtZcy7cuZpr2Sqdurmeq1TNm6zeuZor2Ryd/MZO2tTNreziTvZOL2biZ6LxO29zPBBxm/",
    "fZjx2kcZ9+OM0z7J2J9mrPZZxvw8Y7QvMnr7MqN9lVHb1xnlm4zcvs1I32XE9n1GaD9k+B8z",
    "XPspw/6cYdovGfrXDNV+y5Dt9wzxRwZvf2awvzJo+zuD/JOB278ZaACwgAUsYAELWMACFrCA",
    "BSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhaw",
    "gAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIW",
    "sIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMAC",
    "FrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jA",
    "AhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtY",
    "wAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAEL",
    "WMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGAB",
    "C1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxg",
    "AQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUs",
    "YAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAF",
    "LGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCA",
    "BSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhaw",
    "gAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIW",
    "sIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMAC",
    "FrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jA",
    "AhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtY",
    "wAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAEL",
    "WMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGAB",
    "C1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxg",
    "AQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUs",
    "YAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAF",
    "LGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCA",
    "BSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAAhaw",
    "gAUsYAELWMACFrCABSxgAQtY/z+w/gc0BDCZBIFwnQAAAABJRU5ErkJggg=="
  ].join(""),
    "base64",
  );

  /**
   * Is there an object store behind `POST /me/uploads` at all?
   *
   * Locally that is the MinIO in `docker-compose.dev.yml`, which
   * `bash db-manage.sh start` brings up and which the API defaults to when no
   * `S3_*` variable is set. Against an environment with no bucket the route
   * answers 500 by design, and a hard failure there would be this journey
   * reporting an infrastructure gap as a product bug — so the test SKIPS, and
   * says so, exactly like the api-side MinIO and Mailpit suites.
   */
  async function objectStorageIsReachable(): Promise<boolean> {
    try {
      const response = await fetch(`${API_ORIGIN}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok) return false;
    } catch {
      return false;
    }
    try {
      // MinIO's own liveness endpoint. Deliberately NOT a probe of the API's
      // config: what this test needs is a bucket that answers.
      const minio = await fetch("http://127.0.0.1:9000/minio/health/live", {
        signal: AbortSignal.timeout(1_500),
      });
      return minio.ok;
    } catch {
      return false;
    }
  }

  test("a real image upload reaches object storage and renders from it", async ({
    page,
    guard,
  }) => {
    test.skip(
      !(await objectStorageIsReachable()),
      "No object store on :9000 — start it with `bash db-manage.sh start`. " +
        "The real upload path is UNVERIFIED by this run.",
    );

    await signIn(page);
    await page.goto("/dashboard");

    const dialog = await openProfileDialog(page);
    const bannerField = dialog.getByTestId("banner-upload");
    await expect(bannerField).toBeVisible();

    const uploadResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/me/uploads") &&
        response.request().method() === "POST",
      { timeout: 30_000 },
    );

    await bannerField.locator('input[type="file"]').setInputFiles({
      name: "banner.png",
      mimeType: "image/png",
      buffer: UPLOAD_FIXTURE_PNG,
    });

    const response = await uploadResponse;
    expect(
      response.status(),
      "POST /me/uploads accepted the image",
    ).toBe(201);

    const { url } = (await response.json()) as { url: string };
    expect(url, "the API returned an absolute URL").toMatch(/^https?:\/\//);

    /*
     * The assertion a mock cannot make: fetch the returned URL back with NO
     * credentials and NO signature, the way an `<img>` does. A private bucket
     * answers 403 here while every DOM assertion above still passes — the
     * failure would only ever surface as a broken image on somebody's profile.
     */
    const anonymous = await page.request.get(url);
    expect(anonymous.status(), `the stored object is publicly readable at ${url}`).toBe(200);
    expect(anonymous.headers()["content-type"] ?? "").toContain("image/");

    // And the browser really decoded it into the live preview.
    const preview = dialog
      .getByTestId("profile-appearance-preview")
      .getByTestId("profile-cover-image");
    await expect(preview).toHaveAttribute("src", url, { timeout: 15_000 });
    await expect
      .poll(() =>
        preview.evaluate(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
      )
      .toBe(true);

    expect(guard.errors, "console errors while uploading an image").toEqual([]);
  });
});

/* ========================================================================== */
/* 3. Theme                                                                   */
/* ========================================================================== */

test("a theme preset and a custom accent repaint the public profile", async ({
  page,
  guard,
}) => {
  await signIn(page);
  await page.goto("/dashboard");

  const dialog = await openProfileDialog(page);
  await dialog.getByRole("button", { name: "Forest" }).click();
  await expect(dialog.getByRole("button", { name: "Forest" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dialog.getByRole("button", { name: /Save profile/ }).click();
  await expect(dialog).toBeHidden();

  expect((await readProfile()).themePreset).toBe("forest");

  await page.goto(PUBLIC_PATH);
  // The rendered variable, not "the swatch looks selected".
  await expectAccent(page, "#16a34a");

  /* A custom hex must beat the preset. */
  const CUSTOM_ACCENT = "#b91c1c";
  await page.goto("/dashboard");
  const second = await openProfileDialog(page);
  await setColorInput(
    second.getByLabel("Custom accent color"),
    CUSTOM_ACCENT,
  );
  await second.getByRole("button", { name: /Save profile/ }).click();
  await expect(second).toBeHidden();

  expect((await readProfile()).themeAccent?.toLowerCase()).toBe(CUSTOM_ACCENT);

  await page.goto(PUBLIC_PATH);
  await expectAccent(page, CUSTOM_ACCENT);

  expect(guard.errors, "console errors while theming").toEqual([]);
});

/* ========================================================================== */
/* 4. Typing cost                                                             */
/* ========================================================================== */

test("typing in the profile form issues no per-keystroke requests", async ({
  page,
}) => {
  await signIn(page);
  const log = recordApiRequests(page);
  await page.goto("/dashboard");

  const dialog = await openProfileDialog(page);
  const description = dialog.getByLabel("Description", { exact: true });
  await description.click();

  const probe = "performance probe typing";
  const mark = log.entries.length;
  await description.pressSequentially(probe, { delay: 25 });
  // Long enough for any debounce shorter than a second to have fired.
  await page.waitForTimeout(1200);
  const fired = since(log, mark);

  console.log(
    `[journey-05] PERF settings typing → ${fired.length} api request(s) for ${probe.length} keystrokes: ${JSON.stringify(fired)}`,
  );
  expect(
    fired,
    "the profile form must not talk to the API while the user types",
  ).toEqual([]);

  // Leave without saving; the form is dirty, so the discard guard shows.
  await dialog
    .getByRole("button", { name: "Close Edit profile", exact: true })
    .click();
  await page.getByRole("button", { name: "Discard changes" }).click();
});

/* ========================================================================== */
/* 5. Layout editor: add / move / remove, save semantics, request cost        */
/* ========================================================================== */

test("the layout editor adds, moves and removes a block without losing work", async ({
  page,
  guard,
}) => {
  await signIn(page);
  const log = recordApiRequests(page);
  await enablePcTabs();
  await gotoLayoutEditor(page);

  const before = await readLayout();
  const tabId = before.pc.tabs[0]?.id;
  expect(tabId, "the seeded pc layout must have at least one tab").toBeTruthy();
  const blocksBefore = pcTabBlocks(before, tabId as string);

  /* ---------------------------------- add --------------------------------- */
  await page.getByRole("button", { name: "Add to tabs section" }).click();
  const addMenu = page.getByRole("menu", { name: "Add a custom block" });
  await addMenu.getByRole("button", { name: /^Text/ }).click();

  const textDialog = page
    .getByRole("dialog")
    .filter({ hasText: "Add text block" });
  await textDialog.getByLabel("Body", { exact: true }).fill(TEXT_BLOCK_BODY);
  await textDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(textDialog).toBeHidden();

  const textCard = page.getByRole("group", { name: /^Text block\./ });
  await expect(textCard).toHaveCount(1);

  const afterAdd = await readLayout();
  const addedBlocks = pcTabBlocks(afterAdd, tabId as string);
  expect(addedBlocks.length).toBe(blocksBefore.length + 1);
  const added = addedBlocks.find((block) => block.kind === "text");
  expect(added, "the new text block must exist server-side").toBeTruthy();
  const addedId = (added as LayoutBlock).id;
  const addedX = (added as LayoutBlock).gridX;

  /* --------------------------------- move --------------------------------- */
  // react-grid-layout ships no keyboard drag; `grid-block-card.tsx` adds one
  // (arrow keys nudge, shift+arrow resizes) and it is the ONLY non-pointer path
  // to rearrange a layout. Driving it also lets the debounce be measured.
  await page.waitForLoadState("networkidle");
  await textCard.focus();
  const moveMark = log.entries.length;
  const positionWrite = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/me/layout/blocks/positions" &&
      response.request().method() === "PATCH",
    { timeout: 20_000 },
  );
  for (let step = 0; step < 5; step += 1) {
    await textCard.press("ArrowRight");
  }
  await positionWrite;
  await page.waitForTimeout(800);

  const positionWrites = matching(
    since(log, moveMark),
    /^PATCH \/me\/layout\/blocks\/positions$/,
  );
  console.log(
    `[journey-05] PERF layout nudge → ${positionWrites.length} position PATCH(es) for 5 arrow-key moves`,
  );
  expect(
    positionWrites.length,
    "five nudges inside the 600ms debounce must collapse into one write",
  ).toBeLessThanOrEqual(2);

  const afterMove = await readLayout();
  const movedBlock = afterMove.pc.blocks.find((block) => block.id === addedId);
  expect(movedBlock, "the moved block must still exist").toBeTruthy();
  expect(
    (movedBlock as LayoutBlock).gridX,
    "arrow-right must move the block across the grid",
  ).toBeGreaterThan(addedX);
  const movedX = (movedBlock as LayoutBlock).gridX;

  /* ------------------------ a reload must be lossless --------------------- */
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Profile layout" }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: /^Text block\./ })).toHaveCount(
    1,
  );
  // Give any mount-time `onLayoutChange` write time to land before re-reading.
  await page.waitForTimeout(1500);
  const afterReload = await readLayout();
  const reloaded = afterReload.pc.blocks.find((block) => block.id === addedId);
  expect(
    reloaded?.gridX,
    "reloading the editor must not move the arrangement the user just made",
  ).toBe(movedX);

  /* -------------------------------- remove -------------------------------- */
  await page
    .getByRole("group", { name: /^Text block\./ })
    .getByRole("button", { name: "Delete Text", exact: true })
    .click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Delete block?");
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("group", { name: /^Text block\./ })).toHaveCount(
    0,
  );

  await expect
    .poll(
      async () => {
        const layout = await readLayout();
        return layout.pc.blocks.some((block) => block.id === addedId);
      },
      { message: "the deleted block must be gone server-side" },
    )
    .toBe(false);

  await page.goto(PUBLIC_PATH);
  await expect(page.getByText(TEXT_BLOCK_BODY)).toHaveCount(0);

  expect(guard.errors, "console errors in the layout studio").toEqual([]);
});

/* ========================================================================== */
/* 4b. Vertical reordering — the whole point of a layout editor               */
/* ========================================================================== */

test("a block can be reordered vertically without a mouse", async ({ page }) => {
  await signIn(page);
  const log = recordApiRequests(page);
  await enablePcTabs();
  await gotoLayoutEditor(page);

  const before = await readLayout();
  const tabId = before.pc.tabs[0]?.id as string;
  const stack = pcTabBlocks(before, tabId).sort((a, b) => a.gridY - b.gridY);
  expect(
    stack.length,
    "this journey needs at least two stacked blocks",
  ).toBeGreaterThan(1);
  const bottom = stack[stack.length - 1] as LayoutBlock;
  const bottomLabel = { posts: "Posts", work_experiences: "Work history" }[
    bottom.kind
  ] ?? "Posts";

  const card = page.getByRole("group", {
    name: new RegExp(`^${bottomLabel} block\\.`),
  });
  await expect(card).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  await card.focus();

  const mark = log.entries.length;
  // Ten presses, far more than the neighbour's height, with the debounce
  // flushed between each pair.
  for (let step = 0; step < 10; step += 1) {
    await card.press("ArrowUp");
    if (step % 3 === 2) {
      await page.waitForTimeout(800);
    }
  }
  await page.waitForTimeout(1200);

  const writes = matching(
    since(log, mark),
    /^PATCH \/me\/layout\/blocks\/positions$/,
  );
  console.log(
    `[journey-05] PERF vertical nudge → ${writes.length} position PATCH(es) for 10 ArrowUp presses`,
  );

  const after = await readLayout();
  const moved = after.pc.blocks.find((block) => block.id === bottom.id);
  expect(
    moved?.gridY,
    "ten ArrowUp presses must lift the bottom block above its neighbour — the keyboard is the only non-pointer way to reorder a layout",
  ).toBeLessThan(bottom.gridY);
});

/* ========================================================================== */
/* 6. Four states — layout editor                                             */
/* ========================================================================== */

test("the layout editor renders all four states", async ({ page }) => {
  /* ------------------------------- loading -------------------------------- */
  await signIn(page);
  await page.route(
    (url) => url.origin === API_ORIGIN && url.pathname === "/me/layout",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    },
  );
  await page.goto("/dashboard/layout");
  // sr-only status labels, so assert presence rather than paint.
  await expect(page.getByText("Loading pinned blocks")).toBeAttached();
  await expect(page.getByText("Loading tabs")).toBeAttached();
  await expect(page.getByText("Loading layout blocks")).toBeAttached();

  /* -------------------------------- filled -------------------------------- */
  // The same page settles into the real grid once the delayed response lands.
  await expect(
    page.getByRole("group", { name: /^Profile header block\./ }),
  ).toHaveCount(1, { timeout: 15_000 });
  await page.unrouteAll({ behavior: "ignoreErrors" });

  /* --------------------------------- empty -------------------------------- */
  // A brand-new tab is the only genuinely empty zone this editor can reach.
  await enablePcTabs();
  await gotoLayoutEditor(page);
  await page.getByRole("button", { name: "Add tab" }).click();
  await expect(page.getByText("This tab has no blocks yet.")).toBeVisible();

  const created = await readLayout();
  const extraTab = created.pc.tabs.find(
    (tab) => !baselineLayout.pc.tabs.some((base) => base.id === tab.id),
  );
  expect(extraTab, "Add tab must create a tab server-side").toBeTruthy();
  await api(`/me/layout/tabs/${(extraTab as LayoutTab).id}`, {
    method: "DELETE",
  });

  /* --------------------------------- error -------------------------------- */
  await page.route(
    (url) => url.origin === API_ORIGIN && url.pathname === "/me/layout",
    (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "boom" }),
      }),
  );
  await page.goto("/dashboard/layout");
  await expect(page.getByText("Loading tabs")).toHaveCount(0, {
    timeout: 30_000,
  });

  /*
   * This used to assert the OPPOSITE — that the editor fell back to
   * `buildDefaultLayout()` and rendered block cards the user never created, as
   * if they were saved work. That was the defect, not the contract: a failed
   * read must not fabricate an arrangement the owner might then "save" over
   * their real one. The page now renders the designed error state below
   * instead, so the correct assertion is that NO block card appears.
   */
  await expect(
    page.getByRole("group", { name: /^Profile header block\./ }),
  ).toHaveCount(0);

  // The fourth state. AGENTS.md makes it mandatory: a screen that reads from
  // the network must have a designed error state.
  await expect(
    page.getByText(/couldn.?t|could not|unable|try again|failed/i).first(),
    "a failed GET /me/layout must surface an error state instead of a fabricated default layout",
  ).toBeVisible({ timeout: 5000 });
});

/* ========================================================================== */
/* 7. Four states — dashboard profile panel                                   */
/* ========================================================================== */

test("the dashboard profile panel renders all four states", async ({
  page,
}) => {
  /* ------------------------------- loading -------------------------------- */
  await signIn(page);
  await page.route(
    (url) => url.origin === API_ORIGIN && url.pathname === "/me",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    },
  );
  await page.goto("/dashboard");

  /*
   * THE LOADING STATE MOVED, and this assertion moved with it.
   *
   * It used to be the dashboard's own "Loading profile" skeleton. `GET /me` is
   * now resolved by `lib/app-boot.ts` BEFORE the router mounts — the boot gate
   * hands the profile straight to the `["me"]` query cache — so on a hard load
   * the dashboard panel never has a pending state to render: it mounts with the
   * data already there. What a person actually looks at during those two
   * delayed seconds is `BootPending`.
   *
   * Asserting the old string here would now be asserting that the app is slower
   * than it is. Asserting nothing would drop the state from the four-state rule
   * entirely, so the delayed `/me` still has to prove SOMETHING designed is on
   * screen — it is just a different component now.
   *
   * The panel's own skeleton is still live and still covered: it is what shows
   * on an in-session refetch, which the `empty` step below exercises.
   */
  await expect(page.getByText("Loading CraftHub")).toBeAttached();

  /* -------------------------------- filled -------------------------------- */
  await expect(page.getByRole("button", { name: "Edit profile" })).toBeVisible({
    timeout: 15_000,
  });
  await page.unrouteAll({ behavior: "ignoreErrors" });

  /* --------------------------------- empty -------------------------------- */
  await api("/profile", {
    method: "PUT",
    body: { username: baselineProfile.username, description: null },
  });
  await page.goto("/dashboard");
  await expect(page.getByText("No description yet.")).toBeVisible();

  /* --------------------------------- error -------------------------------- */
  await page.route(
    (url) => url.origin === API_ORIGIN && url.pathname === "/me",
    (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "boom" }),
      }),
  );
  await page.goto("/dashboard");
  await expect(page.getByText("Loading profile")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(
    page.getByText(/couldn.?t|could not|unable|try again|failed/i).first(),
    "a failed GET /me must surface an error state, not a profile that looks wiped",
  ).toBeVisible({ timeout: 5000 });
});

/* ========================================================================== */
/* 8. Dark mode                                                               */
/* ========================================================================== */

test("dark mode keeps the editor and the public profile readable", async ({
  page,
  guard,
}) => {
  await signIn(page, "dark");
  await gotoLayoutEditor(page);
  await expect(page.locator("html")).toHaveClass(/dark/);

  const editorTargets: Array<[string, Locator]> = [
    ["editor h1", page.getByRole("heading", { name: "Profile layout" })],
    [
      "pinned-zone heading",
      page.getByRole("heading", { name: "Always visible" }),
    ],
    [
      "block card label",
      page
        .getByRole("group", { name: /^Profile header block\./ })
        .getByText("Profile header", { exact: true }),
    ],
  ];

  for (const [label, locator] of editorTargets) {
    const pair = await readColorPair(locator);
    expect(
      pair.ratio,
      `${label} in dark mode: ${pair.color} on ${pair.background}`,
    ).toBeGreaterThan(3);
  }

  await useTheme(page, "dark");
  await page.goto(PUBLIC_PATH);
  await expect(page.locator("html")).toHaveClass(/dark/);

  const publicTargets: Array<[string, Locator]> = [
    ["profile name", page.getByRole("heading", { level: 1 })],
    ["profile username", page.getByText(`@${ACCOUNT.login}`)],
  ];

  for (const [label, locator] of publicTargets) {
    const pair = await readColorPair(locator);
    expect(
      pair.ratio,
      `${label} in dark mode: ${pair.color} on ${pair.background}`,
    ).toBeGreaterThan(3);
  }

  expect(guard.errors, "console errors in dark mode").toEqual([]);
});

/* ========================================================================== */
/* 9. The public result, on both form factors                                 */
/* ========================================================================== */

test("@responsive the configured appearance renders on the public profile", async ({
  page,
  guard,
}) => {
  // Self-sufficient: the mobile project runs ONLY this test, so it applies its
  // own fixture rather than depending on the tests above.
  await api("/profile", {
    method: "PUT",
    body: {
      username: baselineProfile.username,
      name: NEW_NAME,
      description: NEW_BIO,
      location: NEW_LOCATION,
      openToWork: true,
      themePreset: "ocean",
      themeAccent: null,
    },
  });

  await useTheme(page, "light");
  await page.goto(PUBLIC_PATH);

  await expectAccent(page, "#0ea5e9");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(NEW_NAME);
  await expect(page.getByText(NEW_BIO)).toBeVisible();
  await expect(page.getByText(NEW_LOCATION)).toBeVisible();
  // See the note above: the cover no longer carries this badge by design.
  await expect(page.getByText("Open to work")).toHaveCount(0);

  // Nothing may overflow the viewport sideways on either form factor.
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(
    overflow,
    "the public profile must not scroll sideways",
  ).toBeLessThanOrEqual(1);

  expect(guard.errors, "console errors on the public profile").toEqual([]);
});
