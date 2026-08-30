import type { ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE SCREENSHOT, AS A TEST.
 *
 * A user renamed her handle and reported that "some places changed to
 * @mariana and others still said marianamanfrinn". The dashboard was right —
 * it reads `/me` on every visit — and the nav drawer was wrong, because the
 * drawer reads the persisted `userInfo`, which was written at sign-in and by
 * nothing else. The "Public profile" link in that same drawer is built from
 * the same stale value, which is why tapping it produced a 404 on her own
 * profile.
 *
 * This file renders the real `TopBarNav` against the REAL store — the sibling
 * `top-bar-nav.test.tsx` mocks it, which is exactly why the divergence could
 * not be caught there — and asserts that reconciling the store moves BOTH the
 * link and the identity block.
 */
let currentPathname = "/dashboard";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string;
    params?: { username?: string };
    children: ReactNode;
    [key: string]: unknown;
  }) => {
    // Stands in for the router's own interpolation, so the assertion below is
    // about the value the nav SUPPLIES rather than about TanStack's formatting.
    const href = params?.username
      ? to.replace("$username", encodeURIComponent(params.username))
      : to;
    return (
      <a href={href} {...rest}>
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
  getAuthTokens: () => ({ accessToken: "x" }),
  clearAuthTokens: vi.fn(),
}));
vi.mock("../lib/preferences-sync", () => ({
  useSavePreferences: () => vi.fn(),
}));

import { useUserInfoStore } from "../lib/user-info-store";
import { TopBarNav } from "./top-bar-nav";

const signedInAs = (login: string) =>
  useUserInfoStore.setState({
    userInfo: {
      id: "user-1",
      email: "mariana@example.com",
      login,
      name: "Mariana Manfrin Freitas",
      description: null,
      avatarUrl: null,
      googleId: null,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

const publicProfileLink = () =>
  screen.getAllByRole("link", { name: "Public profile" })[0];

beforeEach(() => {
  currentPathname = "/dashboard";
  signedInAs("marianamanfrinn");
});

afterEach(() => {
  useUserInfoStore.setState({ userInfo: null });
});

describe("the nav after the account is renamed", () => {
  it("points the Public profile link at the new handle", () => {
    render(<TopBarNav theme="light" onToggleTheme={vi.fn()} />);

    expect(publicProfileLink()).toHaveAttribute("href", "/marianamanfrinn");

    act(() => {
      useUserInfoStore.getState().syncUserInfo({
        username: "mariana",
        name: "Mariana Manfrin Freitas",
        userPhoto: null,
      });
    });

    // The 404 in the report was this attribute, one rename out of date.
    expect(publicProfileLink()).toHaveAttribute("href", "/mariana");
  });

  it("shows the new handle in the drawer's identity block", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    render(<TopBarNav theme="light" onToggleTheme={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByText("marianamanfrinn")).toBeInTheDocument();

    act(() => {
      useUserInfoStore.getState().syncUserInfo({
        username: "mariana",
        name: "Mariana Manfrin Freitas",
        userPhoto: null,
      });
    });

    expect(screen.getByText("mariana")).toBeInTheDocument();
    expect(screen.queryByText("marianamanfrinn")).not.toBeInTheDocument();
  });

  /**
   * The active-state comparison is built from the same value. Left stale, the
   * owner standing on their own profile sees no nav item highlighted at all.
   */
  it("marks the item as current when standing on the renamed profile", () => {
    currentPathname = "/mariana";
    render(<TopBarNav theme="light" onToggleTheme={vi.fn()} />);

    expect(publicProfileLink()).not.toHaveAttribute("aria-current", "page");

    act(() => {
      useUserInfoStore.getState().syncUserInfo({
        username: "mariana",
        name: "Mariana Manfrin Freitas",
        userPhoto: null,
      });
    });

    expect(publicProfileLink()).toHaveAttribute("aria-current", "page");
  });
});
