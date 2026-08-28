import type {
  FullProfileLayout,
  ProfileBlock,
  ProfileLayout,
} from "@repo/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("../../../lib/profile-queries", () => ({
  useMyResumeQuery: () => ({ data: undefined, isLoading: false }),
}));

const { fetchLayout, fetchMyProfile, updateProfile } = vi.hoisted(() => ({
  fetchLayout: vi.fn(),
  fetchMyProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("../../../lib/auth-api", () => ({
  fetchLayout,
  fetchMyProfile,
  updateProfile,
  fetchLinks: () => Promise.resolve([]),
  fetchMyWorkExperiences: () => Promise.resolve([]),
  createBlock: vi.fn(),
  createTab: vi.fn(),
  deleteBlock: vi.fn(),
  deleteTab: vi.fn(),
  renameTab: vi.fn(),
  reorderTabs: vi.fn(),
  updateBlock: vi.fn(),
  updateBlockPositions: vi.fn(),
}));

import { ProfileLayoutPage } from "./profile-layout-page";

const block = (overrides: Partial<ProfileBlock>): ProfileBlock => ({
  id: "block",
  groupId: "g",
  kind: "text",
  tabId: "tab-1",
  gridX: 0,
  gridY: 0,
  gridW: 12,
  gridH: 2,
  isVisible: true,
  pinnedAllTabs: false,
  config: { body: "Body" },
  ...overrides,
});

/** `blocksOnLaterTabs` controls how many blocks the tabs-off warning counts. */
function makeLayout(blocksOnLaterTabs: number): ProfileLayout {
  const later = Array.from({ length: blocksOnLaterTabs }, (_, index) =>
    block({
      id: `later-${index}`,
      tabId: "tab-2",
      gridY: index * 2,
      config: { body: `Later body ${index}` },
    }),
  );

  return {
    tabs: [
      { id: "tab-1", title: "Main", order: 0 },
      { id: "tab-2", title: "Posts", order: 1 },
    ],
    blocks: [
      block({
        id: "pinned-header",
        kind: "header",
        tabId: null,
        pinnedAllTabs: true,
        config: null,
      }),
      block({ id: "first", tabId: "tab-1", config: { body: "First body" } }),
      ...later,
    ],
  };
}

const fullLayout = (blocksOnLaterTabs: number): FullProfileLayout => ({
  pc: makeLayout(blocksOnLaterTabs),
  mobile: makeLayout(blocksOnLaterTabs),
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <ProfileLayoutPage />
      </QueryClientProvider>,
    ),
  };
}

/** The editor is settled once the tab-strip skeleton copy is gone. */
async function settle(container: HTMLElement) {
  await waitFor(() => {
    expect(container.textContent ?? "").not.toContain("Loading tabs");
  });
}

const profile = (tabsEnabled: boolean) => ({
  username: "ada",
  name: "Ada Lovelace",
  description: null,
  userPhoto: null,
  backgroundImageUrl: null,
  bannerImageUrl: null,
  themeAccent: null,
  themePreset: null,
  openToWork: false,
  location: null,
  persona: null,
  tabsEnabled,
  links: [],
});

describe("ProfileLayoutPage — the tabs switch", () => {
  beforeEach(() => {
    fetchLayout.mockReset();
    fetchMyProfile.mockReset();
    updateProfile.mockReset();
    fetchLayout.mockResolvedValue(fullLayout(1));
    updateProfile.mockResolvedValue({});
  });

  it("offers the switch with a persistent explanation, not a hover tooltip", async () => {
    fetchMyProfile.mockResolvedValue(profile(true));

    const { container } = renderPage();
    await settle(container);

    const toggle = await screen.findByRole("switch", {
      name: "Show tabs on my profile",
    });
    expect(toggle).toBeChecked();

    // The help text is in the document at all times (no hover, no focus), and
    // the switch points at it — the whole reason a `title` attribute was not
    // used: it is invisible on touch and to a screen reader.
    const hintId = toggle.getAttribute("aria-describedby");
    expect(hintId).toBeTruthy();
    const hint = container.querySelector(`#${hintId}`);
    expect(hint?.textContent ?? "").toContain(
      "Tabs let visitors switch between sections",
    );
  });

  it("shows the tab manager while tabs are on", async () => {
    fetchMyProfile.mockResolvedValue(profile(true));

    const { container } = renderPage();
    await settle(container);

    expect(
      await screen.findByRole("button", { name: "Add tab" }),
    ).toBeInTheDocument();
    expect(container.textContent ?? "").not.toContain("Tabs are off");

    // POSITIVE CONTROL for the "tabs off" test below: every one of these is
    // present here, so the absences asserted there mean something.
    expect(
      screen.getByRole("button", { name: "Rename Main" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Main" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Move Main right" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("switch", { name: /Pin .* to all tabs/ }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
  });

  it("hides the tab manager and explains why when tabs are off", async () => {
    fetchMyProfile.mockResolvedValue(profile(false));

    const { container } = renderPage();
    await settle(container);

    await waitFor(() => {
      expect(container.textContent ?? "").toContain(
        "Tabs are off — visitors see only this section.",
      );
    });

    // No add/rename/delete/reorder chrome for a section the profile does not
    // show.
    expect(
      screen.queryByRole("button", { name: "Add tab" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Rename Main/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Delete Main/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Move Main/ }),
    ).not.toBeInTheDocument();

    // The user still edits the first tab's grid.
    expect(container.textContent ?? "").toContain("Tip: drag any edge");
  });

  it("hides the per-block pin and tab-select controls when tabs are off", async () => {
    fetchMyProfile.mockResolvedValue(profile(false));

    const { container } = renderPage();
    await settle(container);

    await waitFor(() => {
      expect(container.textContent ?? "").toContain("Tabs are off");
    });

    // "All tabs" pin switches are gone…
    expect(
      screen.queryByRole("switch", { name: /Pin .* to all tabs/ }),
    ).not.toBeInTheDocument();
    // …and so is every "move to tab" select.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    // The Visible switch, which has nothing to do with tabs, stays.
    expect(
      screen.getAllByRole("switch", { name: /Toggle .* visibility/ }).length,
    ).toBeGreaterThan(0);
  });

  it("names the singular count of blocks that stay hidden", async () => {
    fetchLayout.mockResolvedValue(fullLayout(1));
    fetchMyProfile.mockResolvedValue(profile(false));

    const { container } = renderPage();
    await settle(container);

    await waitFor(() => {
      expect(container.textContent ?? "").toContain(
        "1 block lives on another tab and stays hidden while tabs are off.",
      );
    });
  });

  it("names the plural count of blocks that stay hidden", async () => {
    fetchLayout.mockResolvedValue(fullLayout(3));
    fetchMyProfile.mockResolvedValue(profile(false));

    const { container } = renderPage();
    await settle(container);

    await waitFor(() => {
      expect(container.textContent ?? "").toContain(
        "3 blocks live on other tabs and stay hidden while tabs are off.",
      );
    });
  });

  it("says nothing about hidden blocks when there are none to hide", async () => {
    fetchLayout.mockResolvedValue(fullLayout(0));
    fetchMyProfile.mockResolvedValue(profile(false));

    const { container } = renderPage();
    await settle(container);

    await waitFor(() => {
      expect(container.textContent ?? "").toContain("Tabs are off");
    });
    expect(container.textContent ?? "").not.toContain("stays hidden");
    expect(container.textContent ?? "").not.toContain("stay hidden");
  });

  it("persists the change and drops the tab chrome without waiting for the server", async () => {
    fetchMyProfile.mockResolvedValue(profile(true));
    // Never settles: if the UI waited on the round-trip, the tab strip would
    // still be there when the assertions below run.
    updateProfile.mockReturnValue(new Promise(() => {}));

    const { container } = renderPage();
    await settle(container);
    expect(
      await screen.findByRole("button", { name: "Add tab" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("switch", { name: "Show tabs on my profile" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Add tab" }),
      ).not.toBeInTheDocument();
    });
    expect(container.textContent ?? "").toContain("Tabs are off");

    expect(updateProfile).toHaveBeenCalledWith({
      username: "ada",
      tabsEnabled: false,
    });
  });

  it("puts the tab chrome back when the save is rejected instead of lying about it", async () => {
    fetchMyProfile.mockResolvedValue(profile(true));
    updateProfile.mockRejectedValue(new Error("nope"));

    const { container } = renderPage();
    await settle(container);
    await screen.findByRole("button", { name: "Add tab" });

    await userEvent.click(
      screen.getByRole("switch", { name: "Show tabs on my profile" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Add tab" }),
      ).toBeInTheDocument();
    });
    expect(container.textContent ?? "").not.toContain("Tabs are off");
  });

  it("deletes nothing — turning tabs off issues no tab or block write", async () => {
    fetchMyProfile.mockResolvedValue(profile(true));

    const { container } = renderPage();
    await settle(container);
    await screen.findByRole("button", { name: "Add tab" });

    await userEvent.click(
      screen.getByRole("switch", { name: "Show tabs on my profile" }),
    );

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledTimes(1);
    });

    const api = await import("../../../lib/auth-api");
    expect(api.deleteTab).not.toHaveBeenCalled();
    expect(api.deleteBlock).not.toHaveBeenCalled();
    expect(api.updateBlock).not.toHaveBeenCalled();
    expect(api.reorderTabs).not.toHaveBeenCalled();
    expect(api.updateBlockPositions).not.toHaveBeenCalled();
  });
});
