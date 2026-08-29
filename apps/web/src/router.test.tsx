import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What rendered, not where the URL ended up.
 *
 * `e2e/journeys/00-smoke.spec.ts:18-26` documents why: the redirects used to be
 * post-paint effects, so a URL assertion passed VACUOUSLY — the address bar was
 * corrected within a frame while the wrong screen had already been painted and
 * seen. These spies record every render of every page component, so "the login
 * page never rendered" is a claim the test can actually make.
 */
const rendered: string[] = [];

const stubPage = (name: string) => () => {
  rendered.push(name);
  return <div>{name}</div>;
};

vi.mock("./features/auth/pages/auth-page", () => ({
  AuthPage: stubPage("auth-page"),
}));
vi.mock("./features/dashboard/pages/dashboard-page", () => ({
  DashboardPage: stubPage("dashboard-page"),
}));
vi.mock("./features/auth/pages/verify-email-page", () => ({
  VerifyEmailPage: stubPage("verify-email-page"),
}));
vi.mock("./features/auth/pages/forgot-password-page", () => ({
  ForgotPasswordPage: stubPage("forgot-password-page"),
}));
vi.mock("./features/auth/pages/reset-password-page", () => ({
  ResetPasswordPage: stubPage("reset-password-page"),
}));
vi.mock("./features/profile/pages/public-profile-page", () => ({
  PublicProfilePage: stubPage("public-profile-page"),
}));
vi.mock("./features/search/pages/advanced-search-page", () => ({
  AdvancedSearchPage: stubPage("advanced-search-page"),
}));
vi.mock("./features/profile-layout/pages/profile-layout-page", () => ({
  ProfileLayoutPage: stubPage("profile-layout-page"),
}));
vi.mock("./features/posts/pages/posts-page", () => ({
  PostsPage: stubPage("posts-page"),
}));
vi.mock("./features/posts/pages/review-queue-page", () => ({
  ReviewQueuePage: stubPage("review-queue-page"),
}));
vi.mock("./features/settings/pages/settings-page", () => ({
  SettingsPage: stubPage("settings-page"),
}));

// `App` (the root route component) runs the preferences sync, which would put a
// real request behind every navigation in this file.
vi.mock("./lib/auth-api", () => ({
  fetchPreferences: vi.fn().mockResolvedValue({ language: null, theme: "system" }),
  updatePreferences: vi.fn(),
  fetchMyProfile: vi.fn(),
}));

import { router } from "./router";
import { setAuthTokens } from "./lib/auth-tokens";
import { queryClient } from "./lib/query-client";
import { useUserInfoStore } from "./lib/user-info-store";

const signIn = () =>
  useUserInfoStore.setState({
    userInfo: {
      id: "user-1",
      email: "dev@example.com",
      login: "dev",
      name: "Dev",
      description: null,
      avatarUrl: null,
      googleId: null,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

/**
 * A hard load: the router is asked to resolve `path` from scratch, exactly as
 * it is on a cold page load, and only then mounted. This is the moment the bug
 * lived in — the guard has to have decided before anything renders.
 */
const hardLoad = async (path: string) => {
  await router.navigate({ to: path, replace: true });
  await router.load();
  render(
    // Same providers `main.tsx` mounts around the router, minus the boot gate:
    // this file is about the guards, and boot is covered by `lib/app-boot.test.ts`.
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(rendered.length).toBeGreaterThan(0));
};

beforeEach(() => {
  rendered.length = 0;
  queryClient.clear();
  window.localStorage.clear();
  useUserInfoStore.setState({ userInfo: null });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("route guards — a signed-in visitor", () => {
  it("opens the dashboard from `/` without the login page ever rendering", async () => {
    setAuthTokens({ accessToken: "a", refreshToken: "r" });
    signIn();

    await hardLoad("/");

    expect(await screen.findByText("dashboard-page")).toBeInTheDocument();
    expect(rendered).not.toContain("auth-page");
    expect(router.state.location.pathname).toBe("/dashboard");
  });
});

describe("route guards — a signed-out visitor", () => {
  it("lands on the login page from `/dashboard` without the dashboard ever rendering", async () => {
    await hardLoad("/dashboard");

    expect(await screen.findByText("auth-page")).toBeInTheDocument();
    expect(rendered).not.toContain("dashboard-page");
    expect(router.state.location.pathname).toBe("/");
  });

  it.each([
    "/dashboard/search",
    "/dashboard/layout",
    "/dashboard/posts",
    "/dashboard/posts/review",
    "/dashboard/settings",
  ])("bounces %s the same way", async (path) => {
    await hardLoad(path);

    expect(await screen.findByText("auth-page")).toBeInTheDocument();
    expect(rendered).toEqual(["auth-page"]);
  });

  /**
   * The public profile is the product's shareable artefact. A stranger with no
   * session has to reach it, so it must be the one route no guard touches.
   */
  it("still reaches a public profile", async () => {
    await hardLoad("/profile/ada");

    expect(await screen.findByText("public-profile-page")).toBeInTheDocument();
    expect(rendered).not.toContain("auth-page");
  });

  /**
   * Half a session is not a session: `userInfo` is what the top bar and every
   * "is this me?" check read, and no endpoint can rebuild it. Tokens alone must
   * not open the dashboard.
   */
  it("treats tokens without a stored user as no session", async () => {
    setAuthTokens({ accessToken: "a", refreshToken: "r" });

    await hardLoad("/dashboard");

    expect(await screen.findByText("auth-page")).toBeInTheDocument();
    expect(rendered).not.toContain("dashboard-page");
  });
});

/**
 * The email-link routes carry their own decision: NO guard.
 *
 * Both are reached by clicking a link in an email, from whatever browser the
 * mail client opens — which may already hold a session for a different account,
 * or a stale one this device never cleared. `requireAnonymous` would bounce
 * exactly those people to `/dashboard` and leave the account unverified
 * forever with no way to tell why; `requireSession` would bounce the people the
 * pages exist for.
 */
describe("route guards — the email-link routes", () => {
  it.each([
    ["/verify-email", "verify-email-page"],
    ["/reset-password", "reset-password-page"],
    ["/forgot-password", "forgot-password-page"],
  ])("opens %s with no session at all", async (path, page) => {
    await hardLoad(path);

    expect(await screen.findByText(page)).toBeInTheDocument();
    expect(rendered).not.toContain("auth-page");
    expect(router.state.location.pathname).toBe(path);
  });

  it.each([
    ["/verify-email", "verify-email-page"],
    ["/reset-password", "reset-password-page"],
  ])("opens %s even while a DIFFERENT account is signed in", async (path, page) => {
    setAuthTokens({ accessToken: "a", refreshToken: "r" });
    signIn();

    await hardLoad(path);

    expect(await screen.findByText(page)).toBeInTheDocument();
    expect(rendered).not.toContain("dashboard-page");
  });

  /** The query string survives the guards — the page is what strips it. */
  it("keeps the token in the URL long enough for the page to read it", async () => {
    await hardLoad("/verify-email?token=abc123");

    expect(await screen.findByText("verify-email-page")).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ token: "abc123" });
  });
});
