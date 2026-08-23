import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
vi.mock("../../../lib/user-info-store", () => ({
  useUserInfoStore: (selector: (state: unknown) => unknown) =>
    selector({ userInfo: { login: "ada", name: "Ada Lovelace" } }),
}));

const fetchMyProfile = vi.fn();
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
  updateProfile: vi.fn(),
  upsertResume: vi.fn(),
  saveResumeSkillsBulk: vi.fn(),
  saveResumeTitlesBulk: vi.fn(),
  createSkillCatalogItem: vi.fn(),
  createTitleCatalogItem: vi.fn(),
}));
vi.mock("../../../lib/profile-queries", () => ({
  useMyResumeQuery: () => ({ data: null, isLoading: false, isError: false }),
}));

// The resume, work-history and import panels have their own tests and their own
// network wiring; stubbed so this file stays about the profile panel's states.
vi.mock("../../work-history/components/work-history-manager", () => ({
  WorkHistoryManager: () => null,
}));
vi.mock("../../resume-import/components/resume-import-modal", () => ({
  ResumeImportModal: () => null,
}));

import { DashboardPage } from "./dashboard-page";

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  fetchMyProfile.mockReset();
});

describe("DashboardPage profile panel", () => {
  it("shows an error state, not the empty state, when GET /me fails", async () => {
    fetchMyProfile.mockRejectedValue(new Error("Request failed with status 500"));

    renderDashboard();

    // The failure has to be announced. Today the panel renders the empty state
    // verbatim, so a user whose request merely 5xx'd cannot tell a transient
    // outage from an account that lost everything.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn.t load your profile/i,
    );

    // And it must not be dressed up as an account with nothing in it.
    expect(screen.queryByText("No description yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("Your name")).not.toBeInTheDocument();
    expect(screen.queryByText("@username")).not.toBeInTheDocument();

    // The Edit button opens a dialog whose every field is blank on this path —
    // an invitation to retype a profile that was never lost.
    expect(
      screen.queryByRole("button", { name: /edit profile/i }),
    ).not.toBeInTheDocument();
  });

  it("still renders the saved profile when GET /me succeeds", async () => {
    fetchMyProfile.mockResolvedValue({
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
    });

    renderDashboard();

    expect(await screen.findByText("Builds engines.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /edit profile/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
