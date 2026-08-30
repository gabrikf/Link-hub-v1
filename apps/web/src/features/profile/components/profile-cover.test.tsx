import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileCover } from "./profile-cover";

const LONG_ROLE = "Fisioterapeuta Esportivo e Ortopédico do Alto Vale";

function roleChip() {
  return screen.getByTestId("profile-meta-chip");
}

/**
 * The cover used to overlay FOUR things on the photo the user chose: a share
 * control, a pinging "open to work" badge, a persona chip and a location pill.
 * A first pass merged role and location into ONE chip on the lower-left with
 * share balancing it on the right.
 *
 * This reverses the merge, and these assertions changed with it — deliberately,
 * because the behaviour changed. The merged chip was 245px wide at 375px (65%
 * of the card) and had to be lifted 80px off the lower edge to clear the
 * centred avatar, which put both controls in the middle of the photograph. The
 * cover now carries the ROLE only, bottom-left on the image's last pixels, with
 * share tucked into the opposite (top-right) corner; the location moved into
 * the profile body, after the description (see `profile-blocks.test.tsx`).
 */
describe("ProfileCover — the role chip", () => {
  it("shows the role and NOT the location", () => {
    render(
      <ProfileCover
        bannerImageUrl={null}
        location="Jaraguá do Sul, SC"
        persona="developer"
      />,
    );

    expect(roleChip()).toHaveTextContent("Developer");
    expect(roleChip().textContent).toBe("Developer");
    expect(screen.queryByText(/Jaraguá do Sul/)).not.toBeInTheDocument();
  });

  it("renders no chip when there is a location but no role", () => {
    render(
      <ProfileCover bannerImageUrl={null} location="Berlin" persona={null} />,
    );

    // Not an empty pill and not a reserved slot — nothing at all.
    expect(screen.queryByTestId("profile-meta-chip")).not.toBeInTheDocument();
    expect(screen.queryByText("Berlin")).not.toBeInTheDocument();
  });

  it("renders no chip at all when there is neither", () => {
    render(
      <ProfileCover bannerImageUrl={null} location={null} persona={null} />,
    );

    expect(screen.queryByTestId("profile-meta-chip")).not.toBeInTheDocument();
  });

  it("never renders the open-to-work badge on the cover, even when open to work", () => {
    render(
      <ProfileCover
        bannerImageUrl={null}
        openToWork
        location="Jaraguá do Sul, SC"
        persona="developer"
      />,
    );

    expect(screen.queryByText(/open to work/i)).not.toBeInTheDocument();
  });

  it("renders the share control when a share target is given, and nothing else", () => {
    render(
      <ProfileCover
        bannerImageUrl={null}
        persona="developer"
        share={{ url: "https://crafthub.dev/ada", name: "Ada" }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Share this profile" }),
    ).toBeInTheDocument();
    // The role chip is a label, not a control: the share button is the only
    // button on the cover.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("omits the share control when there is nothing to share", () => {
    render(<ProfileCover bannerImageUrl={null} persona="developer" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  /**
   * jsdom has no layout, so "does it overlap the avatar" cannot be measured
   * here — that is what the browser probe in the task report measured. What CAN
   * be pinned is the mechanism that keeps it from overlapping: the chip is
   * bounded to less than half the card minus the avatar's radius, and clips
   * with an ellipsis rather than growing.
   */
  it("bounds and truncates a long custom role instead of running under the avatar", () => {
    render(
      <ProfileCover
        bannerImageUrl={null}
        persona="other"
        personaOther={LONG_ROLE}
      />,
    );

    expect(screen.getByText(LONG_ROLE)).toHaveClass("truncate");
    expect(roleChip()).toHaveClass("max-w-[calc(50%-4rem)]");
    expect(roleChip()).toHaveClass("overflow-hidden");
  });

  /**
   * D-A: share top-right, role bottom-left. Two corners, not one baseline — the
   * regression this guards against is somebody putting them back on one row.
   */
  it("puts the two controls on opposite corners of the cover", () => {
    render(
      <ProfileCover
        bannerImageUrl={null}
        persona="developer"
        share={{ url: "https://crafthub.dev/ada", name: "Ada" }}
      />,
    );

    const share = screen.getByRole("button", { name: "Share this profile" });
    expect(share).toHaveClass("absolute", "right-2", "top-2");
    expect(roleChip()).toHaveClass("absolute", "bottom-0.5", "left-2");
    // Siblings on the strip, not children of a shared flex row.
    expect(share.parentElement).toBe(roleChip().parentElement);
    expect(share.parentElement).toHaveAttribute(
      "data-testid",
      "profile-cover-strip",
    );
  });
});

describe("ProfileCover — a role the dropdown does not cover", () => {
  it("shows the custom label instead of the generic 'Other'", () => {
    render(
      <ProfileCover
        bannerImageUrl={null}
        persona="other"
        personaOther="Fisioterapeuta"
      />,
    );

    expect(roleChip()).toHaveTextContent("Fisioterapeuta");
    expect(roleChip()).not.toHaveTextContent("Other");
  });

  it("falls back to the translated 'Other' when no custom label was typed", () => {
    render(
      <ProfileCover
        bannerImageUrl={null}
        persona="other"
        personaOther={null}
      />,
    );

    expect(roleChip().textContent).toBe("Other");
  });

  it("treats a whitespace-only label as no label", () => {
    render(
      <ProfileCover bannerImageUrl={null} persona="other" personaOther="   " />,
    );

    expect(roleChip().textContent).toBe("Other");
  });

  it("ignores a stale custom label once the persona is a named one", () => {
    render(
      <ProfileCover
        bannerImageUrl={null}
        persona="developer"
        personaOther="Fisioterapeuta"
      />,
    );

    expect(roleChip().textContent).toBe("Developer");
  });
});

/**
 * The reported bug: a portrait photograph in a 176px-tall, full-width strip is
 * cropped to its MIDDLE by `object-fit: cover`, so the owner's face is above
 * the frame and what shows is her shoulder. The fix is a stored focal point,
 * and the assertions below are on the two CSS properties that carry it.
 */
describe("ProfileCover — where the banner sits", () => {
  const BANNER = "https://cdn.example.com/banner.jpg";

  it("renders a banner with no placement exactly as a centred cover", () => {
    render(<ProfileCover bannerImageUrl={BANNER} persona={null} />);

    const image = screen.getByTestId("profile-cover-image");
    expect(image.style.objectPosition).toBe("50% 50%");
    expect(image.style.transform).toBe("scale(1)");
  });

  it("keeps the chosen point of the photo in frame", () => {
    render(
      <ProfileCover
        bannerImageUrl={BANNER}
        bannerPlacement={{ x: 50, y: 18, scale: 1.2 }}
        persona={null}
      />,
    );

    const image = screen.getByTestId("profile-cover-image");
    expect(image.style.objectPosition).toBe("50% 18%");
    // The origin MUST match the position, or zooming walks away from the point
    // the owner dragged into place.
    expect(image.style.transformOrigin).toBe("50% 18%");
    expect(image.style.transform).toBe("scale(1.2)");
  });

  it("applies the same placement in the compact preview strip", () => {
    // Same stored value, different frame height — that is the whole reason this
    // is a focal point and not a baked crop.
    render(
      <ProfileCover
        compact
        bannerImageUrl={BANNER}
        bannerPlacement={{ x: 40, y: 10, scale: 1 }}
        persona={null}
      />,
    );

    expect(screen.getByTestId("profile-cover-image").style.objectPosition).toBe(
      "40% 10%",
    );
  });

  it("draws the gradient fallback, and no image, without a banner", () => {
    render(<ProfileCover bannerImageUrl={null} persona={null} />);
    expect(screen.queryByTestId("profile-cover-image")).not.toBeInTheDocument();
  });
});
