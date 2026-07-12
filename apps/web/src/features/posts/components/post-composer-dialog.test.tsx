import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PostComposerDialog } from "./post-composer-dialog";

function renderComposer(onSubmit = vi.fn()) {
  render(
    <PostComposerDialog
      open
      onOpenChange={vi.fn()}
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
