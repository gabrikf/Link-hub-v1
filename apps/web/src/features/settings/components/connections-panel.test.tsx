import type { AgentPolicy, GitConnection } from "@repo/schemas";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const deleteMutate = vi.fn();

const useMyConnections = vi.fn();
const useAgentPolicy = vi.fn();
const useWorkExperiencesForPolicy = vi.fn();
const useDeleteConnection = vi.fn();

vi.mock("../lib/connection-queries", () => ({
  useMyConnections: () => useMyConnections(),
  useCreateConnection: () => ({
    mutateAsync: createMutateAsync,
    isPending: false,
  }),
  useUpdateConnection: () => ({
    mutateAsync: updateMutateAsync,
    isPending: false,
  }),
  useDeleteConnection: () => useDeleteConnection(),
}));

vi.mock("../lib/agent-policy-queries", () => ({
  useAgentPolicy: () => useAgentPolicy(),
  useWorkExperiencesForPolicy: () => useWorkExperiencesForPolicy(),
}));

import { ConnectionsPanel } from "./connections-panel";

const BASE_CONNECTION: GitConnection = {
  id: "conn-1",
  userId: "user-1",
  provider: "github",
  kind: "personal",
  displayName: "Personal GitHub",
  externalAccountId: "ada",
  workExperienceId: null,
  disclosureLevelOverride: null,
  autoPostEnabled: false,
  cadence: "weekly",
  includeAgentSummary: false,
  lastDigestAt: new Date("2026-03-04"),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

/**
 * A work connection whose own override says `full`, linked to a role the
 * account has pinned at `summary`. The role must win — that is the whole point
 * of the precedence chain.
 */
const WORK_CONNECTION: GitConnection = {
  ...BASE_CONNECTION,
  id: "conn-2",
  provider: "gitlab",
  kind: "work",
  displayName: "Acme GitLab",
  workExperienceId: "role-1",
  disclosureLevelOverride: "full",
  lastDigestAt: null,
};

const POLICY: AgentPolicy = {
  disclosureLevel: "detailed",
  blockedTerms: [],
  perEmployer: [
    {
      workExperienceId: "role-1",
      companyName: "Acme Corp",
      disclosureLevel: "summary",
    },
  ],
};

const ROLES = [
  {
    id: "role-1",
    userId: "user-1",
    title: "Senior Engineer",
    companyName: "Acme Corp",
    employmentType: null,
    workModel: null,
    locationCity: null,
    locationState: null,
    locationCountry: null,
    startDate: null,
    endDate: null,
    isCurrent: true,
    description: null,
    mainStack: [],
    displayOrder: 0,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  },
];

const SECRET = "whsec_9f3c1d2b7a6e4f508c1a2b3d4e5f6071";

beforeEach(() => {
  window.sessionStorage.clear();
  useMyConnections.mockReturnValue({
    data: [BASE_CONNECTION],
    isLoading: false,
    isError: false,
  });
  useAgentPolicy.mockReturnValue({
    data: POLICY,
    isLoading: false,
    isError: false,
  });
  useWorkExperiencesForPolicy.mockReturnValue({
    data: ROLES,
    isLoading: false,
    isError: false,
  });
  useDeleteConnection.mockReturnValue({
    mutate: deleteMutate,
    isPending: false,
    variables: undefined,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("ConnectionsPanel list", () => {
  it("renders each connection with provider, kind, cadence, auto-post and last digest", () => {
    useMyConnections.mockReturnValue({
      data: [BASE_CONNECTION, WORK_CONNECTION],
      isLoading: false,
      isError: false,
    });

    const { container } = render(<ConnectionsPanel />);
    const text = container.textContent ?? "";

    expect(screen.getByText("Personal GitHub")).toBeInTheDocument();
    expect(screen.getByText("Acme GitLab")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("GitLab")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();

    // Cadence, auto-posting state and the last digest are all on the row.
    expect(text).toContain("Weekly");
    expect(screen.getAllByText("Auto-posting off")).toHaveLength(2);
    // A connection that has produced a digest shows when; one that hasn't says so.
    expect(text).toContain("No digest yet");
  });

  it("shows the empty state when no source is connected", () => {
    useMyConnections.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<ConnectionsPanel />);

    expect(
      screen.getByText(/No activity sources connected yet/i),
    ).toBeInTheDocument();
  });

  it("renders row skeletons instead of a text label while loading", () => {
    useMyConnections.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<ConnectionsPanel />);

    expect(container.textContent).not.toContain("Loading activity sources...");

    // Skeletons are aria-hidden, so the announcement carries the state.
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading activity sources",
    );

    const list = container.querySelector("ul.space-y-3");
    expect(list).not.toBeNull();
    expect(list?.querySelectorAll(":scope > li")).toHaveLength(2);
  });

  it("surfaces a load failure instead of an empty state that looks like no sources", () => {
    useMyConnections.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<ConnectionsPanel />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Could not load your activity sources/i,
    );
  });
});

describe("ConnectionsPanel effective disclosure", () => {
  it("resolves a work connection's level through its linked work experience", () => {
    useMyConnections.mockReturnValue({
      data: [WORK_CONNECTION],
      isLoading: false,
      isError: false,
    });

    const { container } = render(<ConnectionsPanel />);
    const text = container.textContent ?? "";

    // The role is pinned at Summary; the connection's own override says Full and
    // the account default is Detailed. The role must win, and the UI must say so.
    expect(text).toContain("Disclosure: Summary");
    expect(text).toContain("from Acme Corp's own level");
    expect(text).not.toContain("Disclosure: Full");

    // And the consequence is spelled out, not left to be inferred.
    expect(text).toContain("never name Acme Corp");
  });

  it("falls back to the per-connection override when the role has no level", () => {
    useMyConnections.mockReturnValue({
      data: [{ ...WORK_CONNECTION, workExperienceId: null }],
      isLoading: false,
      isError: false,
    });

    const { container } = render(<ConnectionsPanel />);
    const text = container.textContent ?? "";

    expect(text).toContain("Disclosure: Full");
    expect(text).toContain("from this connection's override");
  });

  it("leaves a personal connection out of the disclosure story entirely", () => {
    const { container } = render(<ConnectionsPanel />);

    expect(container.textContent).not.toContain("Disclosure:");
  });

  it("holds a mixed connection to the work rules, and labels it as both", () => {
    useMyConnections.mockReturnValue({
      data: [{ ...WORK_CONNECTION, kind: "mixed" as const }],
      isLoading: false,
      isError: false,
    });

    const { container } = render(<ConnectionsPanel />);
    const text = container.textContent ?? "";

    expect(screen.getByText("Personal + work")).toBeInTheDocument();
    // One machine, both kinds of repo — the aggregate can only be as loose as
    // the work half allows.
    expect(text).toContain("Disclosure: Summary");
    expect(text).toContain("never name Acme Corp");
  });
});

describe("ConnectionsPanel one-time webhook secret", () => {
  async function createGithubConnection() {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue({
      ...BASE_CONNECTION,
      id: "conn-new",
      displayName: "Work GitHub",
      webhookSecret: SECRET,
    });

    const view = render(<ConnectionsPanel />);

    await user.click(screen.getByRole("button", { name: /Add source/i }));
    await user.type(screen.getByLabelText("Display name"), "Work GitHub");
    await user.click(screen.getByRole("button", { name: "Connect source" }));

    return { user, view };
  }

  it("shows the secret once, with the webhook URL and the exact setup steps", async () => {
    // The URL is built from the configured API base, not the page origin.
    vi.stubEnv("VITE_API_URL", "https://api.crafthub.example");
    const { view } = await createGithubConnection();

    // The dialog is dismissed as part of creating — the secret must outlive it.
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(screen.getByText(SECRET)).toBeInTheDocument();
    expect(screen.getByText(/shown once and can never be retrieved/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy Webhook secret/i })).toBeInTheDocument();

    const text = view.container.textContent ?? "";
    expect(text).toContain("https://api.crafthub.example/webhooks/github/conn-new");
    // The single most common way to configure this wrong.
    expect(text).toContain("Content type: application/json");
    expect(text).toContain("admin or owner");
  });

  it("keeps the secret across a remount, because it is unrecoverable", async () => {
    const { view } = await createGithubConnection();
    await screen.findByText(SECRET);

    view.unmount();
    render(<ConnectionsPanel />);

    // Session-scoped, exactly like the one-time personal access token.
    expect(screen.getByText(SECRET)).toBeInTheDocument();
  });

  it("resurfaces a wizard-stashed secret the moment the wizard closes", async () => {
    // The wizard stashes mid-flight; the panel is already mounted, so the
    // mount-time seed alone would miss it until a full page revisit.
    const view = render(<ConnectionsPanel wizardOpen />);
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();

    window.sessionStorage.setItem(
      "crafthub:last-created-connection",
      JSON.stringify({
        connectionId: "conn-wizard",
        provider: "github",
        displayName: "From the wizard",
        webhookSecret: SECRET,
      }),
    );
    view.rerender(<ConnectionsPanel wizardOpen={false} />);

    expect(screen.getByText(SECRET)).toBeInTheDocument();
    expect(screen.getByText(/Finish setting up From the wizard/)).toBeInTheDocument();
  });

  it("never shows a secret for a connection loaded from the list", () => {
    useMyConnections.mockReturnValue({
      data: [BASE_CONNECTION, WORK_CONNECTION],
      isLoading: false,
      isError: false,
    });

    const { container } = render(<ConnectionsPanel />);

    // Read paths omit `webhookSecret` outright — there is nothing to render.
    expect(container.textContent).not.toContain(SECRET);
    expect(screen.queryByText(/Webhook secret — shown once/)).not.toBeInTheDocument();
  });

  it("prints the extractor's own hook snippet for a Claude Code source", () => {
    useMyConnections.mockReturnValue({
      data: [
        {
          ...BASE_CONNECTION,
          id: "conn-hook",
          provider: "claude_code" as const,
          displayName: "Laptop agent",
        },
      ],
      isLoading: false,
      isError: false,
    });

    const { container } = render(<ConnectionsPanel />);
    const codeText = Array.from(container.querySelectorAll("pre"))
      .map((element) => element.textContent ?? "")
      .join("\n");

    // Byte-for-byte what `crafthub-hook print-settings` emits. A hook declared
    // even slightly wrong never fires, and nothing reports it.
    expect(codeText).toContain('"Stop"');
    expect(codeText).toContain('"command": "crafthub-hook stop"');
    expect(codeText).toContain('"command": "crafthub-hook session-end"');
    expect(codeText).toContain('"async": true');
    expect(container.textContent).toContain(
      "records session metadata locally on every turn and uploads it when a session ends",
    );
  });
});

describe("ConnectionsPanel wizard integration", () => {
  it("routes Add source to the wizard when a handler is provided", async () => {
    const user = userEvent.setup();
    const onAddSource = vi.fn();

    // Embedded mode has no header button; the empty state still needs one.
    useMyConnections.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ConnectionsPanel embedded onAddSource={onAddSource} />);
    await user.click(
      screen.getByRole("button", { name: /Connect your first source/i }),
    );

    expect(onAddSource).toHaveBeenCalledTimes(1);
    // The old create dialog must NOT open alongside the wizard.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers Finish setup per row, resuming the wizard with that connection", async () => {
    const user = userEvent.setup();
    const onFinishSetup = vi.fn();

    render(<ConnectionsPanel embedded onFinishSetup={onFinishSetup} />);

    await user.click(screen.getByRole("button", { name: /Finish setup/i }));

    expect(onFinishSetup).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conn-1" }),
    );
  });

  it("shows no Finish setup action without a handler, keeping old callers intact", () => {
    render(<ConnectionsPanel />);

    expect(
      screen.queryByRole("button", { name: /Finish setup/i }),
    ).not.toBeInTheDocument();
  });
});

describe("ConnectionsPanel mutations", () => {
  it("defaults the agent-summary toggle to off for a new connection", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue({
      ...BASE_CONNECTION,
      id: "conn-new",
      webhookSecret: SECRET,
    });

    render(<ConnectionsPanel />);
    await user.click(screen.getByRole("button", { name: /Add source/i }));

    const toggle = screen.getByRole("checkbox", {
      name: /Send the coding agent/i,
    });
    expect(toggle).not.toBeChecked();

    await user.type(screen.getByLabelText("Display name"), "Work GitHub");
    await user.click(screen.getByRole("button", { name: "Connect source" }));

    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ includeAgentSummary: false }),
    );
  });

  it("asks for confirmation before disconnecting a source", async () => {
    const user = userEvent.setup();
    render(<ConnectionsPanel />);

    await user.click(screen.getByRole("button", { name: /Disconnect/i }));

    // Nothing has happened yet — the destructive action is behind a confirmation.
    expect(deleteMutate).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    expect(deleteMutate).toHaveBeenCalledWith("conn-1");
  });

  it("edits an existing connection through the same dialog", async () => {
    const user = userEvent.setup();
    updateMutateAsync.mockResolvedValue(BASE_CONNECTION);

    render(<ConnectionsPanel />);
    await user.click(screen.getByRole("button", { name: /Edit/i }));

    const nameField = screen.getByLabelText("Display name");
    expect(nameField).toHaveValue("Personal GitHub");

    await user.clear(nameField);
    await user.type(nameField, "Renamed");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "conn-1",
        patch: expect.objectContaining({ displayName: "Renamed" }),
      }),
    );
    // Editing never re-issues a secret, so nothing one-time may appear.
    expect(screen.queryByText(/shown once/i)).not.toBeInTheDocument();
  });

  it("offers Both in the edit form and saves it as the mixed kind", async () => {
    const user = userEvent.setup();
    updateMutateAsync.mockResolvedValue(BASE_CONNECTION);

    render(<ConnectionsPanel />);
    await user.click(screen.getByRole("button", { name: /Edit/i }));

    const kindField = screen.getByLabelText("This activity is");
    await user.selectOptions(kindField, "mixed");

    // Mixed is not a softer "work": the employer block stays.
    expect(screen.getByLabelText("Employer")).toBeInTheDocument();
    expect(
      screen.getByText(/the safest rule has to win/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "conn-1",
        patch: expect.objectContaining({ kind: "mixed" }),
      }),
    );
  });
});
