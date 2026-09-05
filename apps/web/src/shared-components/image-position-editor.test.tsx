import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImagePositionEditor } from "./image-position-editor";

/**
 * The reposition dialog, driven the three ways a person can drive it: a drag,
 * the zoom controls and the keyboard.
 *
 * jsdom has no layout engine, so the two measurements the geometry needs — the
 * frame's box and the image's natural size — are stubbed to a known pair: a
 * 1200x1200 photo inside a 900x300 frame. That gives 0px of horizontal overflow
 * and 600px of vertical overflow at 1x, which is exactly the situation the bug
 * report described (a tall photo in a wide strip).
 */

const FRAME = { width: 900, height: 300 };
const NATURAL = { width: 1200, height: 1200 };

beforeEach(() => {
  // `vi.spyOn` rather than saving and reassigning the prototype method: holding
  // the original in a variable is an unbound method reference, and `afterEach`
  // restoring it by hand is the same thing `vi.restoreAllMocks` already does.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        width: FRAME.width,
        height: FRAME.height,
        top: 0,
        left: 0,
        right: FRAME.width,
        bottom: FRAME.height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  );

  // Pointer capture is how the drag survives the pointer leaving a 300px strip.
  // jsdom implements none of it.
  Object.assign(HTMLElement.prototype, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: () => true,
  });

  Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
    configurable: true,
    get: () => NATURAL.width,
  });
  Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
    configurable: true,
    get: () => NATURAL.height,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof ImagePositionEditor>> = {},
) {
  const onSave = vi.fn();
  const onCancel = vi.fn();

  render(
    <ImagePositionEditor
      src="https://cdn.example.com/banner.jpg"
      aspect={3}
      placement={null}
      onSave={onSave}
      onCancel={onCancel}
      title="Position your banner"
      description="Drag until the part you want is inside the frame."
      {...overrides}
    />,
  );

  // The geometry is unknown until the image reports its size; without this the
  // component is in its "not measured yet" state and refuses to move.
  fireEvent.load(screen.getByTestId("image-position-preview"));

  return { onSave, onCancel };
}

/** The rendered placement, read back off the style the profile will use. */
function renderedPlacement() {
  const style = screen.getByTestId("image-position-preview").style;
  return {
    objectPosition: style.objectPosition,
    transformOrigin: style.transformOrigin,
    transform: style.transform,
  };
}

function drag(dx: number, dy: number) {
  const frame = screen.getByTestId("image-position-frame");
  fireEvent.pointerDown(frame, { clientX: 100, clientY: 100, button: 0 });
  fireEvent.pointerMove(frame, { clientX: 100 + dx, clientY: 100 + dy });
  fireEvent.pointerUp(frame, { clientX: 100 + dx, clientY: 100 + dy });
}

describe("ImagePositionEditor", () => {
  it("renders nothing without an image", () => {
    render(
      <ImagePositionEditor
        src={null}
        aspect={3}
        placement={null}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        title="Position"
        description="Drag"
      />,
    );

    expect(
      screen.queryByTestId("image-position-frame"),
    ).not.toBeInTheDocument();
  });

  it("starts from the stored placement rather than from centre", () => {
    renderEditor({ placement: { x: 30, y: 20, scale: 1.5 } });

    expect(renderedPlacement()).toEqual({
      objectPosition: "30% 20%",
      transformOrigin: "30% 20%",
      transform: "scale(1.5)",
    });
  });

  it("a downward drag reveals the top of the photo", () => {
    renderEditor();

    // 600px of vertical overflow, so 60px of drag is 10 percentage points.
    drag(0, 60);

    expect(renderedPlacement().objectPosition).toBe("50% 40%");
  });

  it("ignores a sideways drag when nothing is hidden sideways", () => {
    renderEditor();

    drag(300, 0);

    expect(renderedPlacement().objectPosition).toBe("50% 50%");
  });

  it("saves the dragged placement, not the one it opened with", async () => {
    const { onSave } = renderEditor();

    drag(0, -120);
    await userEvent.click(
      screen.getByRole("button", { name: /apply position/i }),
    );

    expect(onSave).toHaveBeenCalledWith({ x: 50, y: 70, scale: 1 });
  });

  it("cancel discards the drag", async () => {
    const { onSave, onCancel } = renderEditor();

    drag(0, 60);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("zooms in and out with the buttons, bounded at 1x and 3x", async () => {
    const user = userEvent.setup();
    renderEditor();

    const zoomIn = screen.getByRole("button", { name: /zoom in/i });
    const zoomOut = screen.getByRole("button", { name: /zoom out/i });

    // 1x is the floor, so the control that would go below it is unavailable.
    expect(zoomOut).toBeDisabled();

    await user.click(zoomIn);
    expect(renderedPlacement().transform).toBe("scale(1.25)");

    for (let click = 0; click < 20; click += 1) {
      if ((zoomIn as HTMLButtonElement).disabled) break;
      await user.click(zoomIn);
    }
    expect(renderedPlacement().transform).toBe("scale(3)");
    expect(zoomIn).toBeDisabled();
  });

  it("is operable from the keyboard", () => {
    renderEditor();
    const frame = screen.getByTestId("image-position-frame");

    // 8px of nudge against 600px of overflow = 1.33 points.
    fireEvent.keyDown(frame, { key: "ArrowDown" });
    expect(renderedPlacement().objectPosition).toBe("50% 48.67%");

    // Shift moves four times as far.
    fireEvent.keyDown(frame, { key: "ArrowUp", shiftKey: true });
    expect(renderedPlacement().objectPosition).toBe("50% 54%");
  });

  it("recenters", async () => {
    renderEditor({ placement: { x: 10, y: 90, scale: 2 } });

    await userEvent.click(screen.getByRole("button", { name: /recenter/i }));

    expect(renderedPlacement()).toEqual({
      objectPosition: "50% 50%",
      transformOrigin: "50% 50%",
      transform: "scale(1)",
    });
  });

  it("does not let the browser hijack the gesture as an image drag", () => {
    // REGRESSION. An `<img>` is draggable by default, so pressing and moving on
    // one starts a native image-drag and the browser fires `pointercancel` —
    // which killed the reposition gesture two pointermoves in. The photo moved
    // about seven pixels and then silently stopped, which reads exactly like
    // "dragging does not work".
    renderEditor();

    expect(screen.getByTestId("image-position-preview")).toHaveAttribute(
      "draggable",
      "false",
    );
  });

  it("marks the band the OTHER published shape keeps, and moves it with the photo", () => {
    // The banner is published at two shapes — 2.13:1 on a phone, 6.36:1 on a
    // desktop. Dragging in one and publishing in the other is how a face ends
    // up cropped out again, one step downstream of the original bug.
    renderEditor({
      aspect: 2.125,
      safeAreaAspect: 6.36,
      safeAreaLabel: "Always visible",
    });

    const band = screen.getByTestId("image-position-safe-area");
    const before = band.style.top;
    expect(Number.parseFloat(before)).toBeGreaterThan(0);
    expect(screen.getByText("Always visible")).toBeInTheDocument();

    drag(0, 60);

    expect(screen.getByTestId("image-position-safe-area").style.top).not.toBe(
      before,
    );
  });

  it("draws no safe area when the caller names only one shape", () => {
    renderEditor();

    expect(
      screen.queryByTestId("image-position-safe-area"),
    ).not.toBeInTheDocument();
  });

  it("announces the position it moved to", () => {
    // Arrow keys change a style property on a picture. Without a live read-out
    // a screen-reader user presses ArrowDown and hears nothing at all.
    renderEditor();
    const readout = screen.getByTestId("image-position-readout");
    expect(readout).toHaveAttribute("aria-live", "polite");

    const before = readout.textContent;
    fireEvent.keyDown(screen.getByTestId("image-position-frame"), {
      key: "ArrowDown",
    });

    expect(screen.getByTestId("image-position-readout").textContent).not.toBe(
      before,
    );
  });

  it("says to zoom in when the photo already fits the frame exactly", () => {
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get: () => 900,
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalHeight", {
      configurable: true,
      get: () => 300,
    });

    renderEditor();

    // Dragging genuinely cannot reveal anything here, so the hint must say so
    // instead of inviting a gesture that does nothing.
    expect(screen.getByText(/zoom in to choose/i)).toBeInTheDocument();
  });
});
