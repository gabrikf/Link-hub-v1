import type { ApiToken } from "@repo/schemas";
import { render, screen, waitFor, within } from "@testing-library/react";
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
const createTokenMutateAsync = vi.fn();
vi.mock("../../../lib/token-queries", () => ({
  useMyTokens: () => useMyTokens(),
  useRevokeToken: () => useRevokeToken(),
  useCreateToken: () => ({
    mutateAsync: createTokenMutateAsync,
    isPending: false,
    reset: vi.fn(),
  }),
}));

// The disclosure panel has its own test file and its own React Query wiring.
// Stubbed here so this file stays about page structure and needs no provider.
// The stub keeps the real anchor id: the connect panel links to it, and whether
// that link still lands is exactly what the advanced section can break.
vi.mock("../components/disclosure-panel", () => ({
  DISCLOSURE_PANEL_ID: "agent-disclosure",
  DisclosurePanel: () => (
    <section id="agent-disclosure">What your agent may share</section>
  ),
}));

// Same reasoning for the activity-connections panel: its own test file covers
// it, and stubbing it keeps this one about the token list.
const connectionsPanelProps = vi.fn();
vi.mock("../components/connections-panel", () => ({
  ConnectionsPanel: (props: Record<string, unknown>) => {
    connectionsPanelProps(props);
    return null;
  },
}));

// The wizard and the explainer have their own test files and their own React
// Query wiring; here only "does the page open them" matters, so the stubs
// render a marker when told to be open.
vi.mock("../components/auto-post-wizard/auto-post-wizard", () => ({
  AutoPostWizard: ({ open }: { open: boolean }) =>
    open ? <div data-testid="auto-post-wizard">wizard open</div> : null,
}));
vi.mock("../components/how-it-works-dialog", () => ({
  HowItWorksDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="how-it-works">explainer open</div> : null,
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

/** Both revoked — the "you have no tokens" empty state would be a lie. */
const secondRevokedToken: ApiToken = {
  ...revokedToken,
  id: "tok-revoked-2",
  name: "Older token",
  tokenPrefix: "lh_pat_old3",
};

afterEach(() => {
  useMyTokens.mockReset();
  revokeMutate.mockReset();
  createTokenMutateAsync.mockReset();
  connectionsPanelProps.mockReset();
  window.sessionStorage.clear();
  useRevokeToken.mockReturnValue({
    mutate: revokeMutate,
    isPending: false,
    variables: undefined,
  });
});

describe("SettingsPage automatic posts section", () => {
  function renderWithTokens() {
    useMyTokens.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    return render(<SettingsPage />);
  }

  it("renders one unified section with the wizard as the primary path", () => {
    renderWithTokens();

    expect(screen.getByText("Automatic posts")).toBeInTheDocument();
    expect(
      screen.getByText(/Metadata only — never code, never names/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add source/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /How this works/i }),
    ).toBeInTheDocument();

    // The connections list is embedded under the unified header rather than
    // repeating its own competing headline, and gets the wizard callbacks.
    expect(connectionsPanelProps).toHaveBeenCalledWith(
      expect.objectContaining({
        embedded: true,
        onAddSource: expect.any(Function),
        onFinishSetup: expect.any(Function),
      }),
    );
  });

  it("opens the wizard from the Add source button", async () => {
    const user = userEvent.setup();
    renderWithTokens();

    expect(screen.queryByTestId("auto-post-wizard")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Add source/i }));
    expect(screen.getByTestId("auto-post-wizard")).toBeInTheDocument();
  });

  it("keeps the explainer hidden until asked for", async () => {
    const user = userEvent.setup();
    renderWithTokens();

    expect(screen.queryByTestId("how-it-works")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /How this works/i }));
    expect(screen.getByTestId("how-it-works")).toBeInTheDocument();
  });

  it("demotes the manual MCP panel into a collapsed disclosure", () => {
    const { container } = renderWithTokens();

    const summary = screen.getByText(/Manual agent setup & snippets/);
    const details = summary.closest("details");
    expect(details).not.toBeNull();
    // Collapsed by default — the wizard is the primary path.
    expect(details).not.toHaveAttribute("open");
    // The full connect panel still lives inside it, undiminished.
    expect(
      container.querySelector(`#connect-your-ai-tools`),
    ).not.toBeNull();
  });
});

describe("SettingsPage advanced settings", () => {
  function renderPage(tokens: ApiToken[] = []) {
    useMyTokens.mockReturnValue({
      data: tokens,
      isLoading: false,
      isError: false,
    });
    return render(<SettingsPage />);
  }

  it("keeps disclosure and tokens behind one collapsed Advanced settings area", () => {
    const { container } = renderPage([activeToken]);

    const advanced = container.querySelector("details#advanced-settings");
    expect(advanced).not.toBeNull();
    // Collapsed by default — the default page is the automatic-posts section.
    expect(advanced).not.toHaveAttribute("open");
    expect(
      screen.getByText(/Advanced settings/),
    ).toBeInTheDocument();

    // Both demoted panels live inside it, not on the page.
    expect(advanced?.querySelector("#agent-disclosure")).not.toBeNull();
    expect(
      advanced?.textContent?.includes("Personal access tokens"),
    ).toBe(true);
  });

  it("says why the advanced controls exist rather than just hiding them", () => {
    renderPage();

    expect(
      screen.getByText(
        /These control what a post is allowed to contain, and the credentials your tools authenticate with\. The wizard sets sane defaults — you only need these to change them\./,
      ),
    ).toBeInTheDocument();
  });

  it("moves Create token out of the page header and into the tokens block", () => {
    const { container } = renderPage([activeToken]);

    const header = container.querySelector("header");
    expect(header?.querySelector("button")).toBeNull();

    const createButton = screen.getByRole("button", { name: /^Create token$/ });
    expect(createButton.closest("details")).toHaveAttribute(
      "id",
      "advanced-settings",
    );
  });

  it("opens on click, revealing the panels", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(screen.getByText(/Advanced settings/));

    expect(container.querySelector("details#advanced-settings")).toHaveAttribute(
      "open",
    );
  });

  it("opens the collapsed area when a link points inside it", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    // The manual connect panel links to the disclosure panel's anchor, which
    // now lives inside the collapsed advanced area. Without the reveal, this
    // link silently does nothing.
    const link = screen.getByRole("link", {
      name: /What your agent may share/,
    });
    await user.click(link);

    expect(container.querySelector("details#advanced-settings")).toHaveAttribute(
      "open",
    );
  });

  it("opens the manual-setup disclosure after a token is created", async () => {
    const user = userEvent.setup();
    createTokenMutateAsync.mockResolvedValue({
      id: "tok-new",
      name: "Claude Desktop",
      tokenPrefix: "lh_pat_new",
      scopes: ["posts:write"],
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date("2026-08-01"),
      revokedAt: null,
      token: "lh_pat_ONE_TIME_PLAINTEXT",
    });
    const { container } = renderPage();

    await user.click(screen.getByRole("button", { name: /^Create token$/ }));
    await user.type(screen.getByLabelText("Name"), "Claude Desktop");
    // The submit button inside the dialog, not the one that opened it.
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Create token" }));

    // Shown once, and stashed so closing the dialog cannot destroy it.
    expect(
      await screen.findByText("lh_pat_ONE_TIME_PLAINTEXT"),
    ).toBeInTheDocument();
    expect(
      window.sessionStorage.getItem("linkhub:last-created-token"),
    ).toContain("lh_pat_ONE_TIME_PLAINTEXT");

    // The scroll target sits inside the collapsed manual-setup disclosure;
    // scrolling to a closed <details> moves nothing, so it has to open.
    await waitFor(() => {
      const target = container.querySelector("#connect-your-ai-tools");
      expect(target?.closest("details")).toHaveAttribute("open");
    });
  });
});

describe("SettingsPage token list", () => {
  it("renders masked token prefixes and active status badges", () => {
    useMyTokens.mockReturnValue({
      data: [activeToken],
      isLoading: false,
      isError: false,
    });

    render(<SettingsPage />);

    // Masked prefix (prefix + ellipsis), never the full token.
    expect(screen.getByText("lh_pat_active1…")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("hides revoked tokens behind a count toggle, both ways", async () => {
    const user = userEvent.setup();
    useMyTokens.mockReturnValue({
      data: [activeToken, revokedToken],
      isLoading: false,
      isError: false,
    });

    render(<SettingsPage />);

    // Revoked tokens are history, not inventory.
    expect(screen.getByText("lh_pat_active1…")).toBeInTheDocument();
    expect(screen.queryByText("lh_pat_old2…")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show 1 revoked" }));
    expect(screen.getByText("lh_pat_old2…")).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    // A revoked token has nothing left to revoke.
    expect(screen.getAllByRole("button", { name: /^Revoke$/ })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Hide revoked" }));
    expect(screen.queryByText("lh_pat_old2…")).not.toBeInTheDocument();
  });

  it("does not claim you have no tokens when every token is revoked", async () => {
    const user = userEvent.setup();
    useMyTokens.mockReturnValue({
      data: [revokedToken, secondRevokedToken],
      isLoading: false,
      isError: false,
    });

    render(<SettingsPage />);

    expect(screen.queryByText(/don.?t have any tokens yet/i)).toBeNull();
    expect(
      screen.getByText(/No active tokens\. Every token on this account/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show 2 revoked" }));
    expect(screen.getByText("lh_pat_old2…")).toBeInTheDocument();
    expect(screen.getByText("lh_pat_old3…")).toBeInTheDocument();
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
