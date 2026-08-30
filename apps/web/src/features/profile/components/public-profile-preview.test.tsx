import {
  DEFAULT_PROFILE_APPEARANCE,
  type ProfileLayout,
} from "@repo/schemas";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PublicProfilePreview } from "./public-profile-preview";

// The grid renderer is exercised by its own tests; what is under test here is
// whether the preview draws the same two decorative images the public page does.
vi.mock("./profile-blocks", () => ({
  ProfileBlocks: () => <div data-testid="profile-blocks" />,
}));

const layout: ProfileLayout = {
  tabs: [],
  tabsEnabled: false,
} as unknown as ProfileLayout;

const baseProfile = {
  name: "Mariana",
  username: "mariana",
  description: null,
  userPhoto: null,
};

function renderPreview(
  profile: Partial<React.ComponentProps<typeof PublicProfilePreview>["profile"]> = {},
) {
  render(
    <PublicProfilePreview
      layout={layout}
      viewport="mobile"
      profile={{ ...baseProfile, ...profile }}
      links={[]}
      resume={null}
      workExperiences={[]}
    />,
  );
}

/**
 * The live preview is the ONLY screen whose job is to show the owner what a
 * visitor will see. It accepted `backgroundImageUrl` and then drew nothing with
 * it, which is why "I set a background and nothing appeared" was true even
 * though the published page did render one.
 */
describe("PublicProfilePreview — the decorative images", () => {
  it("draws the background photo", () => {
    renderPreview({
      backgroundImageUrl: "https://cdn.example.com/bg.jpg",
      appearance: DEFAULT_PROFILE_APPEARANCE,
    });

    expect(screen.getByTestId("profile-background-image")).toHaveAttribute(
      "src",
      "https://cdn.example.com/bg.jpg",
    );
  });

  it("draws the background at the owner's veil strength", () => {
    renderPreview({
      backgroundImageUrl: "https://cdn.example.com/bg.jpg",
      appearance: { ...DEFAULT_PROFILE_APPEARANCE, backgroundOverlay: 15 },
    });

    expect(
      Number(screen.getByTestId("profile-background-veil").style.opacity),
    ).toBeCloseTo(0.15);
  });

  it("draws the banner at its stored focal point", () => {
    renderPreview({
      bannerImageUrl: "https://cdn.example.com/banner.jpg",
      appearance: {
        ...DEFAULT_PROFILE_APPEARANCE,
        bannerPlacement: { x: 50, y: 12, scale: 1.1 },
      },
    });

    const banner = screen.getByTestId("profile-cover-image");
    expect(banner.style.objectPosition).toBe("50% 12%");
    expect(banner.style.transform).toBe("scale(1.1)");
  });

  it("still renders for a caller that knows nothing about appearance", () => {
    // The layout studio passes core identity only; absent must mean "default",
    // never "crash".
    renderPreview({ bannerImageUrl: "https://cdn.example.com/banner.jpg" });

    expect(screen.getByTestId("profile-cover-image").style.objectPosition).toBe(
      "50% 50%",
    );
    expect(screen.queryByTestId("profile-background")).not.toBeInTheDocument();
  });
});
