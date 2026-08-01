import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { FOCUS_RING } from "./surface";

describe("Button focus ring", () => {
  it("carries the house focus ring so keyboard focus is visible", () => {
    render(<Button>Save</Button>);

    const classes = screen.getByRole("button", { name: "Save" }).className;

    for (const token of FOCUS_RING.split(/\s+/)) {
      expect(classes).toContain(token);
    }
  });

  it("keeps the ring when a caller passes its own className", () => {
    render(<Button className="mt-4">Save</Button>);

    const classes = screen.getByRole("button", { name: "Save" }).className;

    expect(classes).toContain("mt-4");
    expect(classes).toContain("focus-visible:ring-violet-500");
  });

  it.each(["primary", "outline", "soft", "ghost", "icon", "danger"] as const)(
    "keeps the ring on the %s variant",
    (variant) => {
      render(<Button variant={variant}>Save</Button>);

      expect(
        screen.getByRole("button", { name: "Save" }).className,
      ).toContain("focus-visible:ring-2");
    },
  );
});

describe("Button loading state", () => {
  it("disables itself and swaps the label while loading", () => {
    render(
      <Button isLoading loadingLabel="Saving...">
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Saving..." });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});

describe("Button destructive confirmation", () => {
  it("opens an alertdialog, not a plain dialog", async () => {
    const user = userEvent.setup();
    render(
      <Button shouldHaveConfirmation confirmationTitle="Delete link?">
        Delete
      </Button>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete link?");
    expect(dialog).toHaveTextContent("This action can't be undone.");
  });

  it("focuses Cancel, not the destructive action", async () => {
    const user = userEvent.setup();
    render(
      <Button shouldHaveConfirmation onClick={vi.fn()}>
        Delete
      </Button>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("alertdialog");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
  });

  it("runs onClick only after Confirm", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button shouldHaveConfirmation onClick={onClick}>
        Delete
      </Button>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("alertdialog");
    expect(onClick).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("runs nothing when Cancel is chosen", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button shouldHaveConfirmation onClick={onClick}>
        Delete
      </Button>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClick).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });
});
