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

/**
 * `blocksOnFirstTab` + `blocksOnLaterTabs` control how many blocks the tabs-off
 * warning counts. Under the tabs-v3 rule BOTH count: tabs off publishes the
 * always-visible zone alone, so a block on tab 1 is hidden exactly like one on
 * tab 2. The first tab's count is a knob for that reason — the old fixture
 * hard-coded one block there and could not express "nothing to hide".
 */
function makeLayout(
  blocksOnFirstTab: number,
  blocksOnLaterTabs: number,
  tabsEnabled: boolean,
): ProfileLayout {
  const first = Array.from({ length: blocksOnFirstTab }, (_, index) =>
    block({
      id: `first-${index}`,
      tabId: "tab-1",
      gridY: index * 2,
      config: { body: `First body ${index}` },
    }),
  );
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
      ...first,
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
const server: {
  pc: boolean;
  mobile: boolean;
  blocksOnFirstTab: number;
  blocksOnLaterTabs: number;
} = {
  pc: true,
  mobile: true,
  blocksOnFirstTab: 1,
  blocksOnLaterTabs: 1,
};

const currentLayout = (): FullProfileLayout => ({
  pc: makeLayout(server.blocksOnFirstTab, server.blocksOnLaterTabs, server.pc),
  mobile: makeLayout(
    server.blocksOnFirstTab,
    server.blocksOnLaterTabs,
    server.mobile,
  ),
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
    server.blocksOnFirstTab = 1;
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
    void client.invalidateQueries({ queryKey: ["layout"] });

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

    // UPDATED for the tabs-v3 rule. This used to end with "The user still
    // edits the first tab's grid" — they do not: with tabs off the editor shows
    // the always-visible zone alone, matching what the profile publishes. The
    // resize hint is still on the page because the always-visible grid is still
    // editable; it simply moved above both grids.
    expect(container.textContent ?? "").toContain("Tip: drag any edge");
    // No tab grid: the pinned header is the only card left.
    expect(
      screen.queryAllByRole("switch", { name: "Toggle Text visibility" }),
    ).toHaveLength(0);
    expect(container.textContent ?? "").not.toContain("This tab has no blocks");
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

  // UPDATED for the tabs-v3 rule: one block on a LATER tab used to be the only
  // thing counted. Now the first tab's block counts too, so "1" is expressed as
  // a single block on the first tab and nothing beyond it.
  it("names the singular count of blocks that stay hidden", async () => {
    server.pc = false;
    server.blocksOnFirstTab = 1;
    server.blocksOnLaterTabs = 0;

    const { container } = renderPage();
    await settle(container);

    await waitFor(() => {
      expect(container.textContent ?? "").toContain(
        "1 block in the tabs section is only hidden, not deleted. Switch tabs back on to show it again.",
      );
    });
  });

  // UPDATED for the tabs-v3 rule: same fixture, and the answer went from 3 to
  // 4 because the block on the first tab is hidden now as well.
  it("names the plural count of blocks that stay hidden", async () => {
    server.pc = false;
    server.blocksOnFirstTab = 1;
    server.blocksOnLaterTabs = 3;

    const { container } = renderPage();
    await settle(container);

    await waitFor(() => {
      expect(container.textContent ?? "").toContain(
        "4 blocks in the tabs section are only hidden, not deleted. Switch tabs back on to show them again.",
      );
    });
  });

  // UPDATED for the tabs-v3 rule: "nothing to hide" now means no tab blocks at
  // all, on any tab — the first tab included.
  it("says nothing about hidden blocks when there are none to hide", async () => {
    server.pc = false;
    server.blocksOnFirstTab = 0;
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

/* ------------------------------------------------------------------------- *
 * v3 — tabs off is the always-visible zone and nothing else, and each add
 * button lives in the section it fills.
 * ------------------------------------------------------------------------- */

/** The always-visible `<section>`, located by the heading that names it. */
const alwaysVisibleSection = () => {
  const section = screen
    .getByRole("heading", { name: "Always visible" })
    .closest("section");
  if (!section) {
    throw new Error("the always-visible section is not in the document");
  }
  return section;
};

/** The tab-manager `<section>`, located by the switch that governs it. */
const tabManagerSection = () => {
  const section = tabsSwitch().closest("section");
  if (!section) {
    throw new Error("the tab-manager section is not in the document");
  }
  return section;
};

describe("ProfileLayoutPage — the editor grid with tabs off", () => {
  beforeEach(() => {
    server.pc = true;
    server.mobile = true;
    server.blocksOnFirstTab = 1;
    server.blocksOnLaterTabs = 1;

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

  /**
   * THE REPORTED BUG, editor half. The tab grid used to keep rendering the
   * first tab with tabs off, so the owner edited a section their visitors could
   * not see.
   */
  it("renders no tab grid at all when tabs are off", async () => {
    server.pc = false;

    const { container } = renderPage();
    await settle(container);

    await waitFor(() => {
      expect(container.textContent ?? "").toContain("Tabs are off");
    });

    // Editor cards are labelled by block KIND, so the two text blocks (one on
    // tab 1, one on tab 2) are gone and the tab grid's empty state with them.
    expect(
      screen.queryAllByRole("switch", { name: "Toggle Text visibility" }),
    ).toHaveLength(0);
    expect(container.textContent ?? "").not.toContain("This tab has no blocks");

    // The pinned header is the only card left, so it is the only visibility
    // switch — a positive control that the grid itself still renders.
    const visibilitySwitches = screen.getAllByRole("switch", {
      name: /Toggle .* visibility/,
    });
    expect(visibilitySwitches).toHaveLength(1);
    expect(
      screen.getByRole("switch", { name: "Toggle Profile header visibility" }),
    ).toBeInTheDocument();
  });

  it("brings the tab grid straight back when tabs go on again", async () => {
    server.pc = false;

    const { container } = renderPage();
    await settle(container);
    await waitFor(() => {
      expect(container.textContent ?? "").toContain("Tabs are off");
    });

    await userEvent.click(tabsSwitch());

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "Toggle Text visibility" }),
      ).toBeInTheDocument();
    });
    // Off -> on is a clean undo: no block was ever rewritten to hide them.
    expect(updateBlock).not.toHaveBeenCalled();
    expect(deleteBlock).not.toHaveBeenCalled();
    expect(createBlock).not.toHaveBeenCalled();
  });

  it("keeps the tab grid while tabs are on", async () => {
    const { container } = renderPage();
    await settle(container);

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "Toggle Text visibility" }),
      ).toBeInTheDocument();
    });
    expect(container.textContent ?? "").toContain("Tip: drag any edge");
  });
});

describe("ProfileLayoutPage — each add button sits in the section it fills", () => {
  beforeEach(() => {
    server.pc = true;
    server.mobile = true;
    server.blocksOnFirstTab = 1;
    server.blocksOnLaterTabs = 1;

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

  /**
   * CONTAINMENT, not presence. Both buttons used to sit together in the tab
   * manager, which is exactly why nobody could tell which zone each one filled;
   * "it exists somewhere on the page" would have passed against that build.
   */
  it("puts 'Add to always-visible' inside the always-visible section", async () => {
    const { container } = renderPage();
    await settle(container);
    await screen.findByRole("button", { name: "Add tab" });

    expect(
      within(alwaysVisibleSection()).getByRole("button", {
        name: "Add to always-visible",
      }),
    ).toBeInTheDocument();

    expect(
      within(tabManagerSection()).queryByRole("button", {
        name: "Add to always-visible",
      }),
    ).not.toBeInTheDocument();
  });

  it("puts 'Add to tabs section' inside the tab-manager section", async () => {
    const { container } = renderPage();
    await settle(container);
    await screen.findByRole("button", { name: "Add tab" });

    expect(
      within(tabManagerSection()).getByRole("button", {
        name: "Add to tabs section",
      }),
    ).toBeInTheDocument();

    expect(
      within(alwaysVisibleSection()).queryByRole("button", {
        name: "Add to tabs section",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps 'Add to always-visible' in its own section with tabs off", async () => {
    server.pc = false;

    const { container } = renderPage();
    await settle(container);
    await waitFor(() => {
      expect(container.textContent ?? "").toContain("Tabs are off");
    });

    expect(
      within(alwaysVisibleSection()).getByRole("button", {
        name: "Add to always-visible",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add to tabs section" }),
    ).not.toBeInTheDocument();
  });

  it("still files a block from the relocated button into the pinned zone", async () => {
    const { container } = renderPage();
    await settle(container);
    await screen.findByRole("button", { name: "Add tab" });

    // The menu now opens from inside the always-visible section; the payload
    // must be unchanged.
    await userEvent.click(
      within(alwaysVisibleSection()).getByRole("button", {
        name: "Add to always-visible",
      }),
    );
    const menu = await screen.findByRole("menu", {
      name: "Add a custom block",
    });
    await userEvent.click(within(menu).getByText("Text"));
    await userEvent.type(await screen.findByLabelText("Body"), "Fresh body");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(createBlock).toHaveBeenCalledTimes(1);
    });
    expect(createBlock.mock.calls[0]?.[0]).toMatchObject({
      viewport: "pc",
      tabId: null,
    });
  });

  it("opens only one block-kind menu at a time", async () => {
    const { container } = renderPage();
    await settle(container);
    await screen.findByRole("button", { name: "Add tab" });

    await userEvent.click(
      screen.getByRole("button", { name: "Add to always-visible" }),
    );
    expect(
      await screen.findByRole("menu", { name: "Add a custom block" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Add to tabs section" }),
    );
    // One menu in the document, owned by the tabs row now.
    const menus = screen.getAllByRole("menu", { name: "Add a custom block" });
    expect(menus).toHaveLength(1);
    expect(tabManagerSection().contains(menus[0] ?? null)).toBe(true);
  });
});
