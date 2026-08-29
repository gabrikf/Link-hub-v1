import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileShareButton } from "./profile-share-button";

const URL = "https://crafthub.dev/ada";

function setNavigator({
  share,
  writeText,
}: {
  share?: unknown;
  writeText?: unknown;
}) {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: share,
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

afterEach(() => {
  setNavigator({ share: undefined, writeText: undefined });
});

describe("ProfileShareButton", () => {
  it("does NOT fall back to clipboard when the user aborts the native share", async () => {
    const user = userEvent.setup();
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException("dismissed", "AbortError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share, writeText });

    render(<ProfileShareButton url={URL} name="Ada" />);
    await user.click(screen.getByRole("button", { name: "Share this profile" }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });

  it("copies to the clipboard when native share is unavailable", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share: undefined, writeText });

    render(<ProfileShareButton url={URL} name="Ada" />);
    await user.click(screen.getByRole("button", { name: "Share this profile" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("falls back to clipboard when share rejects with a non-abort error", async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockRejectedValue(new Error("share failed"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator({ share, writeText });

    render(<ProfileShareButton url={URL} name="Ada" />);
    await user.click(screen.getByRole("button", { name: "Share this profile" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
