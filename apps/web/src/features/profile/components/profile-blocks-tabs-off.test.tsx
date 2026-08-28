import type { LinkResponse, ProfileBlock, ProfileLayout } from "@repo/schemas";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileBlocks } from "./profile-blocks";

const profile = {
  name: "Ada Lovelace",
  username: "ada",
  description: "Mathematician and first programmer.",
  userPhoto: null,
};

const links: LinkResponse[] = [];

const block = (overrides: Partial<ProfileBlock>): ProfileBlock => ({
  id: "block",
  groupId: "g",
  kind: "text",
  tabId: "tab-1",
  gridX: 0,
  gridY: 0,
  gridW: 4,
  gridH: 2,
  isVisible: true,
  pinnedAllTabs: false,
  config: null,
  ...overrides,
});

/** Three tabs, one block on each, plus a block pinned across all of them. */
const threeTabLayout: ProfileLayout = {
  tabsEnabled: true,
  tabs: [
    { id: "tab-1", title: "Main", order: 0 },
    { id: "tab-2", title: "Posts", order: 1 },
    { id: "tab-3", title: "Talks", order: 2 },
  ],
  blocks: [
    block({
      id: "pinned-1",
      tabId: null,
      pinnedAllTabs: true,
      config: { body: "Pinned everywhere" },
    }),
    block({ id: "b1", tabId: "tab-1", config: { body: "First tab body" } }),
    block({ id: "b2", tabId: "tab-2", config: { body: "Second tab body" } }),
    block({ id: "b3", tabId: "tab-3", config: { body: "Third tab body" } }),
  ],
};

const renderBlocks = (layout: ProfileLayout, tabsEnabled?: boolean) =>
  render(
    <ProfileBlocks
      layout={layout}
      viewport="pc"
      profile={profile}
      links={links}
      resume={null}
      workExperiences={[]}
      {...(tabsEnabled === undefined ? {} : { tabsEnabled })}
    />,
  );

describe("ProfileBlocks — tabs switched off", () => {
  it("renders no tab strip at all, even with three tabs", () => {
    renderBlocks(threeTabLayout, false);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    // The tab titles must not leak onto the page as plain text either.
    expect(screen.queryByText("Posts")).not.toBeInTheDocument();
    expect(screen.queryByText("Talks")).not.toBeInTheDocument();
  });

  /**
   * THE REPORTED BUG. This case used to assert the opposite — that the FIRST
   * tab's blocks still showed — which is what let a visitor read content the
   * owner had switched off. With tabs off the page is the always-visible zone
   * and nothing else, so no tab's blocks render, the first tab's included.
   */
  it("shows no tab blocks at all, not even the first tab's", () => {
    renderBlocks(threeTabLayout, false);

    expect(screen.queryByText("First tab body")).not.toBeInTheDocument();
    expect(screen.queryByText("Second tab body")).not.toBeInTheDocument();
    expect(screen.queryByText("Third tab body")).not.toBeInTheDocument();
  });

  /**
   * REGRESSION GUARD. Pinned blocks are the shared zone — they render on EVERY
   * tab, so turning tabs off cannot be what hides them. Dropping them here
   * would silently delete content (the header, the links, the avatar) from a
   * profile whose owner only asked for a single-page layout.
   */
  it("still renders pinned blocks", () => {
    renderBlocks(threeTabLayout, false);

    expect(screen.getByText("Pinned everywhere")).toBeInTheDocument();
  });

  // UPDATED for the tabs-v3 rule. Tab order used to decide which single tab
  // survived the switch; no tab survives it now, so the case is kept as proof
  // that no ordering quirk can smuggle a tab's blocks back onto the page.
  it("hides every tab's blocks whatever order the tabs are stored in", () => {
    const shuffled: ProfileLayout = {
      tabsEnabled: true,
      tabs: [
        { id: "tab-late", title: "Late", order: 5 },
        { id: "tab-early", title: "Early", order: 0 },
      ],
      blocks: [
        block({ id: "l", tabId: "tab-late", config: { body: "Late body" } }),
        block({ id: "e", tabId: "tab-early", config: { body: "Early body" } }),
      ],
    };

    renderBlocks(shuffled, false);

    expect(screen.queryByText("Early body")).not.toBeInTheDocument();
    expect(screen.queryByText("Late body")).not.toBeInTheDocument();
  });

  /**
   * The pinned zone is the ONLY zone tabs-off publishes, so `isVisible` on a
   * pinned block still has to be honoured there. Asserting it on a tab block
   * would prove nothing now — every tab block is absent either way.
   */
  it("still hides pinned blocks the owner marked invisible", () => {
    const layout: ProfileLayout = {
      tabsEnabled: true,
      tabs: [{ id: "tab-1", title: "Main", order: 0 }],
      blocks: [
        block({
          id: "shown",
          tabId: null,
          pinnedAllTabs: true,
          config: { body: "Shown body" },
        }),
        block({
          id: "gone",
          tabId: null,
          pinnedAllTabs: true,
          isVisible: false,
          config: { body: "Hidden body" },
        }),
      ],
    };

    renderBlocks(layout, false);

    expect(screen.getByText("Shown body")).toBeInTheDocument();
    expect(screen.queryByText("Hidden body")).not.toBeInTheDocument();
  });

  /**
   * The live preview in the editor renders this very component with the same
   * flag, so "the preview disagrees with the public page" can only happen if
   * the two are handed different props — never because the component decides
   * differently. Pinning that here keeps the preview honest for free.
   */
  it("renders the same single zone whether it is the full page or the preview", () => {
    const { unmount } = renderBlocks(threeTabLayout, false);
    expect(screen.getByText("Pinned everywhere")).toBeInTheDocument();
    expect(screen.queryByText("First tab body")).not.toBeInTheDocument();
    unmount();

    render(
      <ProfileBlocks
        layout={threeTabLayout}
        viewport="pc"
        profile={profile}
        links={links}
        resume={null}
        workExperiences={[]}
        variant="preview"
        tabsEnabled={false}
      />,
    );

    expect(screen.getByText("Pinned everywhere")).toBeInTheDocument();
    expect(screen.queryByText("First tab body")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});

describe("ProfileBlocks — tabs switched on (no regression)", () => {
  it("renders the tablist with three tabs", () => {
    renderBlocks(threeTabLayout, true);

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Posts" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Talks" })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });

  it("renders the tablist when the prop is omitted (tabs default to on)", () => {
    renderBlocks(threeTabLayout);

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("renders the active tab's blocks and the pinned zone", () => {
    renderBlocks(threeTabLayout, true);

    expect(screen.getByText("Pinned everywhere")).toBeInTheDocument();
    expect(screen.getByText("First tab body")).toBeInTheDocument();
    expect(screen.queryByText("Second tab body")).not.toBeInTheDocument();
  });

  it("still renders NO tablist for a single tab", () => {
    const single: ProfileLayout = {
      tabsEnabled: true,
      tabs: [{ id: "tab-1", title: "Only", order: 0 }],
      blocks: [block({ id: "b", config: { body: "Solo body" } })],
    };

    renderBlocks(single, true);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByText("Solo body")).toBeInTheDocument();
  });
});
