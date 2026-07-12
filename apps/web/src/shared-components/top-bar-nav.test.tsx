import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let currentPathname = "/dashboard";

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
    const { params: _params, ...anchorProps } = rest as Record<string, unknown>;
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
  getAuthTokens: () => ({ accessToken: "x" }),
  clearAuthTokens: vi.fn(),
}));
vi.mock("../lib/user-info-store", () => ({
  useUserInfoStore: (selector: (state: unknown) => unknown) =>
    selector({
      userInfo: { login: "ada", name: "Ada Lovelace" },
      clearUserInfo: vi.fn(),
    }),
}));

import { TopBarNav } from "./top-bar-nav";

const NAV_LABELS = [
  "Dashboard",
  "Profile layout",
  "Posts",
  "Recruiter search",
  "Public profile",
  "Settings",
];

describe("TopBarNav (desktop)", () => {
  it("exposes an accessible name (aria-label) for every nav item", () => {
    render(<TopBarNav />);
    for (const label of NAV_LABELS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    // Logout is a button with an accessible name.
    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
  });

  it("renders desktop nav items icon-only (no visible wrapping text label)", () => {
    render(<TopBarNav />);
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
    render(<TopBarNav />);
    const active = screen.getByRole("link", { name: "Posts" });
    expect(active.className).toContain("bg-violet-700");

    const inactive = screen.getByRole("link", { name: "Dashboard" });
    expect(inactive.className).not.toContain("bg-violet-700");
    currentPathname = "/dashboard";
  });
});
