import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileUpload } from "./file-upload";
import { uploadImage } from "../lib/upload-api";

vi.mock("../lib/upload-api", () => ({
  uploadImage: vi.fn(),
}));

const uploadImageMock = vi.mocked(uploadImage);

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
  });

  it("rejects an unsupported MIME type without uploading", async () => {
    const onChange = vi.fn();
    render(<FileUpload label="Avatar" value={null} onChange={onChange} />);

    const badFile = makeFile("resume.pdf", "application/pdf", 1024);
    fireEvent.change(fileInput(), { target: { files: [badFile] } });

    expect(await screen.findByText(/unsupported file type/i)).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /upload avatar/i })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
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
