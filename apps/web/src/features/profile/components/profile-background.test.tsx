import {
  DEFAULT_BACKGROUND_BLUR,
  DEFAULT_BACKGROUND_OVERLAY,
  DEFAULT_PROFILE_APPEARANCE,
  type ProfileAppearance,
} from "@repo/schemas";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileBackground } from "./profile-background";

const appearance = (overrides: Partial<ProfileAppearance> = {}) => ({
  ...DEFAULT_PROFILE_APPEARANCE,
  ...overrides,
});

describe("ProfileBackground", () => {
  it("draws nothing without an image", () => {
    render(<ProfileBackground imageUrl={null} appearance={appearance()} />);
    expect(screen.queryByTestId("profile-background")).not.toBeInTheDocument();
  });

  it("refuses a non-http url rather than emitting it into src", () => {
    render(
      <ProfileBackground
        imageUrl="javascript:alert(1)"
        appearance={appearance()}
      />,
    );
    expect(screen.queryByTestId("profile-background")).not.toBeInTheDocument();
  });

  it("draws the photo", () => {
    render(
      <ProfileBackground
        imageUrl="https://cdn.example.com/bg.jpg"
        appearance={appearance()}
      />,
    );

    expect(screen.getByTestId("profile-background-image")).toHaveAttribute(
      "src",
      "https://cdn.example.com/bg.jpg",
    );
  });

  it("shows the photo at the default strength, not the old ~15%", () => {
    // The bug: the veil was a hardcoded `bg-zinc-100/82` / `dark:bg-zinc-950/85`,
    // so a background image was 15-18% visible — "I set one and nothing
    // happened". Anything at or above 0.8 here is that bug coming back.
    render(
      <ProfileBackground
        imageUrl="https://cdn.example.com/bg.jpg"
        appearance={appearance()}
      />,
    );

    const veil = screen.getByTestId("profile-background-veil");
    expect(Number(veil.style.opacity)).toBeCloseTo(
      DEFAULT_BACKGROUND_OVERLAY / 100,
    );
    expect(Number(veil.style.opacity)).toBeLessThan(0.8);
  });

  it("applies the owner's veil strength", () => {
    render(
      <ProfileBackground
        imageUrl="https://cdn.example.com/bg.jpg"
        appearance={appearance({ backgroundOverlay: 20 })}
      />,
    );

    expect(
      Number(screen.getByTestId("profile-background-veil").style.opacity),
    ).toBeCloseTo(0.2);
  });

  it("applies the owner's blur, and emits none at all when it is zero", () => {
    const { rerender } = render(
      <ProfileBackground
        imageUrl="https://cdn.example.com/bg.jpg"
        appearance={appearance({ backgroundBlur: 12 })}
      />,
    );

    const blurred = screen.getByTestId("profile-background-image").parentElement;
    expect(blurred).toHaveStyle({ filter: "blur(12px)" });

    rerender(
      <ProfileBackground
        imageUrl="https://cdn.example.com/bg.jpg"
        appearance={appearance({ backgroundBlur: 0 })}
      />,
    );

    expect(
      screen.getByTestId("profile-background-image").parentElement?.style.filter,
    ).toBe("");
  });

  it("honours the stored focal point", () => {
    render(
      <ProfileBackground
        imageUrl="https://cdn.example.com/bg.jpg"
        appearance={appearance({
          backgroundPlacement: { x: 25, y: 75, scale: 1.4 },
        })}
      />,
    );

    const image = screen.getByTestId("profile-background-image");
    expect(image.style.objectPosition).toBe("25% 75%");
    expect(image.style.transformOrigin).toBe("25% 75%");
    expect(image.style.transform).toBe("scale(1.4)");
  });

  it("falls back to the documented defaults for a profile with no appearance", () => {
    // A `/me` or public payload written before this feature shipped.
    render(
      <ProfileBackground
        imageUrl="https://cdn.example.com/bg.jpg"
        appearance={null}
      />,
    );

    const veil = screen.getByTestId("profile-background-veil");
    expect(Number(veil.style.opacity)).toBeCloseTo(
      DEFAULT_BACKGROUND_OVERLAY / 100,
    );
    expect(
      screen.getByTestId("profile-background-image").parentElement,
    ).toHaveStyle({ filter: `blur(${DEFAULT_BACKGROUND_BLUR}px)` });
  });

  it("is decorative — no alt text, hidden from assistive tech", () => {
    render(
      <ProfileBackground
        imageUrl="https://cdn.example.com/bg.jpg"
        appearance={appearance()}
      />,
    );

    expect(screen.getByTestId("profile-background")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
