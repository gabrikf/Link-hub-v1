import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE REPORTED BUG, AT THE SCREEN THAT CAUSES IT.
 *
 * Renaming the handle is a two-place change and only one place was written.
 * `PUT /profile` moves `users.login`, the `["me"]` query is invalidated and
 * the dashboard re-reads the new handle — but `crafthub.auth.user-info` in
 * `localStorage`, which is what `TopBarNav` builds the "Public profile" link
 * out of, still holds the handle from sign-in. The link then points at a
 * username nobody owns, the api answers 404, and the owner lands on the public
 * profile's "Profile not found" screen. Signing out was the only cure.
 *
 * This file deliberately does NOT mock `user-info-store`: the store IS the
 * thing under test. Sibling `dashboard-page.test.tsx` mocks it, which is why
 * this lives in its own file with its own module registry.
 */

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("../../../lib/auth-tokens", () => ({
  getAuthTokens: () => ({ accessToken: "x", refreshToken: "y" }),
}));

const savedProfile = {
  username: "ada",
  name: "Ada Lovelace",
  description: "Builds engines.",
  userPhoto: null,
  bannerImageUrl: null,
  backgroundImageUrl: null,
  themePreset: null,
  themeAccent: null,
  openToWork: false,
  location: null,
  persona: null,
  personaOther: null,
  links: [],
};

const fetchMyProfile = vi.fn();
const updateProfile = vi.fn();

vi.mock("../../../lib/auth-api", () => ({
  fetchMyProfile: () => fetchMyProfile(),
  fetchLinks: () => Promise.resolve([]),
  fetchSkillsCatalog: () => Promise.resolve([]),
  fetchTitlesCatalog: () => Promise.resolve([]),
  createLink: vi.fn(),
  updateLink: vi.fn(),
  deleteLink: vi.fn(),
  reorderLinks: vi.fn(),
  toggleLinkVisibility: vi.fn(),
  updateProfile: (payload: unknown) => updateProfile(payload),
  /*
   * The form asks the api whether a typed handle is free. Without this the
   * import is undefined, the query rejects, and every run of this file quietly
   * paints "Could not check this username right now." — the failure path of a
   * feature this file is not about, with no assertion to notice.
   */
  fetchUsernameAvailability: () =>
    Promise.resolve({ username: "ada-lovelace", isAvailable: true, reason: null }),
  upsertResume: vi.fn(),
  saveResumeSkillsBulk: vi.fn(),
  saveResumeTitlesBulk: vi.fn(),
  createSkillCatalogItem: vi.fn(),
  createTitleCatalogItem: vi.fn(),
}));
vi.mock("../../../lib/profile-queries", () => ({
  useMyResumeQuery: () => ({ data: null, isLoading: false, isError: false }),
}));
vi.mock("../../work-history/components/work-history-manager", () => ({
  WorkHistoryManager: () => null,
}));
vi.mock("../../resume-import/components/resume-import-modal", () => ({
  ResumeImportModal: () => null,
}));

import { useUserInfoStore } from "../../../lib/user-info-store";
import { DashboardPage } from "./dashboard-page";

beforeEach(() => {
  fetchMyProfile.mockResolvedValue(savedProfile);
  updateProfile.mockImplementation((payload: { username: string }) =>
    Promise.resolve({
      id: "user-1",
      username: payload.username,
      name: "Ada Lovelace",
      description: "Builds engines.",
      userPhoto: null,
      backgroundImageUrl: null,
      bannerImageUrl: null,
      themeAccent: null,
      themePreset: null,
      openToWork: false,
      location: null,
      persona: null,
      personaOther: null,
    }),
  );
  useUserInfoStore.setState({
    userInfo: {
      id: "user-1",
      email: "ada@example.com",
      login: "ada",
      name: "Ada Lovelace",
      description: null,
      avatarUrl: null,
      googleId: null,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
  useUserInfoStore.setState({ userInfo: null });
});

describe("renaming the handle from the dashboard", () => {
  it("moves the signed-in identity to the new handle, so the Public profile link still resolves", async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <DashboardPage />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /edit profile/i }));

    const usernameField = await screen.findByLabelText(/^username$/i);
    await user.clear(usernameField);
    await user.type(usernameField, "ada-lovelace");
    await user.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ username: "ada-lovelace" }),
      ),
    );

    // The assertion the bug is about: this value is what TopBarNav interpolates
    // into `/$username`. Left at "ada" it is a link to a profile that no longer
    // exists.
    await waitFor(() =>
      expect(useUserInfoStore.getState().userInfo?.login).toBe("ada-lovelace"),
    );
    expect(useUserInfoStore.getState().userInfo?.email).toBe("ada@example.com");
  });
});
