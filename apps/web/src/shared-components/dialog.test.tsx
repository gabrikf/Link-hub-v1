import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./dialog";

/**
 * The Dialog drops its own `w-[92vw]` / `max-w-lg` defaults only when the caller
 * supplies a matching-prefix override, so a caller's width actually wins without
 * needing tailwind-merge. These assert that suppression matrix.
 */
describe("Dialog width-class suppression", () => {
  const contentClasses = (): string[] =>
    screen.getByRole("dialog").className.split(/\s+/);

  it("keeps both defaults when no width override is passed", () => {
    render(
      <Dialog open title="Plain">
        body
      </Dialog>,
    );

    const classes = contentClasses();
    expect(classes).toContain("w-[92vw]");
    expect(classes).toContain("max-w-lg");
  });

  it("keeps the default width but overrides max-w when only max-w is set", () => {
    render(
      <Dialog open title="Wide" contentClassName="max-w-2xl">
        body
      </Dialog>,
    );

    const classes = contentClasses();
    expect(classes).toContain("w-[92vw]");
    expect(classes).toContain("max-w-2xl");
    expect(classes).not.toContain("max-w-lg");
  });

  it("defaults max-height to svh, not vh", () => {
    render(
      <Dialog open title="Tall">
        body
      </Dialog>,
    );

    // `vh` resolves against the LARGE viewport (747px at 375x812) while only
    // ~635px is visible under browser chrome, so the action row fell into the
    // clipped strip with body scroll locked by Radix.
    expect(contentClasses()).toContain("max-h-[92svh]");
    expect(contentClasses()).not.toContain("max-h-[92vh]");
  });

  it("lets a caller's max-h win — the default used to silently beat it", () => {
    render(
      <Dialog open title="Tall" contentClassName="max-h-[90svh]">
        body
      </Dialog>,
    );

    const classes = contentClasses();
    expect(classes).toContain("max-h-[90svh]");
    expect(classes).not.toContain("max-h-[92svh]");
  });

  it("wraps the action row so long labels cannot spill out of it", () => {
    render(
      <Dialog open title="Unsaved" buttons={<button type="button">Go</button>}>
        body
      </Dialog>,
    );

    const actions = screen.getByRole("button", { name: "Go" }).parentElement;
    expect(actions?.className).toContain("flex-wrap");
  });

  it("drops both defaults when the caller sets its own w- and max-w", () => {
    render(
      <Dialog open title="Widest" contentClassName="w-[96vw] max-w-6xl">
        body
      </Dialog>,
    );

    const classes = contentClasses();
    expect(classes).toContain("w-[96vw]");
    expect(classes).toContain("max-w-6xl");
    expect(classes).not.toContain("w-[92vw]");
    expect(classes).not.toContain("max-w-lg");
  });
});

/**
 * "Always visible" in a real browser means "not inside the scroll container".
 * The X used to be an absolutely positioned child of the element carrying
 * `overflow-y-auto`, so it scrolled out of the frame with the content and any
 * dialog taller than its max height lost its only pointer affordance for
 * closing — on mobile, the primary one. jsdom cannot measure that, but it can
 * assert the DOM relationship the fix depends on.
 */
describe("Dialog close button pinning", () => {
  const closeButton = () => screen.getByRole("button", { name: /close/i });

  const scrollContainer = (): HTMLElement => {
    const dialog = screen.getByRole("dialog");
    const scroller = dialog.querySelector(".overflow-y-auto");
    expect(scroller).not.toBeNull();
    return scroller as HTMLElement;
  };

  it("keeps the close button outside the scrolling container", () => {
    render(
      <Dialog open title="Scrolls">
        body
      </Dialog>,
    );

    expect(scrollContainer().contains(closeButton())).toBe(false);
  });

  it("puts the scrolling container inside the dialog frame, not on it", () => {
    render(
      <Dialog open title="Scrolls">
        body
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    const classes = dialog.className.split(/\s+/);
    expect(classes).toContain("overflow-hidden");
    expect(classes).not.toContain("overflow-y-auto");
    expect(dialog.contains(scrollContainer())).toBe(true);
    expect(scrollContainer()).not.toBe(dialog);
  });

  it("lets the scrolling container shrink so the frame's max-h wins", () => {
    render(
      <Dialog open title="Scrolls">
        body
      </Dialog>,
    );

    // Without `min-h-0` a flex child refuses to shrink below its content and
    // the body pushes past the frame instead of scrolling inside it.
    const classes = scrollContainer().className.split(/\s+/);
    expect(classes).toContain("min-h-0");
    expect(classes).toContain("flex-1");
    expect(screen.getByRole("dialog").className.split(/\s+/)).toContain(
      "flex-col",
    );
  });

  it("keeps the close button reachable on a very tall dialog", () => {
    render(
      <Dialog open title="Very tall" description="Lots of content below.">
        <div>
          {Array.from({ length: 200 }, (_, index) => (
            <p key={index}>Row {index}</p>
          ))}
        </div>
      </Dialog>,
    );

    expect(screen.getByText("Row 199")).toBeTruthy();
    const button = closeButton();
    expect(button.isConnected).toBe(true);
    expect(scrollContainer().contains(button)).toBe(false);
  });

  /**
   * The X used to be `absolute right-2 top-2 z-10` on the FRAME. That kept it
   * pinned across scroll, but it also floated it over the body's scroll area —
   * and the body's scrollbar runs down the frame's right border, so wherever
   * classic (non-overlay) scrollbars are drawn, the button sat on top of the
   * scrollbar's top arrow and took its clicks. The bar below is the fix: a real
   * non-scrolling row, so the scroll area — and therefore its scrollbar —
   * starts BELOW the button and the two can never share a pixel.
   */
  const header = (): HTMLElement => screen.getByTestId("dialog-header");

  it("gives the close button its own row instead of floating it over the body", () => {
    render(
      <Dialog open title="Layered">
        body
      </Dialog>,
    );

    const button = closeButton();
    expect(header().contains(button)).toBe(true);
    // An `absolute` button is one that overlaps whatever is under it. The whole
    // point of the bar is that nothing is under it.
    expect(button.className).not.toContain("absolute");
    expect(header().className).not.toContain("absolute");
  });

  it("puts the header bar before the scroll area, so the scrollbar starts below the X", () => {
    render(
      <Dialog open title="Ordered">
        body
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    const children = Array.from(dialog.children);
    expect(children[0]).toBe(header());
    expect(children[1]).toBe(scrollContainer());
    expect(header().contains(scrollContainer())).toBe(false);
    expect(scrollContainer().contains(header())).toBe(false);
  });

  it("keeps the header bar from collapsing when the body is tall", () => {
    render(
      <Dialog open title="Tall">
        <div>
          {Array.from({ length: 200 }, (_, index) => (
            <p key={index}>Row {index}</p>
          ))}
        </div>
      </Dialog>,
    );

    expect(header().className).toContain("shrink-0");
  });

  it("lets a long title wrap against the button instead of a hand-counted gutter", () => {
    render(
      <Dialog
        open
        title="A very long dialog title that would otherwise reach the corner"
      >
        body
      </Dialog>,
    );

    const titleBox = screen.getByText(
      "A very long dialog title that would otherwise reach the corner",
    ).parentElement;
    // The title shares a flex row with the X; `min-w-0` is what makes it wrap
    // rather than push the button off the frame. The old `pr-11` reservation is
    // gone precisely because the layout no longer has anything to reserve for.
    expect(titleBox?.className).toContain("min-w-0");
    expect(titleBox?.className).toContain("flex-1");
    expect(titleBox?.className).not.toContain("pr-11");
    expect(header().className).toContain("flex");
  });

  it("needs no gutter on the body when there is no header to carry one", () => {
    render(
      <Dialog open>
        <p>orphan body</p>
      </Dialog>,
    );

    expect(scrollContainer().className).not.toContain("pr-11");
    expect(header().contains(closeButton())).toBe(true);
  });
});

describe("Dialog close button across every state", () => {
  const cases: Array<[string, ReactNode]> = [
    ["title only", <Dialog key="a" open title="Only title" />],
    [
      "title and description",
      <Dialog key="b" open title="T" description="D" />,
    ],
    [
      "children only",
      <Dialog key="c" open>
        {"just children"}
      </Dialog>,
    ],
    [
      "buttons only",
      <Dialog key="d" open buttons={<button type="button">Go</button>} />,
    ],
    [
      "everything at once",
      <Dialog
        key="e"
        open
        title="T"
        description="D"
        buttons={<button type="button">Go</button>}
      >
        children
      </Dialog>,
    ],
    ["nothing at all", <Dialog key="f" open />],
  ];

  it.each(cases)("renders the close button with %s", (_label, element) => {
    render(element);

    const dialog = screen.getByRole("dialog");
    const button = screen.getByRole("button", { name: /close/i });
    expect(dialog.contains(button)).toBe(true);

    const scroller = dialog.querySelector(".overflow-y-auto");
    expect(scroller?.contains(button) ?? false).toBe(false);
  });
});

describe("Dialog close button labelling and behaviour", () => {
  it("names the close button after the dialog title", () => {
    render(<Dialog open title="Edit profile" />);

    expect(
      screen.getByRole("button", { name: "Close Edit profile" }),
    ).toBeTruthy();
  });

  it("prefers an explicit closeLabel over the title-derived name", () => {
    render(
      <Dialog open title="Adjust your photo" closeLabel="Cancel cropping" />,
    );

    expect(
      screen.getByRole("button", { name: "Cancel cropping" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Close Adjust your photo" }),
    ).toBeNull();
  });

  it("falls back to a generic name when there is no title", () => {
    render(<Dialog open>{"body"}</Dialog>);

    expect(screen.getByRole("button", { name: "Close dialog" })).toBeTruthy();
  });

  it("asks the caller to close when the X is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Dialog open title="Clickable" onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: "Close Clickable" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("still closes on Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Dialog open title="Escapable" onOpenChange={onOpenChange} />);

    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the X focusable by keyboard", async () => {
    const user = userEvent.setup();
    render(<Dialog open title="Focusable" />);

    const button = screen.getByRole("button", { name: "Close Focusable" });
    await user.tab();

    expect(document.activeElement).toBe(button);
  });
});

/**
 * The restructure moved padding, scrolling and the header into new wrappers.
 * These pin the three previously-fixed behaviours to the NEW shape so a future
 * refactor cannot quietly undo them again.
 */
describe("Dialog regressions that survived the close-button restructure", () => {
  it("still lets a caller's width, max-width and max-height win", () => {
    render(
      <Dialog
        open
        title="Preview"
        contentClassName="w-[96vw] max-w-6xl max-h-[80svh]"
      >
        body
      </Dialog>,
    );

    const classes = screen.getByRole("dialog").className.split(/\s+/);
    expect(classes).toContain("w-[96vw]");
    expect(classes).toContain("max-w-6xl");
    expect(classes).toContain("max-h-[80svh]");
    expect(classes).not.toContain("w-[92vw]");
    expect(classes).not.toContain("max-w-lg");
    expect(classes).not.toContain("max-h-[92svh]");
  });

  it("still caps height in svh on the frame that owns the scrolling child", () => {
    render(
      <Dialog open title="Tall">
        body
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className.split(/\s+/)).toContain("max-h-[92svh]");
    // The cap must sit on the frame; if it moved to the scroller the frame
    // would grow past the viewport and take the pinned X off-screen with it.
    expect(dialog.querySelector(".overflow-y-auto")?.className).not.toContain(
      "max-h-",
    );
  });

  it("still wraps a three-button action row", () => {
    render(
      <Dialog
        open
        title="Unsaved changes"
        buttons={
          <>
            <button type="button">Keep editing</button>
            <button type="button">Close without saving</button>
            <button type="button">Save and close</button>
          </>
        }
      >
        body
      </Dialog>,
    );

    const actions = screen.getByRole("button", {
      name: "Close without saving",
    }).parentElement;
    expect(actions?.className).toContain("flex-wrap");
    expect(actions?.className).toContain("justify-end");
  });

  it("keeps the dialog padding on the scrolling body", () => {
    render(
      <Dialog open title="Padded">
        body
      </Dialog>,
    );

    // Padding moved off the frame so content scrolls to the rounded edge
    // instead of disappearing 20px early — and so the scrollbar hugs the
    // border rather than floating 20px inside it.
    const frameClasses = screen.getByRole("dialog").className.split(/\s+/);
    expect(frameClasses).not.toContain("p-5");
    expect(frameClasses).not.toContain("px-5");

    const bodyClasses = screen
      .getByRole("dialog")
      .querySelector(".overflow-y-auto")
      ?.className.split(/\s+/);
    expect(bodyClasses).toContain("px-5");
    expect(bodyClasses).toContain("pb-5");
    // 16px between the pinned title and the first thing below it, which is what
    // the old `mt-4` on the children wrapper produced.
    expect(bodyClasses).toContain("pt-4");
  });

  /**
   * Only the TITLE is permanent chrome. The description scrolls with the body:
   * at 390px the Edit-profile description wraps to two lines, so pinning it
   * would spend ~40px of an 844px phone at every scroll offset on a sentence
   * that has already been read.
   */
  it("pins the title but lets the description scroll with the body", () => {
    render(
      <Dialog open title="Edit profile" description="Update your details.">
        body
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    const header = screen.getByTestId("dialog-header");
    const scroller = dialog.querySelector(".overflow-y-auto") as HTMLElement;

    expect(header.contains(screen.getByText("Edit profile"))).toBe(true);
    expect(scroller.contains(screen.getByText("Update your details."))).toBe(
      true,
    );
    expect(header.contains(screen.getByText("Update your details."))).toBe(
      false,
    );
  });

  it("still exposes the description to Radix as the dialog's description", () => {
    // Moving it into the scroller must not cost the accessible description:
    // `aria-describedby` is what a screen reader reads after the title.
    render(
      <Dialog open title="Titled" description="The accessible summary." />,
    );

    const dialog = screen.getByRole("dialog");
    const describedBy = dialog.getAttribute("aria-describedby");

    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      "The accessible summary.",
    );
  });

  it("keeps a description-only dialog rendering its description", () => {
    // `title` alone gates the header bar's padding; a dialog with only a
    // description must still show it rather than silently drop it.
    render(<Dialog open description="No title, just this." />);

    expect(screen.getByText("No title, just this.")).toBeTruthy();
  });
});
