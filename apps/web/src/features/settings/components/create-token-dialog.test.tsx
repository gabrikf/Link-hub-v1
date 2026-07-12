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
});
