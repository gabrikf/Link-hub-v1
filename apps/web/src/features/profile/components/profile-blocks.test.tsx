import type {
  LinkResponse,
  ProfileBlock,
  ProfileLayout,
} from "@repo/schemas";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

    // Grid placement style is derived from grid coords (x+1 / span w).
    const textSection = screen.getByText("First tab body").closest("section");
    expect(textSection?.style.gridColumn).toBe("3 / span 3");
    expect(textSection?.style.gridRow).toBe("2 / span 2");
  });

  it("shows the tab bar only when there is more than one tab", () => {
    const single: ProfileLayout = {
      tabs: [{ id: "tab-1", title: "Only", order: 0 }],
      blocks: [block({ id: "t", config: { body: "solo" } })],
    };

    const { unmount } = renderLayout(single);
    expect(screen.queryByRole("tab", { name: "Only" })).not.toBeInTheDocument();
    unmount();

    const multi: ProfileLayout = {
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
});
