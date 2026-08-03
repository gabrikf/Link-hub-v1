import type { CreateApiTokenOutput } from "@repo/schemas";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
const reset = vi.fn();
vi.mock("../../../lib/token-queries", () => ({
  useCreateToken: () => ({ mutateAsync, isPending: false, reset }),
}));

import { CreateTokenDialog } from "./create-token-dialog";

const createdToken: CreateApiTokenOutput = {
  id: "tok-1",
  name: "Claude Desktop",
  tokenPrefix: "lh_pat_ab12c",
  scopes: ["posts:write", "posts:read"],
  expiresAt: null,
  lastUsedAt: null,
  createdAt: new Date("2026-01-01"),
  revokedAt: null,
  token: "lh_pat_THE_ONE_TIME_PLAINTEXT_SECRET",
};

const writeText = vi.fn().mockResolvedValue(undefined);

function stubClipboard() {
  // Define AFTER userEvent.setup(), which installs its own clipboard stub.
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

beforeEach(() => {
  mutateAsync.mockReset();
  reset.mockReset();
  writeText.mockClear();
});

describe("CreateTokenDialog", () => {
  it("surfaces the one-time plaintext token with a copy affordance after creation", async () => {
    const user = userEvent.setup();
    stubClipboard();
    mutateAsync.mockResolvedValue(createdToken);

    render(
      <CreateTokenDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />,
    );

    await user.type(screen.getByLabelText("Name"), "Claude Desktop");
    await user.click(screen.getByRole("button", { name: "Create token" }));

    // The full plaintext secret is shown exactly once.
    expect(
      await screen.findByText(createdToken.token),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/you won.?t see it again/i),
    ).toBeInTheDocument();

    // The copy affordance writes the plaintext to the clipboard.
    await user.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith(createdToken.token);
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("requires a name before calling the create mutation", async () => {
    const user = userEvent.setup();
    render(
      <CreateTokenDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Create token" }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getByText(/give your token a name/i),
    ).toBeInTheDocument();
  });

  it("shows the name error next to the field and focuses it", async () => {
    const user = userEvent.setup();
    render(
      <CreateTokenDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Create token" }));

    const nameInput = screen.getByLabelText("Name");
    const error = screen.getByText(/give your token a name/i);

    // Field-level, not a page-level string at the bottom of the form.
    expect(nameInput.parentElement).toContainElement(error);
    expect(nameInput).toHaveFocus();
  });

  /**
   * `scopes.length > 0 ? scopes : DEFAULT_SCOPES` handed a token WITH
   * `posts:write` to a user who had deliberately unchecked it — a silent
   * privilege escalation on the one screen that is entirely about privileges.
   */
  describe("scope selection", () => {
    it("never substitutes defaults for a deliberately empty selection", async () => {
      const user = userEvent.setup();
      render(
        <CreateTokenDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />,
      );

      await user.type(screen.getByLabelText("Name"), "Read only");
      await user.click(screen.getByRole("checkbox", { name: /posts:write/ }));
      await user.click(screen.getByRole("checkbox", { name: /posts:read/ }));
      await user.click(screen.getByRole("checkbox", { name: /profile:read/ }));

      const submit = screen.getByRole("button", { name: "Create token" });
      expect(submit).toBeDisabled();
      expect(screen.getByText("Select at least one scope.")).toBeInTheDocument();

      await user.click(submit);
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it("sends exactly the scopes left checked", async () => {
      const user = userEvent.setup();
      mutateAsync.mockResolvedValue(createdToken);

      render(
        <CreateTokenDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} />,
      );

      await user.type(screen.getByLabelText("Name"), "Read only");
      // Drop write; keep both reads.
      await user.click(screen.getByRole("checkbox", { name: /posts:write/ }));
      await user.click(screen.getByRole("button", { name: "Create token" }));

      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ scopes: ["posts:read", "profile:read"] }),
      );
    });
  });
});
