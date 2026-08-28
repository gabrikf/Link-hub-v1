import type {
  FullProfileLayout,
  ProfileBlock,
  ProfileLayout,
  ProfileViewport,
} from "@repo/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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

const {
  fetchLayout,
  fetchMyProfile,
  setTabsEnabled,
  createBlock,
  createTab,
  deleteBlock,
  deleteTab,
  renameTab,
  reorderTabs,
  updateBlock,
  updateBlockPositions,
} = vi.hoisted(() => ({
  fetchLayout: vi.fn(),
  fetchMyProfile: vi.fn(),
  setTabsEnabled: vi.fn(),
  createBlock: vi.fn(),
  createTab: vi.fn(),
  deleteBlock: vi.fn(),
  deleteTab: vi.fn(),
  renameTab: vi.fn(),
  reorderTabs: vi.fn(),
  updateBlock: vi.fn(),
  updateBlockPositions: vi.fn(),
}));

vi.mock("../../../lib/auth-api", () => ({
  fetchLayout,
  fetchMyProfile,
  setTabsEnabled,
  createBlock,
  fetchLinks: () => Promise.resolve([]),
  fetchMyWorkExperiences: () => Promise.resolve([]),
  createTab,
  deleteBlock,
  deleteTab,
  renameTab,
  reorderTabs,
  updateBlock,
  updateBlockPositions,
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
function makeLayout(
  blocksOnLaterTabs: number,
  tabsEnabled: boolean,
): ProfileLayout {
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
    tabsEnabled,
  };
}

/**
 * A stand-in for the two `users.tabs_enabled_*` columns. `fetchLayout` reads it
 * and `setTabsEnabled` writes it, so a test that flips one viewport can prove
 * the OTHER viewport's stored value never moved — the exact bug this round
 * fixes, and one a static mock cannot express.
 */
const server: { pc: boolean; mobile: boolean; blocksOnLaterTabs: number } = {
  pc: true,
  mobile: true,
  blocksOnLaterTabs: 1,
};

const currentLayout = (): FullProfileLayout => ({
  pc: makeLayout(server.blocksOnLaterTabs, server.pc),
  mobile: makeLayout(server.blocksOnLaterTabs, server.mobile),
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

const tabsSwitch = () =>
  screen.getByRole("switch", { name: "Show tabs on my profile" });

const switchTo = async (viewport: ProfileViewport) =>
  userEvent.click(
    screen.getByRole("button", {
      name: viewport === "pc" ? "PC layout" : "Mobile layout",
    }),
  );

const profile = {
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
  links: [],
};

describe("ProfileLayoutPage — the per-viewport tabs switch", () => {
  beforeEach(() => {
    server.pc = true;
    server.mobile = true;
    server.blocksOnLaterTabs = 1;

    // Reset every write mock, not just the ones a given test drives: react-grid
    // -layout emits a layout change when a viewport switch remounts the grid,
    // so `updateBlockPositions` picks up calls that would otherwise leak into
    // the next test's "no block writes" assertion.
    [
      fetchLayout,
      fetchMyProfile,
      setTabsEnabled,
      createBlock,
      createTab,
      deleteBlock,
      deleteTab,
      renameTab,
      reorderTabs,
      updateBlock,
      updateBlockPositions,
    ].forEach((mock) => mock.mockReset());
    updateBlockPositions.mockResolvedValue({ success: true });

    fetchLayout.mockImplementation(() => Promise.resolve(currentLayout()));
    fetchMyProfile.mockResolvedValue(profile);
    setTabsEnabled.mockImplementation(
      ({
        viewport,
        tabsEnabled,
      }: {
        viewport: ProfileViewport;
        tabsEnabled: boolean;
      }) => {
        server[viewport] = tabsEnabled;
        return Promise.resolve();
      },
    );
    createBlock.mockResolvedValue(block({ id: "created" }));
  });

  it("offers the switch with a persistent explanation, not a hover tooltip", async () => {
    const { container } = renderPage();
    await settle(container);

    const toggle = tabsSwitch();
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
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
  });

  /* --------------------------------------------------------------------- *
   * D8 — one flag per viewport
   * --------------------------------------------------------------------- */

  it("turning tabs off for mobile leaves the pc layout's tabs on", async () => {
    const { container } = renderPage();
    await settle(container);

    await switchTo("mobile");
    await userEvent.click(tabsSwitch());

    await waitFor(() => {
      expect(setTabsEnabled).toHaveBeenCalledWith({
        viewport: "mobile",
        tabsEnabled: false,
      });
    });

    // The stored pc value never moved…
    expect(server.pc).toBe(true);
    expect(setTabsEnabled).toHaveBeenCalledTimes(1);

    // …and the editor says so the moment you look at the pc layout.
    await switchTo("pc");
    await waitFor(() => {
      expect(tabsSwitch()).toBeChecked();
    });
    expect(
      await screen.findByRole("button", { name: "Add tab" }),
    ).toBeInTheDocument();
  });

  it("shows each viewport's own flag when the editor viewport changes", async () => {
    server.pc = true;
    server.mobile = false;

    const { container } = renderPage();
    await settle(container);

    expect(tabsSwitch()).toBeChecked();
    expect(container.textContent ?? "").not.toContain("Tabs are off");

    await switchTo("mobile");
    // No stale flash of the pc value: the flag travels with the layout that is
    // already cached, so the switch is right on the first frame after the
    // viewport changes rather than after a refetch.
    expect(tabsSwitch()).not.toBeChecked();
    expect(container.textContent ?? "").toContain("Tabs are off for this view");

    await switchTo("pc");
    expect(tabsSwitch()).toBeChecked();
  });

  /* --------------------------------------------------------------------- *
   * The first click has to land
   * --------------------------------------------------------------------- */

  it("flips the switch and the tab chrome on ONE click, in both viewports", async () => {
    const { container } = renderPage();
    await settle(container);
    await screen.findByRole("button", { name: "Add tab" });

    await userEvent.click(tabsSwitch());

    expect(tabsSwitch()).not.toBeChecked();
    expect(
      screen.queryByRole("button", { name: "Add tab" }),
    ).not.toBeInTheDocument();
    expect(container.textContent ?? "").toContain("Tabs are off for this view");

    await switchTo("mobile");
    await screen.findByRole("button", { name: "Add tab" });

    await userEvent.click(tabsSwitch());

    expect(tabsSwitch()).not.toBeChecked();
    expect(
      screen.queryByRole("button", { name: "Add tab" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the first click even when a layout read is already in flight", async () => {
    /*
     * The three-click bug, distilled. The editor invalidates the layout after
     * every save, so a GET is very often still on the wire when the switch is
     * clicked — and that GET left BEFORE the click, so it answers with the
     * pre-click value. Unless the mutation cancels it, it lands on top of the
     * optimistic patch and stamps the old value back while the PATCH is still
     * in flight: the click looks ignored, and clicking again only starts
     * another request to be swallowed by.
     *
     * Both halves matter. The read is held open past the click, and the WRITE
     * is held open too — `onSettled`'s invalidation would otherwise dispatch a
     * newer read that supersedes the stale one and hides the race.
     */
    const { container, client } = renderPage();
    await settle(container);
    await screen.findByRole("button", { name: "Add tab" });

    let releaseStaleRead = () => {};
    fetchLayout.mockImplementationOnce(() => {
      const staleAnswer = currentLayout();
      return new Promise<FullProfileLayout>((resolve) => {
        releaseStaleRead = () => resolve(staleAnswer);
      });
    });
    client.invalidateQueries({ queryKey: ["layout"] });

    let releaseWrite = () => {};
    setTabsEnabled.mockImplementationOnce(
      ({
        viewport,
        tabsEnabled,
      }: {
        viewport: ProfileViewport;
        tabsEnabled: boolean;
      }) =>
        new Promise<void>((resolve) => {
          releaseWrite = () => {
            server[viewport] = tabsEnabled;
            resolve();
          };
        }),
    );

    await userEvent.click(tabsSwitch());
    expect(tabsSwitch()).not.toBeChecked();

    // The read that left before the click now answers with tabs still ON.
    releaseStaleRead();
    // Long enough for the answer to be applied AND painted: the old code let
    // it through and the switch sprang back here.
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(tabsSwitch()).not.toBeChecked();
    expect(
      screen.queryByRole("button", { name: "Add tab" }),
    ).not.toBeInTheDocument();

    releaseWrite();
    await waitFor(() => {
      expect(tabsSwitch()).not.toBeChecked();
    });
  });

  it("puts the tab chrome back when the save is rejected instead of lying about it", async () => {
    setTabsEnabled.mockRejectedValue(new Error("nope"));

    const { container } = renderPage();
    await settle(container);
    await screen.findByRole("button", { name: "Add tab" });

    await userEvent.click(tabsSwitch());

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Add tab" }),
      ).toBeInTheDocument();
    });
    expect(container.textContent ?? "").not.toContain("Tabs are off");
  });

  /* --------------------------------------------------------------------- *
   * D10 — tabs off hides, it never writes
   * --------------------------------------------------------------------- */

  it("deletes nothing — turning tabs off issues no tab or block write", async () => {
    const { container } = renderPage();
    await settle(container);
    await screen.findByRole("button", { name: "Add tab" });

    await userEvent.click(tabsSwitch());

    await waitFor(() => {
      expect(setTabsEnabled).toHaveBeenCalledTimes(1);
    });

    expect(deleteTab).not.toHaveBeenCalled();
    expect(deleteBlock).not.toHaveBeenCalled();
    expect(updateBlock).not.toHaveBeenCalled();
    expect(createBlock).not.toHaveBeenCalled();
    expect(reorderTabs).not.toHaveBeenCalled();
    expect(updateBlockPositions).not.toHaveBeenCalled();
  });

  it("hides the tab manager and explains why when tabs are off", async () => {
    server.pc = false;

    const { container } = renderPage();
    await settle(container);

    await waitFor(() => {
      expect(container.textContent ?? "").toContain(
        "Tabs are off for this view — visitors see only the always-visible section.",
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

  it("hides the per-block tab selector when tabs are off", async () => {
    server.pc = false;

    const { container } = renderPage();
    await settle(container);

    await waitFor(() => {
      expect(container.textContent ?? "").toContain("Tabs are off");
    });

    // Every "move to tab" select is gone…
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    // …and the Visible switch, which has nothing to do with tabs, stays.
    expect(
      screen.getAllByRole("switch", { name: /Toggle .* visibility/ }).length,
    ).toBeGreaterThan(0);
  });

  it("names the singular count of blocks that stay hidden", async () => {
    server.pc = false;
    server.blocksOnLaterTabs = 1;

    const { container } = renderPage();
    await settle(container);

    await waitFor(() => {
      expect(container.textContent ?? "").toContain(
        "1 block in the tabs section is only hidden, not deleted. Switch tabs back on to show it again.",
      );
    });
  });

  it("names the plural count of blocks that stay hidden", async () => {
    server.pc = false;
    server.blocksOnLaterTabs = 3;

    const { container } = renderPage();
    await settle(container);

    await waitFor(() => {
      expect(container.textContent ?? "").toContain(
        "3 blocks in the tabs section are only hidden, not deleted. Switch tabs back on to show them again.",
      );
    });
  });

  it("says nothing about hidden blocks when there are none to hide", async () => {
    server.pc = false;
    server.blocksOnLaterTabs = 0;

    const { container } = renderPage();
    await settle(container);

    await waitFor(() => {
      expect(container.textContent ?? "").toContain("Tabs are off");
    });
    expect(container.textContent ?? "").not.toContain("only hidden");
  });

  it("shows no modal, dialog or copy prompt when tabs are turned off", async () => {
    const { container } = renderPage();
    await settle(container);
    await screen.findByRole("button", { name: "Add tab" });

    await userEvent.click(tabsSwitch());

    await waitFor(() => {
      expect(container.textContent ?? "").toContain("Tabs are off");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  /* --------------------------------------------------------------------- *
   * D9 — the zone is chosen by the button, not by a per-block switch
   * --------------------------------------------------------------------- */

  it("never renders the per-block 'All tabs' pin switch, tabs on or off", async () => {
    const { container, unmount } = renderPage();
    await settle(container);
    await screen.findByRole("button", { name: "Add tab" });

    expect(
      screen.queryByRole("switch", { name: /Pin .* to all tabs/ }),
    ).not.toBeInTheDocument();

    unmount();
    server.pc = false;

    const second = renderPage();
    await settle(second.container);
    expect(
      screen.queryByRole("switch", { name: /Pin .* to all tabs/ }),
    ).not.toBeInTheDocument();
  });

  it("offers only the always-visible add button while tabs are off", async () => {
    server.pc = false;

    const { container } = renderPage();
    await settle(container);

    expect(
      screen.getByRole("button", { name: "Add to always-visible" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add to tabs section" }),
    ).not.toBeInTheDocument();
  });

  /** Open one of the two add buttons and pick the "Text" kind from its menu. */
  async function addTextBlockVia(buttonName: string) {
    await userEvent.click(screen.getByRole("button", { name: buttonName }));
    const menu = await screen.findByRole("menu", {
      name: "Add a custom block",
    });
    await userEvent.click(within(menu).getByText("Text"));

    await userEvent.type(await screen.findByLabelText("Body"), "Fresh body");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
  }

  it("files a block added from 'Add to tabs section' into the active tab", async () => {
    const { container } = renderPage();
    await settle(container);
    await screen.findByRole("button", { name: "Add tab" });

    await addTextBlockVia("Add to tabs section");

    await waitFor(() => {
      expect(createBlock).toHaveBeenCalledTimes(1);
    });
    const payload = createBlock.mock.calls[0]?.[0];
    // `tabId: null` is what the api reads as "always visible", so a block meant
    // for the tabs section MUST name its tab.
    expect(payload).toMatchObject({ viewport: "pc", tabId: "tab-1" });
  });

  it("files a block added from 'Add to always-visible' outside the tabs", async () => {
    const { container } = renderPage();
    await settle(container);
    await screen.findByRole("button", { name: "Add tab" });

    await addTextBlockVia("Add to always-visible");

    await waitFor(() => {
      expect(createBlock).toHaveBeenCalledTimes(1);
    });
    const payload = createBlock.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ viewport: "pc", tabId: null });
  });
});
