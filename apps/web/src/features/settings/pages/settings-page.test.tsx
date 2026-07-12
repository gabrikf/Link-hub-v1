import type { ApiToken } from "@repo/schemas";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const revokeMutate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock("../../../lib/auth-tokens", () => ({
  getAuthTokens: () => ({ accessToken: "x", refreshToken: "y" }),
}));
vi.mock("../../../lib/user-info-store", () => ({
  useUserInfoStore: (selector: (state: unknown) => unknown) =>
    selector({ userInfo: { login: "ada", name: "Ada Lovelace" } }),
}));

const useMyTokens = vi.fn();
vi.mock("../../../lib/token-queries", () => ({
  useMyTokens: () => useMyTokens(),
  useRevokeToken: () => ({ mutate: revokeMutate, isPending: false }),
  useCreateToken: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  }),
}));

import { SettingsPage } from "./settings-page";

const activeToken: ApiToken = {
  id: "tok-active",
  name: "Work laptop",
  tokenPrefix: "lh_pat_active1",
  scopes: ["posts:write"],
  expiresAt: null,
  lastUsedAt: null,
  createdAt: new Date("2026-01-01"),
  revokedAt: null,
};

const revokedToken: ApiToken = {
  ...activeToken,
  id: "tok-revoked",
  name: "Old token",
  tokenPrefix: "lh_pat_old2",
  revokedAt: new Date("2026-02-01"),
};

afterEach(() => {
  useMyTokens.mockReset();
  revokeMutate.mockReset();
});

describe("SettingsPage token list", () => {
  it("renders masked token prefixes and active/revoked status badges", () => {
    useMyTokens.mockReturnValue({
      data: [activeToken, revokedToken],
      isLoading: false,
      isError: false,
    });

    render(<SettingsPage />);

    // Masked prefix (prefix + ellipsis), never the full token.
    expect(screen.getByText("lh_pat_active1…")).toBeInTheDocument();
    expect(screen.getByText("lh_pat_old2…")).toBeInTheDocument();

    // Status badges.
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
  });

  it("calls the revoke mutation with the token id after confirming", async () => {
    const user = userEvent.setup();
    useMyTokens.mockReturnValue({
      data: [activeToken],
      isLoading: false,
      isError: false,
    });

    render(<SettingsPage />);

    // Active tokens expose a Revoke button; revoked ones do not.
    await user.click(screen.getByRole("button", { name: /revoke/i }));

    // Confirmation dialog — confirm the destructive action.
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    expect(revokeMutate).toHaveBeenCalledWith("tok-active");
  });

  it("shows the empty state when there are no tokens", () => {
    useMyTokens.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<SettingsPage />);

    expect(
      screen.getByText(/don.?t have any tokens yet/i),
    ).toBeInTheDocument();
  });
});
