import type { ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockUserInfo = { login: string; name: string } | null;

let currentPathname = "/dashboard";
let currentUserInfo: MockUserInfo = { login: "ada", name: "Ada Lovelace" };
let currentTokens: { accessToken: string } | null = { accessToken: "x" };

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    params?: unknown;
    children: ReactNode;
    [key: string]: unknown;
  }) => {
    // `params` is dropped rather than destructured into an unused binding:
    // React warns about it as an unknown DOM attribute, and `_params` is an
    // eslint finding this file no longer needs to carry.
    const anchorProps: Record<string, unknown> = { ...rest };
    delete anchorProps.params;
    return (
      <a href={to} {...anchorProps}>
        {children}
      </a>
    );
  },
  useNavigate: () => vi.fn(),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: currentPathname } }),
}));

vi.mock("../lib/auth-tokens", () => ({
  getAuthTokens: () => currentTokens,
  clearAuthTokens: vi.fn(),
}));
vi.mock("../lib/user-info-store", () => ({
  useUserInfoStore: (selector: (state: unknown) => unknown) =>
    selector({
      userInfo: currentUserInfo,
      clearUserInfo: vi.fn(),
    }),
}));

/*
 * The language switcher writes its choice back through TanStack Query. Mocking
 * the save (and only the save) keeps this file free of a QueryClientProvider
 * without stubbing i18next — the language change itself runs for real below, so
 * the assertion is on translated text a user would actually see.
 */
const savePreferences = vi.fn();
vi.mock("../lib/preferences-sync", () => ({
  useSavePreferences: () => savePreferences,
}));

import i18n from "../i18n";
import { TopBarNav } from "./top-bar-nav";

const NAV_LABELS = [
  "Dashboard",
  "Profile layout",
  "Posts",
  "Recruiter search",
  "Public profile",
  "Settings",
];

const LANGUAGE_GROUP = "Choose a language";
/** `theme="light"` is passed everywhere below, so the action is always "dark". */
const THEME_ACTION = "Switch to dark theme";

function renderNav(theme: "light" | "dark" = "light") {
  const onToggleTheme = vi.fn();
  render(<TopBarNav theme={theme} onToggleTheme={onToggleTheme} />);
  return { onToggleTheme };
}

/** The single flex row inside `<header>` that holds the bar's controls. */
function getBarRow(): HTMLElement {
  const row = screen.getByRole("banner").firstElementChild;
  if (!(row instanceof HTMLElement)) {
    throw new Error("header row not found");
  }
  return row;
}

/** The hamburger. It keeps its name while the sheet is open — the sheet's own
 * close button is the only control called "Close menu". */
function getHamburger(): HTMLElement {
  return screen.getByRole("button", { name: "Open menu" });
}

/** The sheet the hamburger controls, resolved through `aria-controls`. */
function getMenuPanel(): HTMLElement {
  const trigger = getHamburger();
  const panel = document.getElementById(
    trigger.getAttribute("aria-controls") ?? "",
  );
  if (!(panel instanceof HTMLElement)) {
    throw new Error("menu panel not found");
  }
  return panel;
}

/**
 * jsdom loads no Tailwind stylesheet, so `hidden md:flex` computes as visible
 * and `toBeVisible()` cannot tell the two breakpoints apart. The gate itself is
 * still observable: an element is absent below `md` exactly when it or an
 * ancestor carries the base `hidden` utility (`md:hidden` is a different class
 * name and does not match).
 */
function isHiddenBelowMd(element: HTMLElement, root: HTMLElement): boolean {
  let node: HTMLElement | null = element;
  while (node && node !== root.parentElement) {
    if (node.classList.contains("hidden")) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

/** Accessible names of every control a phone user can actually reach. */
function reachableControlNames(root: HTMLElement): string[] {
  const scope = within(root);
  const controls = [
    ...scope.queryAllByRole("link"),
    ...scope.queryAllByRole("button"),
  ];
  return controls
    .filter((control) => !isHiddenBelowMd(control, root))
    .map(
      (control) =>
        control.getAttribute("aria-label") ?? control.textContent ?? "",
    );
}

beforeEach(() => {
  currentPathname = "/dashboard";
  currentUserInfo = { login: "ada", name: "Ada Lovelace" };
  currentTokens = { accessToken: "x" };
  savePreferences.mockClear();
});

afterEach(async () => {
  // i18next is module-global; a language test would otherwise leak Portuguese
  // into every test that runs after it. `act` because this hook runs BEFORE
  // RTL's cleanup, so the components are still mounted and re-render on it.
  if (i18n.resolvedLanguage !== "en-US") {
    await act(async () => {
      await i18n.changeLanguage("en-US");
    });
  }
});

describe("TopBarNav (desktop)", () => {
  it("exposes an accessible name (aria-label) for every nav item", () => {
    renderNav();
    for (const label of NAV_LABELS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    // Logout is a button with an accessible name.
    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
  });

  it("renders desktop nav items icon-only (no visible wrapping text label)", () => {
    renderNav();
    for (const label of NAV_LABELS) {
      const link = screen.getByRole("link", { name: label });
      // Accessible name comes from aria-label; the anchor wraps only an
      // aria-hidden icon, so it has no visible text of its own.
      expect(link).toHaveAttribute("aria-label", label);
      expect(link.textContent?.trim()).toBe("");
    }
  });

  it("marks the active nav item for the current pathname", () => {
    currentPathname = "/dashboard/posts";
    renderNav();
    const active = screen.getByRole("link", { name: "Posts" });
    expect(active.className).toContain("bg-violet-700");

    const inactive = screen.getByRole("link", { name: "Dashboard" });
    expect(inactive.className).not.toContain("bg-violet-700");
  });

  it("renders the language and theme controls inline in the header row", () => {
    renderNav();
    const row = getBarRow();

    // In the row itself — not floating on a fixed layer over the page.
    expect(
      within(row).getByRole("group", { name: LANGUAGE_GROUP }),
    ).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: THEME_ACTION }),
    ).toBeInTheDocument();
  });

  it("reserves no hardcoded gutter for a floating toggle cluster", () => {
    renderNav();
    // `pr-52 sm:pr-60` existed only to dodge the `fixed` cluster in App.tsx.
    // The controls are siblings now, so any reappearance of that padding is a
    // pixel guess against something that no longer exists.
    expect(getBarRow().className).not.toMatch(/\bs?m?:?pr-(52|60)\b/);
  });

  it("states its own row height instead of deriving it from its contents", () => {
    // Item 3.1. The row was `py-3` around a 44px control, so the bar's height
    // was a side effect of whichever control happened to be tallest — 69px
    // measured in Chromium. A fixed `h-13` (52px) is the whole fix, and a
    // reappearing `py-*` is how it would silently grow back.
    renderNav();
    const row = getBarRow();
    expect(row.className).toMatch(/\bh-13\b/);
    expect(row.className).not.toMatch(/\bpy-\d/);
  });

  it("makes the brand a link home, not decoration", () => {
    // Item 3.5: the logo was a bare <span> and clicking it did nothing.
    renderNav();
    const brand = within(getBarRow()).getByRole("link", { name: "Go home" });
    expect(brand).toHaveAttribute("href", "/dashboard");
    expect(brand).toHaveTextContent("CraftHub");
  });
});

describe("TopBarNav (mobile, signed in)", () => {
  it("exposes only the brand link and the hamburger in the header row", () => {
    renderNav();
    const row = getBarRow();

    /*
     * Changed with item 3.5, deliberately: the brand used to be an inert
     * <span> and is a link home now, so it is a reachable control at every
     * width. The bar is still two things and no more.
     */
    expect(reachableControlNames(row)).toEqual(["Go home", "Open menu"]);
    // The wordmark rides along with the logo at every width — it is 60px of
    // text, and hiding it left a phone header with an unlabelled disc on it.
    expect(within(row).getByText("CraftHub").closest(".hidden")).toBeNull();
  });

  it("moves the account name out of the bar and into the sheet", async () => {
    /*
     * The name was a second line under the wordmark, and it is what made this
     * a 68px header (item 3.1). A drawer's identity block is where it belongs
     * and where every product in this category puts it.
     */
    const user = userEvent.setup();
    renderNav();

    expect(
      within(getBarRow()).queryByText("Ada Lovelace"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(
      within(getMenuPanel()).getByText("Ada Lovelace"),
    ).toBeInTheDocument();
  });

  it("renders the hamburger as a bare glyph rather than a bordered chip", () => {
    renderNav();
    const hamburger = getHamburger();

    /*
     * It used to be `Button variant="icon"`, which paints a white square with
     * a zinc border around three lines — the loudest thing in a phone header,
     * drawn around the one control that needs no explaining. jsdom loads no
     * stylesheet, so the assertion is on the utilities themselves: no border,
     * no fill, and the bar's own ink in both themes.
     */
    expect(hamburger.className).not.toMatch(/\bborder\b/);
    expect(hamburger.className).not.toMatch(/\bbg-/);
    expect(hamburger.className).toContain("text-zinc-900");
    expect(hamburger.className).toContain("dark:text-white");

    /*
     * And no `ring-offset-*`. The focus ring itself stays — closing the sheet
     * hands focus straight back to this control — but `ring-offset-2` paints a
     * SOLID ring in the offset colour before the violet one, and that filled
     * halo is a circle around the hamburger by another name.
     */
    expect(hamburger.className).not.toMatch(/ring-offset/);

    // The 44px hit area survives losing the paint.
    expect(hamburger.className).toContain("h-11");
    expect(hamburger.className).toContain("w-11");
  });

  it("keeps the language and theme controls out of the header row", () => {
    renderNav();
    const row = getBarRow();

    const languageGroup = within(row).getByRole("group", {
      name: LANGUAGE_GROUP,
    });
    const themeSwitch = within(row).getByRole("button", { name: THEME_ACTION });
    expect(isHiddenBelowMd(languageGroup, row)).toBe(true);
    expect(isHiddenBelowMd(themeSwitch, row)).toBe(true);
  });

  it("reveals the language and theme controls inside the hamburger menu", async () => {
    const user = userEvent.setup();
    renderNav();

    const hamburger = screen.getByRole("button", { name: "Open menu" });
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    // Closed: only the md-gated header copies exist.
    expect(screen.getAllByRole("group", { name: LANGUAGE_GROUP })).toHaveLength(
      1,
    );

    await user.click(hamburger);

    expect(getHamburger()).toHaveAttribute("aria-expanded", "true");

    const menu = getMenuPanel();

    // Labelled sections, and both controls, inside the panel.
    expect(within(menu).getByText("Language")).toBeInTheDocument();
    expect(within(menu).getByText("Theme")).toBeInTheDocument();
    expect(
      within(menu).getByRole("group", { name: LANGUAGE_GROUP }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("button", { name: THEME_ACTION }),
    ).toBeInTheDocument();
    // The nav links and Logout are still there alongside them.
    expect(
      within(menu).getByRole("link", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getAllByRole("button", { name: "Logout" }),
    ).not.toHaveLength(0);
  });

  it("changes the interface language from inside the menu", async () => {
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const menu = getMenuPanel();

    // The menu spells the endonym out rather than showing a two-letter code.
    const portuguese = within(menu).getByRole("button", { name: "Português" });
    expect(portuguese).toHaveTextContent("Português");
    expect(portuguese).toHaveAttribute("aria-pressed", "false");

    await user.click(portuguese);

    await waitFor(() => expect(i18n.resolvedLanguage).toBe("pt-BR"));
    expect(savePreferences).toHaveBeenCalledWith({ language: "pt-BR" });
    // Re-queried through the panel node rather than through the hamburger:
    // the hamburger's accessible name is translated too, so looking it up by
    // its English name after the switch would fail for the wrong reason.
    await waitFor(() =>
      expect(
        within(menu).getByRole("button", { name: "Português" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("changes the theme from inside the menu", async () => {
    const user = userEvent.setup();
    const { onToggleTheme } = renderNav();

    await user.click(screen.getByRole("button", { name: "Open menu" }));

    const menuThemeRow = screen
      .getAllByRole("button", { name: THEME_ACTION })
      .at(-1);
    expect(menuThemeRow).toBeInstanceOf(HTMLElement);
    if (!(menuThemeRow instanceof HTMLElement)) {
      throw new Error("theme row not found");
    }

    await user.click(menuThemeRow);
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it("opens a modal sheet rather than a panel that grows the header", async () => {
    /*
     * The old dropdown was a sibling of the header row, so opening it took the
     * bar from 69px to 623px — measured in Chromium. The sheet is a dialog over
     * the page, which is what leaves the header alone.
     */
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: "Open menu" }));

    const panel = getMenuPanel();
    expect(panel).toHaveAttribute("role", "dialog");
    expect(panel).toHaveAttribute("aria-modal", "true");
    expect(panel).toHaveAccessibleName("Menu");
    // Not a descendant of the bar: `backdrop-filter` on the header would make
    // it the containing block for a `fixed` child, which collapsed the panel
    // to the height of the bar.
    expect(screen.getByRole("banner").contains(panel)).toBe(false);
  });

  it("starts focus on the close control and traps Tab inside the sheet", async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: "Open menu" }));

    const panel = getMenuPanel();
    const closeButton = within(panel).getByRole("button", {
      name: "Close menu",
    });
    expect(document.activeElement).toBe(closeButton);

    // Shift+Tab off the first control wraps to the last one instead of walking
    // out into the page behind the scrim, where nothing is clickable.
    await user.tab({ shift: true });
    expect(panel.contains(document.activeElement)).toBe(true);

    const logoutRow = within(panel).getByRole("button", { name: "Logout" });
    logoutRow.focus();
    await user.tab();
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it("stops the page behind the sheet from scrolling", async () => {
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("marks the active destination for assistive tech, not just in colour", async () => {
    currentPathname = "/dashboard/posts";
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole("button", { name: "Open menu" }));

    const panel = getMenuPanel();
    expect(within(panel).getByRole("link", { name: "Posts" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(panel).getByRole("link", { name: "Dashboard" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("closes the menu on Escape and returns focus to the hamburger", async () => {
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(getHamburger()).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");

    const hamburger = await screen.findByRole("button", { name: "Open menu" });
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    // A keyboard user must not be dropped at the top of the document.
    expect(document.activeElement).toBe(hamburger);
  });

  it("closes the menu on an outside click", async () => {
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(getHamburger()).toHaveAttribute("aria-expanded", "true");

    fireEvent.mouseDown(document.body);

    expect(
      await screen.findByRole("button", { name: "Open menu" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the menu open when the click lands inside it", async () => {
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.mouseDown(screen.getByText("Language"));

    expect(getHamburger()).toHaveAttribute("aria-expanded", "true");
  });
});

describe("TopBarNav (signed out)", () => {
  beforeEach(() => {
    currentUserInfo = null;
    currentTokens = null;
    currentPathname = "/profile/ada";
  });

  /*
   * These three assertions changed with the "no preferences before sign-in"
   * decision, and only because of it. The bar used to carry the language group
   * and the theme switch on every signed-out screen; a visitor's first sight of
   * the product was two settings for a product they had not entered. Language
   * follows the browser now (`lib/language.ts` walks `navigator.languages`) and
   * a stored choice still wins once there is a session to apply it to.
   */
  it("renders the way back into the product, and nothing else", () => {
    renderNav();

    const brand = screen.getByRole("link", { name: "Go home" });
    const loginLink = screen.getByRole("link", { name: /Login/ });

    const row = loginLink.parentElement;
    expect(row).toBeInstanceOf(HTMLElement);
    if (!(row instanceof HTMLElement)) {
      throw new Error("signed-out row not found");
    }
    expect(brand.parentElement).toBe(row);
    expect(row.className).toMatch(/\bflex\b/);
    expect(row.className).not.toMatch(/\bfixed\b|\babsolute\b/);
  });

  it("shows no language or theme control before sign-in", () => {
    renderNav();

    expect(
      screen.queryByRole("group", { name: LANGUAGE_GROUP }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: THEME_ACTION }),
    ).not.toBeInTheDocument();
  });

  it("renders no bar at all on the screens that carry their own brand mark", () => {
    /*
     * `AuthShell` centres its card in a `min-h-screen` box, so a bar ABOVE it
     * pushes the card down by exactly the bar's height — which is why the
     * sign-in card sat low on the page. These four screens already show the
     * logo and the product name inside the card.
     */
    for (const path of [
      "/",
      "/verify-email",
      "/forgot-password",
      "/reset-password",
    ]) {
      currentPathname = path;
      const { unmount } = render(
        <TopBarNav theme="light" onToggleTheme={vi.fn()} />,
      );
      expect(screen.queryByRole("banner")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("renders no dashboard navigation", () => {
    renderNav();
    for (const label of NAV_LABELS) {
      expect(
        screen.queryByRole("link", { name: label }),
      ).not.toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: "Open menu" }),
    ).not.toBeInTheDocument();
  });
});
