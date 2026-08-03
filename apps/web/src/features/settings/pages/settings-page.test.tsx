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
const useRevokeToken = vi.fn(() => ({
  mutate: revokeMutate,
  isPending: false,
  variables: undefined as string | undefined,
}));
vi.mock("../../../lib/token-queries", () => ({
  useMyTokens: () => useMyTokens(),
  useRevokeToken: () => useRevokeToken(),
  useCreateToken: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  }),
}));

// The disclosure panel has its own test file and its own React Query wiring.
// Stubbed here so this file stays about the token list and needs no provider.
vi.mock("../components/disclosure-panel", () => ({
  DISCLOSURE_PANEL_ID: "agent-disclosure",
  DisclosurePanel: () => null,
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

const secondActiveToken: ApiToken = {
  ...activeToken,
  id: "tok-active-2",
  name: "Home desktop",
  tokenPrefix: "lh_pat_active2",
};

afterEach(() => {
  useMyTokens.mockReset();
  revokeMutate.mockReset();
  useRevokeToken.mockReturnValue({
    mutate: revokeMutate,
    isPending: false,
    variables: undefined,
  });
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

    // Confirmation dialog — confirm the destructive action. Destructive
    // confirmations render as `role="alertdialog"`, not `role="dialog"`.
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    expect(revokeMutate).toHaveBeenCalledWith("tok-active");
  });

  it("renders token-row skeletons instead of a text label while loading", () => {
    useMyTokens.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<SettingsPage />);

    expect(container.textContent).not.toContain("Loading tokens...");

    // Skeletons are aria-hidden, so the announcement carries the state.
    expect(screen.getByRole("status")).toHaveTextContent("Loading tokens");

    // Placeholders sit in the same `space-y-3` list as the real rows.
    const list = container.querySelector("ul.space-y-3");
    expect(list).not.toBeNull();
    expect(list?.querySelectorAll(":scope > li")).toHaveLength(2);
  });

  it("spins only the row being revoked, not every Revoke button", () => {
    useMyTokens.mockReturnValue({
      data: [activeToken, secondActiveToken],
      isLoading: false,
      isError: false,
    });
    useRevokeToken.mockReturnValue({
      mutate: revokeMutate,
      isPending: true,
      variables: "tok-active",
    });

    render(<SettingsPage />);

    const [revoking, untouched] = screen.getAllByRole("button", {
      name: /revok/i,
    });

    // The in-flight row announces itself and blocks a second click...
    expect(revoking).toHaveAccessibleName("Revoking...");
    expect(revoking).toHaveAttribute("aria-busy", "true");
    expect(revoking).toBeDisabled();

    // ...while the other token's button stays usable.
    expect(untouched).toHaveAccessibleName("Revoke");
    expect(untouched).not.toHaveAttribute("aria-busy");
    expect(untouched).toBeEnabled();
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
