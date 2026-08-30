import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DashboardProfileDisplay } from "./dashboard-profile-display";
import { DEFAULT_THEME_PRESET } from "../../profile/components/profile-theme";

function renderDisplay(
  props: Partial<React.ComponentProps<typeof DashboardProfileDisplay>> = {},
) {
  const onEdit = vi.fn();

  render(
    <DashboardProfileDisplay
      name="Larry"
      username="larry"
      description="Full Stack Developer & AI Engineer"
      avatarUrl={null}
      bannerImageUrl={null}
      backgroundImageUrl={null}
      themePreset={DEFAULT_THEME_PRESET}
      themeAccent={null}
      openToWork={false}
      location={null}
      persona={null}
      personaOther={null}
      onEdit={onEdit}
      {...props}
    />,
  );

  return { onEdit };
}

/**
 * New accounts default to open-to-work, but existing ones were deliberately
 * NOT backfilled — flipping someone's visibility on without asking is not this
 * app's call. That leaves every account created before the fix invisible to
 * recruiter search with nothing on screen saying so, which is the same silent
 * failure in a different place. This notice is the part of the fix that reaches
 * those users.
 */
describe("DashboardProfileDisplay recruiter-visibility notice", () => {
  it("tells a hidden user that recruiters cannot find them", () => {
    renderDisplay({ openToWork: false });

    expect(
      screen.getByText(/hidden from recruiter search/i),
    ).toBeInTheDocument();
  });

  it("says the public profile link still works, so the notice is not alarming", () => {
    renderDisplay({ openToWork: false });

    expect(
      screen.getByText(/public profile link keeps working/i),
    ).toBeInTheDocument();
  });

  /**
   * A notice with no way to act on it is just an accusation. The button opens
   * the same edit modal that carries the Open-to-work toggle.
   */
  it("offers a direct way to turn it on", async () => {
    const { onEdit } = renderDisplay({ openToWork: false });

    await userEvent.click(
      screen.getByRole("button", { name: /Turn on Open to work/i }),
    );

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("says nothing to a user who is already open to work", () => {
    renderDisplay({ openToWork: true });

    expect(
      screen.queryByText(/hidden from recruiter search/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Turn on Open to work/i }),
    ).not.toBeInTheDocument();
    // The positive state still reads as it always did.
    expect(screen.getByText("Open to work")).toBeInTheDocument();
  });
});

/**
 * The notice reads correctly at 375px and was unreadable at 1440px, which is
 * the opposite of what a responsive bug usually looks like. It lives in the
 * dashboard's `lg:w-1/3` panel — ~316px wide on a 1440px page — and `sm:` is a
 * VIEWPORT breakpoint, so a desktop viewport switched it to a row inside that
 * narrow column: 32px of icon plus a 168px `shrink-0` button left 58px, eight
 * characters, for the prose, which then ran 500px tall.
 *
 * jsdom has no layout, so the WIDTH is measured in the browser (the numbers
 * above come from a Playwright probe). What is pinned here is the mechanism
 * that produced it, because that is what a future edit would reintroduce: a
 * viewport breakpoint deciding a container-sized question, and a text column
 * with no floor of its own.
 */
describe("DashboardProfileDisplay recruiter-visibility notice — layout", () => {
  function notice(): HTMLElement {
    const heading = screen.getByText(/hidden from recruiter search/i);
    const found = heading.closest("div.flex-wrap");
    if (!(found instanceof HTMLElement)) {
      throw new Error("notice container not found");
    }
    return found;
  }

  it("decides the row/column question by wrapping, not by a viewport breakpoint", () => {
    renderDisplay({ openToWork: false });

    const container = notice();
    expect(container).toHaveClass("flex", "flex-wrap");
    // The regression: any `sm:`/`md:`/`lg:` direction switch is a viewport
    // answer to a container question and puts the 58px column back.
    expect(container.className).not.toMatch(/\b(sm|md|lg|xl):flex-(row|col)/);
    expect(container.className).not.toContain("flex-col");
  });

  it("gives the text a width floor so it can never collapse to a ribbon", () => {
    renderDisplay({ openToWork: false });

    const body = screen.getByText(/public profile link keeps working/i);
    const textGroup = body.closest("div.basis-64");
    // 256px — comfortably past the ~28-character floor even after the 32px
    // icon takes its share. Without it the button's `shrink-0` wins and the
    // prose gets whatever is left.
    expect(textGroup).not.toBeNull();
    expect(textGroup).toHaveClass("flex-1", "min-w-0");
  });

  it("keeps icon, heading, body and action in that order for a screen reader", () => {
    renderDisplay({ openToWork: false });

    const container = notice();
    const order = [
      container.querySelector("[aria-hidden='true']"),
      screen.getByRole("heading", { name: /hidden from recruiter search/i }),
      screen.getByText(/public profile link keeps working/i),
      screen.getByRole("button", { name: /Turn on Open to work/i }),
    ];

    for (let index = 0; index < order.length - 1; index += 1) {
      const current = order[index];
      const next = order[index + 1];
      expect(current).not.toBeNull();
      expect(next).not.toBeNull();
      // Each element precedes the next in document order, so the button is
      // announced last whether it sits beside the text or wraps below it.
      expect(
        current!.compareDocumentPosition(next!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});
