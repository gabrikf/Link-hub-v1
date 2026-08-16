import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarCropper } from "./avatar-cropper";
import { getCroppedImg } from "../lib/crop-image";

/**
 * The real `react-easy-crop` measures its container with a ResizeObserver, and
 * jsdom reports every element as 0x0 — so it would never emit `onCropComplete`
 * and every "Save" assertion would hang. The stub emits a fixed crop area on
 * mount and mirrors the zoom/rotation props into the DOM so the controls can be
 * asserted.
 */
const cropperStub = vi.hoisted(() => ({ emitsCropArea: true }));

vi.mock("react-easy-crop", () => ({
  default: function CropperStub({
    zoom,
    rotation,
    aspect,
    cropShape,
    objectFit,
    restrictPosition,
    zoomWithScroll,
    onCropComplete,
    onZoomChange,
  }: {
    zoom: number;
    rotation: number;
    aspect?: number;
    cropShape?: string;
    objectFit?: string;
    restrictPosition?: boolean;
    zoomWithScroll?: boolean;
    onCropComplete?: (area: unknown, pixels: unknown) => void;
    onZoomChange?: (zoom: number) => void;
  }) {
    useEffect(() => {
      if (!cropperStub.emitsCropArea) return;
      onCropComplete?.(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 12, y: 34, width: 400, height: 400 },
      );
    }, [onCropComplete]);

    return (
      <div
        data-testid="cropper"
        data-zoom={String(zoom)}
        data-rotation={String(rotation)}
        data-aspect={String(aspect)}
        data-crop-shape={String(cropShape)}
        data-object-fit={String(objectFit)}
        data-restrict-position={String(restrictPosition)}
        data-zoom-with-scroll={String(zoomWithScroll)}
      >
        {/* Stand-ins for a wheel / pinch gesture. react-easy-crop reports those
            through `onZoomChange` with a RAW value, so the clamp has to live on
            our side of the callback, not only on the slider. */}
        <button type="button" onClick={() => onZoomChange?.(12)}>
          stub gesture zoom past max
        </button>
        <button type="button" onClick={() => onZoomChange?.(-4)}>
          stub gesture zoom past min
        </button>
      </div>
    );
  },
}));

vi.mock("../lib/crop-image", () => ({
  getCroppedImg: vi.fn(),
}));

const getCroppedImgMock = vi.mocked(getCroppedImg);

const createObjectURL = vi.fn(() => "blob:avatar");
const revokeObjectURL = vi.fn();

const makeFile = (name = "photo.png") =>
  new File(["x"], name, { type: "image/png" });

const croppedFile = new File(["y"], "photo.webp", { type: "image/webp" });

// jsdom does not implement the object-URL store at all. These are installed for
// the whole file rather than stubbed per test: `vi.unstubAllGlobals()` in an
// `afterEach` would run BEFORE Testing Library's own `cleanup()` hook, so the
// unmount-time `revokeObjectURL` would blow up on the restored jsdom `URL`.
URL.createObjectURL = createObjectURL;
URL.revokeObjectURL = revokeObjectURL;

beforeEach(() => {
  cropperStub.emitsCropArea = true;
  createObjectURL.mockClear().mockReturnValue("blob:avatar");
  revokeObjectURL.mockClear();
  getCroppedImgMock.mockReset().mockResolvedValue(croppedFile);
});

const saveButton = () => screen.getByRole("button", { name: /save photo/i });

describe("AvatarCropper visibility", () => {
  it("stays closed while no file is selected", () => {
    render(
      <AvatarCropper file={null} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("opens a modal dialog once a file is picked", () => {
    render(
      <AvatarCropper file={makeFile()} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("cropper")).toBeInTheDocument();
  });
});

describe("AvatarCropper saving", () => {
  it("keeps Save disabled until a crop area has been reported", () => {
    cropperStub.emitsCropArea = false;

    render(
      <AvatarCropper file={makeFile()} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    expect(saveButton()).toBeDisabled();
  });

  it("enables Save once the cropper reports a non-empty area", () => {
    render(
      <AvatarCropper file={makeFile()} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    expect(saveButton()).toBeEnabled();
  });

  it("rasterises the crop and hands the resulting File to onCropped", async () => {
    const onCropped = vi.fn();
    render(
      <AvatarCropper
        file={makeFile("me.jpeg")}
        onCancel={vi.fn()}
        onCropped={onCropped}
      />,
    );

    fireEvent.click(saveButton());

    await waitFor(() => expect(onCropped).toHaveBeenCalledWith(croppedFile));
    expect(getCroppedImgMock).toHaveBeenCalledWith(
      "blob:avatar",
      { x: 12, y: 34, width: 400, height: 400 },
      0,
      "me.jpeg",
    );
  });

  it("passes the current rotation through to the rasteriser", async () => {
    render(
      <AvatarCropper file={makeFile()} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /rotate 90/i }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(getCroppedImgMock).toHaveBeenCalled());
    expect(getCroppedImgMock.mock.calls[0][2]).toBe(90);
  });

  it("surfaces a crop failure as an alert and does not call onCropped", async () => {
    getCroppedImgMock.mockRejectedValue(new Error("Canvas exploded"));
    const onCropped = vi.fn();

    render(
      <AvatarCropper file={makeFile()} onCancel={vi.fn()} onCropped={onCropped} />,
    );

    fireEvent.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Canvas exploded",
    );
    expect(onCropped).not.toHaveBeenCalled();
  });
});

describe("AvatarCropper cancelling", () => {
  it("calls onCancel and never rasterises", () => {
    const onCancel = vi.fn();
    render(
      <AvatarCropper
        file={makeFile()}
        onCancel={onCancel}
        onCropped={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(getCroppedImgMock).not.toHaveBeenCalled();
  });

  it("treats a dialog dismissal (Escape) as a cancel", () => {
    const onCancel = vi.fn();
    render(
      <AvatarCropper
        file={makeFile()}
        onCancel={onCancel}
        onCropped={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onCancel).toHaveBeenCalled();
  });
});

describe("AvatarCropper object-URL lifecycle", () => {
  it("revokes the object URL on unmount", () => {
    const { unmount } = render(
      <AvatarCropper file={makeFile()} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    expect(revokeObjectURL).not.toHaveBeenCalled();
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:avatar");
  });

  it("revokes the previous URL when the file is swapped", () => {
    const first = makeFile("first.png");
    const { rerender } = render(
      <AvatarCropper file={first} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    createObjectURL.mockReturnValue("blob:second");
    const second = makeFile("second.png");
    rerender(
      <AvatarCropper file={second} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:avatar");
    expect(createObjectURL).toHaveBeenLastCalledWith(second);
  });
});

/**
 * These are the props that produce the Instagram/WhatsApp crop frame, and each
 * one is load-bearing: drop `restrictPosition` and the photo can be dragged off
 * the mask leaving empty gaps inside the circle; drop `objectFit="cover"` and it
 * starts letterboxed instead of filling the frame; drop `aspect` and the output
 * stops being square.
 */
describe("AvatarCropper crop frame", () => {
  it("locks a circular 1:1 frame the image cannot be panned out of", () => {
    render(
      <AvatarCropper file={makeFile()} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    const cropper = screen.getByTestId("cropper");
    expect(cropper).toHaveAttribute("data-aspect", "1");
    expect(cropper).toHaveAttribute("data-crop-shape", "round");
    expect(cropper).toHaveAttribute("data-object-fit", "cover");
    expect(cropper).toHaveAttribute("data-restrict-position", "true");
  });

  it("zooms with the scroll wheel / pinch as well as the slider", () => {
    render(
      <AvatarCropper file={makeFile()} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    expect(screen.getByTestId("cropper")).toHaveAttribute(
      "data-zoom-with-scroll",
      "true",
    );
  });

  it("hands the zoomed crop rectangle straight to the rasteriser", async () => {
    render(
      <AvatarCropper file={makeFile()} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), {
      target: { value: "2" },
    });
    fireEvent.click(saveButton());

    // The reported area is in SOURCE pixels; it must reach `getCroppedImg`
    // untouched, since that is the only place it gets scaled.
    await waitFor(() =>
      expect(getCroppedImgMock.mock.calls[0][1]).toEqual({
        x: 12,
        y: 34,
        width: 400,
        height: 400,
      }),
    );
  });
});

describe("AvatarCropper controls", () => {
  const zoomSlider = () => screen.getByRole("slider", { name: "Zoom" });

  it("drives zoom from the range input", () => {
    render(
      <AvatarCropper file={makeFile()} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    expect(screen.getByTestId("cropper")).toHaveAttribute("data-zoom", "1");

    fireEvent.change(zoomSlider(), { target: { value: "2.5" } });

    expect(screen.getByTestId("cropper")).toHaveAttribute("data-zoom", "2.5");
    expect(zoomSlider()).toHaveAttribute("aria-valuetext", "2.5x");
  });

  it("steps zoom with the icon buttons and clamps at the ends", () => {
    render(
      <AvatarCropper file={makeFile()} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    // Already at minZoom, so zooming out is not an available action.
    expect(screen.getByRole("button", { name: /zoom out/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    expect(screen.getByTestId("cropper")).toHaveAttribute("data-zoom", "1.25");

    fireEvent.change(zoomSlider(), { target: { value: "4" } });
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeDisabled();
  });

  it("advances rotation by 90° and wraps back to 0", () => {
    render(
      <AvatarCropper file={makeFile()} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    const rotate = screen.getByRole("button", { name: /rotate 90/i });
    const cropper = () => screen.getByTestId("cropper");

    expect(cropper()).toHaveAttribute("data-rotation", "0");

    fireEvent.click(rotate);
    expect(cropper()).toHaveAttribute("data-rotation", "90");

    fireEvent.click(rotate);
    fireEvent.click(rotate);
    expect(cropper()).toHaveAttribute("data-rotation", "270");

    fireEvent.click(rotate);
    expect(cropper()).toHaveAttribute("data-rotation", "0");
  });

  it("clamps a wheel/pinch zoom that overshoots either end", () => {
    render(
      <AvatarCropper file={makeFile()} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /stub gesture zoom past max/i }),
    );
    expect(screen.getByTestId("cropper")).toHaveAttribute("data-zoom", "4");

    fireEvent.click(
      screen.getByRole("button", { name: /stub gesture zoom past min/i }),
    );
    expect(screen.getByTestId("cropper")).toHaveAttribute("data-zoom", "1");
  });

  it("resets zoom and rotation when a new file arrives", () => {
    const { rerender } = render(
      <AvatarCropper
        file={makeFile("first.png")}
        onCancel={vi.fn()}
        onCropped={vi.fn()}
      />,
    );

    fireEvent.change(zoomSlider(), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /rotate 90/i }));

    rerender(
      <AvatarCropper
        file={makeFile("second.png")}
        onCancel={vi.fn()}
        onCropped={vi.fn()}
      />,
    );

    expect(screen.getByTestId("cropper")).toHaveAttribute("data-zoom", "1");
    expect(screen.getByTestId("cropper")).toHaveAttribute("data-rotation", "0");
  });
});
