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

  it("shows only the first tab's blocks", () => {
    renderBlocks(threeTabLayout, false);

    expect(screen.getByText("First tab body")).toBeInTheDocument();
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

  it("uses the FIRST tab by order, not the first in array order", () => {
    const shuffled: ProfileLayout = {
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

    expect(screen.getByText("Early body")).toBeInTheDocument();
    expect(screen.queryByText("Late body")).not.toBeInTheDocument();
  });

  it("still hides blocks the owner marked invisible", () => {
    const layout: ProfileLayout = {
      tabs: [{ id: "tab-1", title: "Main", order: 0 }],
      blocks: [
        block({ id: "shown", config: { body: "Shown body" } }),
        block({
          id: "gone",
          isVisible: false,
          config: { body: "Hidden body" },
        }),
      ],
    };

    renderBlocks(layout, false);

    expect(screen.getByText("Shown body")).toBeInTheDocument();
    expect(screen.queryByText("Hidden body")).not.toBeInTheDocument();
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

  it("still renders NO tablist for a single tab", () => {
    const single: ProfileLayout = {
      tabs: [{ id: "tab-1", title: "Only", order: 0 }],
      blocks: [block({ id: "b", config: { body: "Solo body" } })],
    };

    renderBlocks(single, true);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByText("Solo body")).toBeInTheDocument();
  });
});
