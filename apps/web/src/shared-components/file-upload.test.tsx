import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertDefined } from "../test-support/assert-defined";
import { FileUpload } from "./file-upload";
import { getCroppedImg } from "../lib/crop-image";
import { uploadImage } from "../lib/upload-api";

vi.mock("../lib/upload-api", () => ({
  uploadImage: vi.fn(),
}));

/**
 * The crop dialog itself is exercised in avatar-cropper.test.tsx. Here the real
 * AvatarCropper is rendered (real Dialog, real buttons) with only its two
 * browser-only dependencies faked: `react-easy-crop`, which never emits a crop
 * area in jsdom because every element measures 0x0, and the canvas rasteriser.
 */
vi.mock("react-easy-crop", () => ({
  default: function CropperStub({
    onCropComplete,
  }: {
    onCropComplete?: (area: unknown, pixels: unknown) => void;
  }) {
    useEffect(() => {
      onCropComplete?.(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 0, y: 0, width: 400, height: 400 },
      );
    }, [onCropComplete]);
    return <div data-testid="cropper" />;
  },
}));

vi.mock("../lib/crop-image", () => ({
  getCroppedImg: vi.fn(),
}));

const uploadImageMock = vi.mocked(uploadImage);
const getCroppedImgMock = vi.mocked(getCroppedImg);

// jsdom implements neither half of the object-URL store.
URL.createObjectURL = vi.fn(() => "blob:avatar");
URL.revokeObjectURL = vi.fn();

/** Build a File whose `size` we can force without allocating real bytes. */
const makeFile = (name: string, type: string, size: number): File => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

const fileInput = (): HTMLInputElement => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not found");
  return input;
};

describe("FileUpload", () => {
  beforeEach(() => {
    uploadImageMock.mockReset();
    getCroppedImgMock.mockReset();
  });

  it("rejects an unsupported MIME type without uploading", async () => {
    const onChange = vi.fn();
    render(<FileUpload label="Avatar" value={null} onChange={onChange} />);

    const badFile = makeFile("resume.pdf", "application/pdf", 1024);
    fireEvent.change(fileInput(), { target: { files: [badFile] } });

    expect(
      await screen.findByText(/unsupported file type/i),
    ).toBeInTheDocument();
    expect(uploadImageMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects a file larger than 5 MB without uploading", async () => {
    const onChange = vi.fn();
    render(<FileUpload label="Avatar" value={null} onChange={onChange} />);

    const bigFile = makeFile("huge.png", "image/png", 6 * 1024 * 1024);
    fireEvent.change(fileInput(), { target: { files: [bigFile] } });

    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
    expect(uploadImageMock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders an error state (aria-invalid) for a bad file", async () => {
    render(<FileUpload label="Avatar" value={null} onChange={vi.fn()} />);

    const badFile = makeFile("resume.pdf", "application/pdf", 1024);
    fireEvent.change(fileInput(), { target: { files: [badFile] } });

    await screen.findByText(/unsupported file type/i);
    // The interactive control reflects the invalid state.
    expect(
      screen.getByRole("button", { name: /upload avatar/i }),
    ).toHaveAttribute("aria-invalid", "true");
  });

  it("uploads a valid image and surfaces the resulting url", async () => {
    uploadImageMock.mockResolvedValue("https://cdn.example.com/a.png");
    const onChange = vi.fn();
    render(<FileUpload label="Avatar" value={null} onChange={onChange} />);

    const goodFile = makeFile("a.png", "image/png", 1024);
    fireEvent.change(fileInput(), { target: { files: [goodFile] } });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("https://cdn.example.com/a.png"),
    );
    expect(uploadImageMock).toHaveBeenCalledWith(goodFile);
  });

  it("Clear fires onChange(null) and resets the input value", () => {
    const onChange = vi.fn();
    render(
      <FileUpload
        label="Avatar"
        value="https://cdn.example.com/a.png"
        onChange={onChange}
      />,
    );

    const input = fileInput();
    input.value = "";

    fireEvent.click(screen.getByRole("button", { name: /remove image/i }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(input.value).toBe("");
  });

  it("has exactly ONE tab-stop button and a non-focusable file input (D2/D3)", () => {
    render(<FileUpload label="Avatar" value={null} onChange={vi.fn()} />);

    // Only the upload control is a button; nothing is nested inside it.
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute("aria-label", "Upload Avatar");

    // The hidden native file input is opened programmatically, so it must be
    // out of the tab order (no double / invisible tab stop).
    expect(fileInput()).toHaveAttribute("tabindex", "-1");
  });

  it("exposes a separate Clear control when a value is present (D3)", () => {
    render(
      <FileUpload
        label="Avatar"
        value="https://cdn.example.com/a.png"
        onChange={vi.fn()}
      />,
    );

    // Upload/Replace and Clear are two sibling buttons — never nested.
    const replace = screen.getByRole("button", { name: /replace image/i });
    const clear = screen.getByRole("button", { name: /remove image/i });
    expect(replace).toBeInTheDocument();
    expect(clear).toBeInTheDocument();
    expect(replace.contains(clear)).toBe(false);
    expect(clear.contains(replace)).toBe(false);
  });
});

/**
 * `cropToCircle` is opt-in precisely so the banner / background / post-image
 * call sites keep the plain pick-and-upload path — the first test here is the
 * regression guard for that.
 */
describe("FileUpload cropToCircle", () => {
  const croppedFile = new File(["y"], "a.webp", { type: "image/webp" });

  beforeEach(() => {
    uploadImageMock.mockReset();
    getCroppedImgMock.mockReset().mockResolvedValue(croppedFile);
  });

  it("uploads immediately and never opens a cropper when the prop is absent", async () => {
    uploadImageMock.mockResolvedValue("https://cdn.example.com/a.png");
    const onChange = vi.fn();
    render(<FileUpload label="Banner" value={null} onChange={onChange} />);

    const file = makeFile("a.png", "image/png", 1024);
    fireEvent.change(fileInput(), { target: { files: [file] } });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("https://cdn.example.com/a.png"),
    );
    expect(uploadImageMock).toHaveBeenCalledWith(file);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the cropper and uploads nothing until the crop is confirmed", () => {
    render(
      <FileUpload
        label="Avatar"
        cropToCircle
        value={null}
        onChange={vi.fn()}
      />,
    );

    fireEvent.change(fileInput(), {
      target: { files: [makeFile("a.png", "image/png", 1024)] },
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  it("uploads the CROPPED file, not the original, on confirm", async () => {
    uploadImageMock.mockResolvedValue("https://cdn.example.com/cropped.webp");
    const onChange = vi.fn();
    render(
      <FileUpload
        label="Avatar"
        cropToCircle
        value={null}
        onChange={onChange}
      />,
    );

    const original = makeFile("a.png", "image/png", 1024);
    fireEvent.change(fileInput(), { target: { files: [original] } });
    fireEvent.click(screen.getByRole("button", { name: /save photo/i }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        "https://cdn.example.com/cropped.webp",
      ),
    );
    // Identity, not deep equality: vitest compares two `File`s structurally and
    // would happily call these interchangeable.
    const [firstUploadCall] = uploadImageMock.mock.calls;
    assertDefined(firstUploadCall, "the first uploadImage call");
    expect(firstUploadCall[0]).toBe(croppedFile);
    expect(firstUploadCall[0]).not.toBe(original);
    expect(getCroppedImgMock).toHaveBeenCalledTimes(1);
  });

  it("closes the cropper and uploads nothing on cancel", async () => {
    render(
      <FileUpload
        label="Avatar"
        cropToCircle
        value={null}
        onChange={vi.fn()}
      />,
    );

    fireEvent.change(fileInput(), {
      target: { files: [makeFile("a.png", "image/png", 1024)] },
    });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(uploadImageMock).not.toHaveBeenCalled();
    expect(getCroppedImgMock).not.toHaveBeenCalled();
  });

  it("resets the input on cancel so re-picking the same file still fires change", () => {
    render(
      <FileUpload
        label="Avatar"
        cropToCircle
        value={null}
        onChange={vi.fn()}
      />,
    );

    const input = fileInput();
    fireEvent.change(input, {
      target: { files: [makeFile("a.png", "image/png", 1024)] },
    });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    // A non-empty value would make the browser suppress `change` for the very
    // same file, leaving the user unable to retry after cancelling.
    expect(input.value).toBe("");
  });

  it("rejects an oversized file BEFORE decoding it in the cropper", async () => {
    render(
      <FileUpload
        label="Avatar"
        cropToCircle
        value={null}
        onChange={vi.fn()}
      />,
    );

    fireEvent.change(fileInput(), {
      target: { files: [makeFile("huge.png", "image/png", 6 * 1024 * 1024)] },
    });

    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/**
 * The avatar variant is the Instagram/WhatsApp treatment: the persistent
 * preview is a CIRCLE (same shape `Avatar` renders everywhere else), clicking
 * it changes the photo, and removal is a labelled button beside it instead of
 * an X floating over the corner of a square.
 */
describe("FileUpload avatar variant", () => {
  const renderAvatar = (
    props: Partial<React.ComponentProps<typeof FileUpload>> = {},
  ) =>
    render(
      <FileUpload
        label="Profile picture"
        variant="avatar"
        value={null}
        onChange={vi.fn()}
        {...props}
      />,
    );

  const previewGroup = () =>
    screen.getByRole("group", { name: /(change|add) photo/i });

  it("previews as a circle, not a square tile", () => {
    renderAvatar({ value: "https://cdn.example.com/a.png" });

    expect(previewGroup()).toHaveClass("rounded-full");
    expect(previewGroup()).not.toHaveClass("rounded-2xl");
  });

  it("labels the pick control 'Add photo' when empty", () => {
    renderAvatar();

    expect(screen.getByRole("button", { name: "Add photo" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /remove/i }),
    ).not.toBeInTheDocument();
  });

  it("offers 'Change photo' on the preview once a photo exists", () => {
    renderAvatar({ value: "https://cdn.example.com/a.png" });

    expect(screen.getByRole("button", { name: "Change photo" })).toBeEnabled();
  });

  it("removes via a labelled button, never a floating X", () => {
    renderAvatar({ value: "https://cdn.example.com/a.png" });

    // The tile variant's corner control must not be present here.
    expect(
      screen.queryByRole("button", { name: /remove image/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove photo/i }),
    ).toBeInTheDocument();
  });

  it("Remove photo fires onChange(null) and resets the input", () => {
    const onChange = vi.fn();
    renderAvatar({ value: "https://cdn.example.com/a.png", onChange });

    const input = fileInput();
    input.value = "";

    fireEvent.click(screen.getByRole("button", { name: /remove photo/i }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(input.value).toBe("");
  });

  it("keeps Change and Remove as siblings, never nested (D3)", () => {
    renderAvatar({ value: "https://cdn.example.com/a.png" });

    const change = screen.getByRole("button", { name: "Change photo" });
    const remove = screen.getByRole("button", { name: /remove photo/i });

    expect(change.contains(remove)).toBe(false);
    expect(remove.contains(change)).toBe(false);
    expect(fileInput()).toHaveAttribute("tabindex", "-1");
  });

  it("still routes a picked file through the crop dialog", () => {
    renderAvatar({ cropToCircle: true });

    fireEvent.change(fileInput(), {
      target: { files: [makeFile("a.png", "image/png", 1024)] },
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(uploadImageMock).not.toHaveBeenCalled();
  });
});

/**
 * The repositionable tile — the flow the bug report describes end to end:
 * upload a banner, and be shown WHERE it will be cropped before living with it.
 */
describe("FileUpload — repositionable tile", () => {
  beforeEach(() => {
    uploadImageMock.mockReset();
  });

  const renderTile = (
    props: Partial<React.ComponentProps<typeof FileUpload>> = {},
  ) => {
    const onChange = vi.fn();
    const onPlacementChange = vi.fn();
    render(
      <FileUpload
        label="Banner"
        aspect="banner"
        value={null}
        onChange={onChange}
        placement={null}
        onPlacementChange={onPlacementChange}
        placementAspect={3}
        {...props}
      />,
    );
    return { onChange, onPlacementChange };
  };

  it("opens the position editor as soon as the upload lands", async () => {
    uploadImageMock.mockResolvedValue("https://cdn.example.com/banner.png");
    const { onPlacementChange } = renderTile();

    fireEvent.change(fileInput(), {
      target: { files: [makeFile("banner.png", "image/png", 2048)] },
    });

    // Not a nicety: without this the owner has to DISCOVER that repositioning
    // exists, which is exactly what did not happen.
    await waitFor(() =>
      expect(screen.getByTestId("image-position-frame")).toBeInTheDocument(),
    );
    // A new photograph starts centred — keeping the previous photo's focal
    // point would frame the new one by an irrelevant rule.
    expect(onPlacementChange).toHaveBeenCalledWith({ x: 50, y: 50, scale: 1 });
  });

  it("never opens the editor when the caller did not ask for placement", async () => {
    uploadImageMock.mockResolvedValue("https://cdn.example.com/banner.png");
    render(
      <FileUpload
        label="Banner"
        aspect="banner"
        value={null}
        onChange={vi.fn()}
      />,
    );

    fireEvent.change(fileInput(), {
      target: { files: [makeFile("banner.png", "image/png", 2048)] },
    });

    await waitFor(() => expect(uploadImageMock).toHaveBeenCalled());
    expect(
      screen.queryByTestId("image-position-frame"),
    ).not.toBeInTheDocument();
  });

  it("keeps a Reposition control on the tile long after the upload", () => {
    renderTile({ value: "https://cdn.example.com/banner.png" });

    fireEvent.click(screen.getByRole("button", { name: /reposition/i }));

    expect(screen.getByTestId("image-position-frame")).toBeInTheDocument();
  });

  it("previews the tile at the stored focal point", () => {
    renderTile({
      value: "https://cdn.example.com/banner.png",
      placement: { x: 10, y: 90, scale: 2 },
    });

    const preview = screen.getAllByAltText(/banner preview/i)[0];
    expect(preview?.style.objectPosition).toBe("10% 90%");
    expect(preview?.style.transform).toBe("scale(2)");
  });

  it("clears the placement with the image — a focal point belongs to one photo", () => {
    const { onChange, onPlacementChange } = renderTile({
      value: "https://cdn.example.com/banner.png",
      placement: { x: 10, y: 90, scale: 2 },
    });

    fireEvent.click(screen.getByRole("button", { name: /remove image/i }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(onPlacementChange).toHaveBeenCalledWith(null);
  });
});
