import type { LinkResponse, ProfileBlock, ProfileLayout } from "@repo/schemas";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PROFILE_CANVAS_WIDTH } from "../../profile-layout/grid-utils";
import { ProfileBlocks } from "./profile-blocks";

const profile = {
  name: "Ada Lovelace",
  username: "ada",
  description: "Mathematician and first programmer.",
  userPhoto: null,
};

const links: LinkResponse[] = [
  {
    id: "link-1",
    userId: "user-1",
    title: "My Portfolio Link",
    url: "https://example.com",
    icon: null,
    isPublic: true,
    order: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

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

const renderLayout = (layout: ProfileLayout) =>
  render(
    <ProfileBlocks
      layout={layout}
      viewport="pc"
      profile={profile}
      links={links}
      resume={null}
      workExperiences={[]}
    />,
  );

describe("ProfileBlocks", () => {
  it("renders a pinned block above every tab and its grid placement style", () => {
    const layout: ProfileLayout = {
      tabsEnabled: true,
      tabs: [
        { id: "tab-1", title: "One", order: 0 },
        { id: "tab-2", title: "Two", order: 1 },
      ],
      blocks: [
        block({
          id: "header",
          kind: "header",
          tabId: null,
          pinnedAllTabs: true,
          gridX: 0,
          gridW: 12,
        }),
        block({
          id: "text-1",
          kind: "text",
          tabId: "tab-1",
          gridX: 2,
          gridY: 1,
          gridW: 3,
          gridH: 2,
          config: { title: "Hello", body: "First tab body" },
        }),
      ],
    };

    renderLayout(layout);

    // Pinned header shows regardless of active tab.
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();

    // Grid placement style is derived from grid coords (x+1 / span w). The
    // column is untouched, but the row is compacted: the block was the only one
    // in its tab zone, so gridY 1 packs up to 0 -> `1 / span 2`.
    const textSection = screen.getByText("First tab body").closest("section");
    expect(textSection?.style.gridColumn).toBe("3 / span 3");
    expect(textSection?.style.gridRow).toBe("1 / span 2");
  });

  it("shows the tab bar only when there is more than one tab", () => {
    const single: ProfileLayout = {
      tabsEnabled: true,
      tabs: [{ id: "tab-1", title: "Only", order: 0 }],
      blocks: [block({ id: "t", config: { body: "solo" } })],
    };

    const { unmount } = renderLayout(single);
    expect(screen.queryByRole("tab", { name: "Only" })).not.toBeInTheDocument();
    unmount();

    const multi: ProfileLayout = {
      tabsEnabled: true,
      tabs: [
        { id: "tab-1", title: "First", order: 0 },
        { id: "tab-2", title: "Second", order: 1 },
      ],
      blocks: [block({ id: "t", config: { body: "solo" } })],
    };

    renderLayout(multi);
    expect(screen.getByRole("tab", { name: "First" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Second" })).toBeInTheDocument();
  });

  it("renders custom text and button blocks and switches tab content", () => {
    const layout: ProfileLayout = {
      tabsEnabled: true,
      tabs: [
        { id: "tab-1", title: "First", order: 0 },
        { id: "tab-2", title: "Second", order: 1 },
      ],
      blocks: [
        block({
          id: "text-1",
          kind: "text",
          tabId: "tab-1",
          config: { title: "About", body: "About me" },
        }),
        block({
          id: "button-1",
          kind: "button",
          tabId: "tab-2",
          config: {
            label: "Contact me",
            url: "https://example.com/contact",
          },
        }),
      ],
    };

    renderLayout(layout);

    // Tab 1 content visible, tab 2 content hidden initially.
    expect(screen.getByText("About me")).toBeInTheDocument();
    expect(screen.queryByText("Contact me")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Second" }));

    const cta = screen.getByRole("link", { name: /Contact me/ });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute("href", "https://example.com/contact");
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta).toHaveAttribute("rel", "noreferrer");
  });

  it("omits hidden blocks", () => {
    const layout: ProfileLayout = {
      tabsEnabled: true,
      tabs: [{ id: "tab-1", title: "One", order: 0 }],
      blocks: [
        block({
          id: "visible",
          kind: "text",
          config: { body: "Shown body" },
        }),
        block({
          id: "hidden",
          kind: "text",
          isVisible: false,
          config: { body: "Hidden body" },
        }),
      ],
    };

    renderLayout(layout);
    expect(screen.getByText("Shown body")).toBeInTheDocument();
    expect(screen.queryByText("Hidden body")).not.toBeInTheDocument();
  });

  it("closes the vertical hole a hidden block leaves behind", () => {
    // `isVisible` is filtered AFTER the editor assigned coordinates, so without
    // compaction the hidden middle block would leave a two-row gap on the live
    // profile that the editor cannot see, let alone fix.
    const layout: ProfileLayout = {
      tabsEnabled: true,
      tabs: [{ id: "tab-1", title: "One", order: 0 }],
      blocks: [
        block({ id: "first", gridY: 0, gridW: 12, config: { body: "First" } }),
        block({
          id: "hidden",
          gridY: 2,
          gridW: 12,
          isVisible: false,
          config: { body: "Hidden" },
        }),
        block({ id: "last", gridY: 4, gridW: 12, config: { body: "Last" } }),
      ],
    };

    renderLayout(layout);

    const first = screen.getByText("First").closest("section");
    const last = screen.getByText("Last").closest("section");
    expect(first?.style.gridRow).toBe("1 / span 2");
    // Would be `5 / span 2` (a two-row hole) without compaction.
    expect(last?.style.gridRow).toBe("3 / span 2");
  });

  /**
   * REGRESSION GUARD. Fixed `40px` rows plus `overflow: hidden` on each block
   * were introduced to force editor/public pixel parity and silently destroyed
   * content: measured live, the work-history block lost 85% of its height at
   * 1280px and 92% at 375px, with no scrollbar to hint at it.
   *
   * Parity was never reachable — the editor renders block METADATA only (icon +
   * label), never real content, so it cannot know a block's content height.
   * `gridH` is a floor, not a ceiling.
   */
  it("sizes rows as a minimum so tall content is never clipped", () => {
    const layout: ProfileLayout = {
      tabsEnabled: true,
      tabs: [{ id: "tab-1", title: "One", order: 0 }],
      blocks: [block({ id: "t", gridW: 12, config: { body: "body" } })],
    };

    renderLayout(layout);

    const section = screen.getByText("body").closest("section");
    const grid = section?.parentElement;

    expect(grid?.style.gridAutoRows).toBe("minmax(40px, auto)");
    // Neither of these may come back: together they are what clipped content.
    expect(section?.style.overflow).toBe("");
    expect(section?.style.minHeight).toBe("");
  });

  /**
   * The editor grid clamps to the same value, which is what makes a column the
   * same number of pixels in both canvases.
   */
  it("clamps the grid to the shared canvas width for the viewport", () => {
    const layout: ProfileLayout = {
      tabsEnabled: true,
      tabs: [{ id: "tab-1", title: "One", order: 0 }],
      blocks: [block({ id: "t", gridW: 12, config: { body: "body" } })],
    };

    renderLayout(layout);
    const grid = screen.getByText("body").closest("section")?.parentElement;
    expect(grid?.style.maxWidth).toBe(`${PROFILE_CANVAS_WIDTH.pc}px`);
  });

  it("compacts the pinned zone independently of the tab zone", () => {
    const layout: ProfileLayout = {
      tabsEnabled: true,
      tabs: [{ id: "tab-1", title: "One", order: 0 }],
      blocks: [
        block({
          id: "pinned-text",
          tabId: null,
          pinnedAllTabs: true,
          gridY: 6,
          gridW: 12,
          config: { body: "Pinned body" },
        }),
        block({
          id: "tab-text",
          tabId: "tab-1",
          gridY: 9,
          gridW: 12,
          config: { body: "Tab body" },
        }),
      ],
    };

    renderLayout(layout);

    // Both zones are separate grids, so each packs to its own row 1.
    expect(
      screen.getByText("Pinned body").closest("section")?.style.gridRow,
    ).toBe("1 / span 2");
    expect(screen.getByText("Tab body").closest("section")?.style.gridRow).toBe(
      "1 / span 2",
    );
  });
});
