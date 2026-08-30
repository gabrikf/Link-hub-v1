import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A separate file from `top-bar-nav.test.tsx` on purpose. That suite covers the
 * bar's CONTENT — which controls exist, where they live at each breakpoint, and
 * that they never overlap each other. This one covers its MATERIAL, which is a
 * different bug: the signed-out bar was `sticky top-0 z-40` with no background,
 * so on a scrolled public profile the page content ran through the gaps between
 * the Login pill, the language group and the theme switch. Nothing in the
 * existing suite could have caught that, and nothing in it needed changing to
 * make this pass.
 */

type MockUserInfo = { login: string; name: string } | null;

let currentPathname = "/profile/ada";
let currentUserInfo: MockUserInfo = null;
let currentTokens: { accessToken: string } | null = null;

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
    selector({ userInfo: currentUserInfo, clearUserInfo: vi.fn() }),
}));

vi.mock("../lib/preferences-sync", () => ({
  useSavePreferences: () => vi.fn(),
}));

import { TopBarNav } from "./top-bar-nav";

function renderNav() {
  render(<TopBarNav theme="light" onToggleTheme={vi.fn()} />);
  return screen.getByRole("banner");
}

beforeEach(() => {
  currentPathname = "/profile/ada";
  currentUserInfo = null;
  currentTokens = null;
});

describe("TopBarNav signed-out bar material", () => {
  it("is still sticky, so the controls stay reachable while scrolling", () => {
    const header = renderNav();
    expect(header.className).toMatch(/\bsticky\b/);
    expect(header.className).toMatch(/\btop-0\b/);
  });

  it("carries a background of its own in light mode", () => {
    // The whole bug: a sticky element with no background lets page content
    // render through it.
    expect(renderNav().className).toMatch(/(?:^|\s)bg-white\/\d+(?:\s|$)/);
  });

  it("carries a dark counterpart for that background", () => {
    // DESIGN.md §2: a `bg-*` with no `dark:bg-*` is a bug, and it is invisible
    // to anyone working in light mode.
    expect(renderNav().className).toMatch(
      /(?:^|\s)dark:bg-zinc-\d+\/\d+(?:\s|$)/,
    );
  });

  it("blurs what passes underneath rather than letting it read through", () => {
    expect(renderNav().className).toMatch(/\bbackdrop-blur-/);
  });

  it("closes the bar with a bottom border, in both themes", () => {
    const className = renderNav().className;
    expect(className).toMatch(/\bborder-b\b/);
    expect(className).toMatch(/\bborder-zinc-\d+/);
    expect(className).toMatch(/\bdark:border-zinc-\d+/);
  });

  it("puts the surface on the header itself, not on the controls row", () => {
    /*
     * The `flex-wrap` this used to assert is gone with the row's contents. It
     * was there because the sign-in pill, the language group and the theme
     * switch measured 409px against a 375px phone in es-ES; the two preference
     * controls are not rendered before sign-in any more, so the row is a brand
     * link and a pill and fits at 320px in all three locales. The part that
     * still matters — and the actual bug this file was written for — is that
     * the surface lives on the `<header>`, not on the row inside it.
     */
    const header = renderNav();
    const row = header.firstElementChild;
    expect(row).toBeInstanceOf(HTMLElement);
    if (!(row instanceof HTMLElement)) {
      throw new Error("signed-out row not found");
    }
    expect(row.className).not.toMatch(/\bbg-/);
  });

  it("renders no bar at all on the sign-in screen", () => {
    /*
     * Replaces "uses the same material on the sign-in screen". `AuthShell`
     * centres its card inside a `min-h-screen` box, so ANY bar above it pushes
     * the card down by the bar's own height — which is what put the sign-in
     * card near the bottom of the viewport. There is nothing left for a bar to
     * hold there either: the card already shows the logo and the product name,
     * and the language and theme controls are gone before sign-in.
     */
    currentPathname = "/";
    render(<TopBarNav theme="light" onToggleTheme={vi.fn()} />);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });
});

describe("TopBarNav signed-in bar material (unchanged)", () => {
  beforeEach(() => {
    currentUserInfo = { login: "ada", name: "Ada Lovelace" };
    currentTokens = { accessToken: "x" };
    currentPathname = "/dashboard";
  });

  it("still carries exactly the material it had before", () => {
    // Pinned deliberately: the signed-out bar was made to MATCH this one, so if
    // someone changes this string the two headers silently drift apart.
    expect(renderNav().className).toContain(
      "sticky top-0 z-40 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80",
    );
  });
});
