import type { ProfileBlock, ProfileLayout } from "@repo/schemas";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileBlocks } from "./profile-blocks";

const profile = {
  name: "Ada Lovelace",
  username: "ada",
  description: null,
  userPhoto: null,
};

const block = (overrides: Partial<ProfileBlock>): ProfileBlock => ({
  id: "block",
  groupId: "g",
  kind: "text",
  tabId: "tab-1",
  gridX: 0,
  gridY: 0,
  gridW: 12,
  gridH: 4,
  isVisible: true,
  pinnedAllTabs: false,
  config: null,
  ...overrides,
});

const layoutWith = (kind: ProfileBlock["kind"]): ProfileLayout => ({
  tabs: [{ id: "tab-1", title: "One", order: 0 }],
  blocks: [block({ id: `${kind}-block`, kind })],
});

describe("ProfileBlocks loading states", () => {
  it("shows link placeholders instead of the empty state while links load", () => {
    const { container } = render(
      <ProfileBlocks
        layout={layoutWith("links")}
        viewport="pc"
        profile={profile}
        links={[]}
        resume={null}
        workExperiences={[]}
        linksLoading
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading links");
    // "No public links yet" while the request is still in flight is a lie.
    expect(screen.queryByText(/no public links yet/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll(".anim-sheen").length).toBeGreaterThan(0);
  });

  it("keeps the empty state when links have loaded and there are none", () => {
    render(
      <ProfileBlocks
        layout={layoutWith("links")}
        viewport="pc"
        profile={profile}
        links={[]}
        resume={null}
        workExperiences={[]}
      />,
    );

    expect(screen.getByText(/no public links yet/i)).toBeInTheDocument();
  });

  it("forwards resumeLoading to the resume card", () => {
    render(
      <ProfileBlocks
        layout={layoutWith("resume")}
        viewport="pc"
        profile={profile}
        links={[]}
        resume={null}
        workExperiences={[]}
        resumeLoading
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading resume");
    expect(
      screen.queryByText(/has not published resume details/i),
    ).not.toBeInTheDocument();
  });

  it("forwards workLoading to the work history card", () => {
    render(
      <ProfileBlocks
        layout={layoutWith("work_experiences")}
        viewport="pc"
        profile={profile}
        links={[]}
        resume={null}
        workExperiences={[]}
        workLoading
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading work history",
    );
    expect(
      screen.queryByText(/no work experience added yet/i),
    ).not.toBeInTheDocument();
  });
});
