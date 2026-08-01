import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PostComposerDialog } from "./post-composer-dialog";

function renderComposer(onSubmit = vi.fn(), onOpenChange = vi.fn()) {
  render(
    <PostComposerDialog
      open
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

describe("PostComposerDialog", () => {
  it("blocks submit when the body is empty (zod gate) and surfaces an error", async () => {
    const user = userEvent.setup();
    const onSubmit = renderComposer();

    await user.click(screen.getByRole("button", { name: "Publish" }));

    expect(onSubmit).not.toHaveBeenCalled();
    // zod message from createPostSchemaInput ("Body is required").
    expect(await screen.findByText(/body is required/i)).toBeInTheDocument();
  });

  it("submits with valid content (source defaults to manual, status published)", async () => {
    const user = userEvent.setup();
    const onSubmit = renderComposer();

    await user.type(screen.getByLabelText(/body/i), "Hello world");
    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Hello world",
        status: "published",
        source: "manual",
      }),
    );
  });

  it("toggles the status to draft and includes it in the submitted payload", async () => {
    const user = userEvent.setup();
    const onSubmit = renderComposer();

    await user.type(screen.getByLabelText(/body/i), "Draft body");
    await user.click(screen.getByRole("button", { name: "draft" }));
    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ status: "draft" }),
    );
  });

  it("adds a tag chip through the embedded TagInput and submits it", async () => {
    const user = userEvent.setup();
    const onSubmit = renderComposer();

    await user.type(screen.getByLabelText(/body/i), "Tagged post");
    await user.type(screen.getByLabelText("Tags"), "typescript{Enter}");
    expect(screen.getByText("#typescript")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["typescript"] }),
    );
  });
});

/**
 * Client-side zod failures were always handled. A *server* failure was not: the
 * rejection propagated out of `handleSave`, `onOpenChange(false)` never ran and
 * nothing set `error` — so the dialog just sat there over the user's draft with
 * the spinner stopped and no reason given.
 */
describe("PostComposerDialog server failures", () => {
  it("keeps the dialog open and shows the server's reason", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error("Post body contains a banned term"));

    renderComposer(onSubmit, onOpenChange);

    await user.type(screen.getByLabelText(/body/i), "Hello world");
    await user.click(screen.getByRole("button", { name: "Publish" }));

    expect(
      await screen.findByText("Post body contains a banned term"),
    ).toBeInTheDocument();

    // The draft must survive — dismissing here would discard the user's writing.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("falls back to generic copy when the rejection carries no message", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error(""));

    renderComposer(onSubmit);

    await user.type(screen.getByLabelText(/body/i), "Hello world");
    await user.click(screen.getByRole("button", { name: "Publish" }));

    expect(
      await screen.findByText(/could not publish your post/i),
    ).toBeInTheDocument();
  });

  it("closes the dialog only when the save actually succeeds", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderComposer(onSubmit, onOpenChange);

    await user.type(screen.getByLabelText(/body/i), "Hello world");
    await user.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
