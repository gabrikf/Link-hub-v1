import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageInput } from "./image-input";

describe("ImageInput", () => {
  it("renders a preview image for a valid http(s) url", () => {
    render(
      <ImageInput
        label="Banner"
        value="https://example.com/pic.png"
        onChange={vi.fn()}
      />,
    );

    const img = screen.getByAltText("Banner preview") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toBe("https://example.com/pic.png");
  });

  it("shows an inline error for an invalid url on blur", () => {
    const onChange = vi.fn();
    render(<ImageInput label="Banner" value={null} onChange={onChange} />);

    const input = screen.getByLabelText("Banner");
    fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    fireEvent.blur(input);

    expect(
      screen.getByText(/valid http\(s\) image URL/i),
    ).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    // Invalid values are never committed upward.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("commits a valid url on blur", () => {
    const onChange = vi.fn();
    render(<ImageInput label="Banner" value={null} onChange={onChange} />);

    const input = screen.getByLabelText("Banner");
    fireEvent.change(input, {
      target: { value: "https://example.com/a.jpg" },
    });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith("https://example.com/a.jpg");
  });

  it("clears the value via the clear button", () => {
    const onChange = vi.fn();
    render(
      <ImageInput
        label="Banner"
        value="https://example.com/pic.png"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Clear image"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("commits a valid url pasted straight into the field", async () => {
    const onChange = vi.fn();
    render(<ImageInput label="Banner" value={null} onChange={onChange} />);

    const input = screen.getByLabelText("Banner");
    // The browser inserts the pasted text into the field (fires change) and then
    // the paste handler commits the resulting field value.
    fireEvent.change(input, {
      target: { value: "https://example.com/pasted.png" },
    });
    fireEvent.paste(input);

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("https://example.com/pasted.png"),
    );
  });

  it("does not commit an invalid pasted value", async () => {
    const onChange = vi.fn();
    render(<ImageInput label="Banner" value={null} onChange={onChange} />);

    const input = screen.getByLabelText("Banner");
    fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    fireEvent.paste(input);

    // Give the deferred paste-commit microtask a chance to run before asserting.
    await Promise.resolve();
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a broken-image state when the image fails to load", () => {
    render(
      <ImageInput
        label="Banner"
        value="https://example.com/missing.png"
        onChange={vi.fn()}
      />,
    );

    fireEvent.error(screen.getByAltText("Banner preview"));
    expect(screen.getByText(/couldn't load image/i)).toBeInTheDocument();
  });
});
