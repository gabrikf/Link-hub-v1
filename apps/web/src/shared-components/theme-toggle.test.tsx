import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "./theme-toggle";

/**
 * The knob is the only part of this control whose STATE is not in the text.
 * The label says what pressing it does ("Switch to dark theme"); the knob's
 * side says which theme you are in — and in jsdom, with no stylesheet and no
 * layout, the class that positions it is the only place that fact exists. So
 * these two constants are asserted directly, and they are the contract: if a
 * refactor changes how the knob travels, it has to change them here too rather
 * than silently shipping a switch that is always on the left.
 */
const KNOB_AT_SUN_END = "left-1";
const KNOB_AT_MOON_END = "left-[calc(100%-2.5rem)]";

function getKnob(control: HTMLElement): HTMLElement {
  const knob = control.querySelector("span[aria-hidden='true']");
  if (!(knob instanceof HTMLElement)) {
    throw new Error("knob not found");
  }
  return knob;
}

describe("ThemeToggle — menu variant", () => {
  it("names itself by the action, not by the state", () => {
    render(<ThemeToggle theme="light" onToggle={vi.fn()} variant="menu" />);

    // One control, and the sentence a user reads is the sentence a screen
    // reader announces — there is no separate aria-label to drift from it.
    expect(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    ).toBeInTheDocument();
  });

  it("parks the knob on the sun end in light and the moon end in dark", () => {
    const { unmount } = render(
      <ThemeToggle theme="light" onToggle={vi.fn()} variant="menu" />,
    );

    const light = getKnob(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    );
    expect(light.className).toContain(KNOB_AT_SUN_END);
    expect(light.className).not.toContain(KNOB_AT_MOON_END);
    unmount();

    render(<ThemeToggle theme="dark" onToggle={vi.fn()} variant="menu" />);
    const dark = getKnob(
      screen.getByRole("button", { name: "Switch to light theme" }),
    );
    expect(dark.className).toContain(KNOB_AT_MOON_END);
  });

  it("keeps the label clear of the knob on whichever side it parks", () => {
    const { unmount } = render(
      <ThemeToggle theme="light" onToggle={vi.fn()} variant="menu" />,
    );

    const labelIn = (name: string) => {
      const span = screen.getByText(name);
      if (!(span instanceof HTMLElement)) {
        throw new Error("label not found");
      }
      return span.className;
    };

    // Knob on the left, so the gutter is on the left.
    expect(labelIn("Switch to dark theme")).toContain("pl-10");
    unmount();

    render(<ThemeToggle theme="dark" onToggle={vi.fn()} variant="menu" />);
    expect(labelIn("Switch to light theme")).toContain("pr-10");
  });

  it("reports the toggle once per press", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<ThemeToggle theme="light" onToggle={onToggle} variant="menu" />);

    await user.click(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
