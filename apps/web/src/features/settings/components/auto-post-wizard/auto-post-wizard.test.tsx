import type { GitConnection } from "@repo/schemas";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();
const deleteMutateAsync = vi.fn();
const useConnectionHealth = vi.fn();
const useDigestPreview = vi.fn();

vi.mock("../../lib/connection-queries", () => ({
  useCreateConnection: () => ({
    mutateAsync: createMutateAsync,
    isPending: false,
    reset: vi.fn(),
  }),
  useUpdateConnection: () => ({
    mutateAsync: updateMutateAsync,
    isPending: false,
    reset: vi.fn(),
  }),
  useDeleteConnection: () => ({
    mutateAsync: deleteMutateAsync,
    isPending: false,
    reset: vi.fn(),
  }),
  useConnectionHealth: (id: string | null, options: unknown) =>
    useConnectionHealth(id, options),
  useDigestPreview: (id: string | null, options: unknown) =>
    useDigestPreview(id, options),
}));

vi.mock("../../lib/agent-policy-queries", () => ({
  useWorkExperiencesForPolicy: () => ({ data: [], isLoading: false }),
}));

const tokenMutateAsync = vi.fn();
vi.mock("../../../../lib/token-queries", () => ({
  useCreateToken: () => ({
    mutateAsync: tokenMutateAsync,
    isPending: false,
  }),
}));

const useMyPosts = vi.fn();
vi.mock("../../../../lib/post-queries", () => ({
  useMyPosts: (enabled: boolean, options: unknown) =>
    useMyPosts(enabled, options),
}));

import { AutoPostWizard } from "./auto-post-wizard";

const CREATED_CONNECTION = {
  id: "conn-new",
  userId: "user-1",
  provider: "extractor" as const,
  kind: "personal" as const,
  displayName: "Work laptop — extractor",
  externalAccountId: null,
  workExperienceId: null,
  disclosureLevelOverride: null,
  autoPostEnabled: false,
  cadence: "weekly" as const,
  includeAgentSummary: false,
  lastDigestAt: null,
  createdAt: new Date("2026-08-01"),
  updatedAt: new Date("2026-08-01"),
  webhookSecret: null as string | null,
};

/** An existing claude_code connection, for the "Finish setup" resume path. */
const HOOK_CONNECTION: GitConnection = {
  id: "conn-hook",
  userId: "user-1",
  provider: "claude_code",
  kind: "personal",
  displayName: "Work laptop — Claude Code",
  externalAccountId: null,
  workExperienceId: null,
  disclosureLevelOverride: null,
  autoPostEnabled: false,
  cadence: "weekly",
  includeAgentSummary: false,
  lastDigestAt: null,
  createdAt: new Date("2026-08-01"),
  updatedAt: new Date("2026-08-01"),
};

const HEALTH_EMPTY = {
  connectionId: "conn-hook",
  totalEvents: 0,
  lastEventOn: null,
  eventsLast7Days: 0,
  distinctReposLast30Days: 0,
  lastDigestAt: null,
  nextDigestDueAt: null,
};

const HEALTH_ACTIVE = {
  ...HEALTH_EMPTY,
  totalEvents: 3,
  lastEventOn: "2026-08-14",
  eventsLast7Days: 3,
  distinctReposLast30Days: 2,
};

beforeEach(() => {
  window.sessionStorage.clear();
  useConnectionHealth.mockReturnValue({ data: undefined, isError: false });
  useDigestPreview.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  });
  useMyPosts.mockReturnValue({ data: [], isLoading: false, isError: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderWizard(
  props: Partial<React.ComponentProps<typeof AutoPostWizard>> = {},
) {
  return render(
    <AutoPostWizard open onOpenChange={vi.fn()} {...props} />,
  );
}

/** Walks a resumed claude_code wizard (opens at Verify) forward to `target`. */
async function resumeAndAdvanceTo(
  user: ReturnType<typeof userEvent.setup>,
  target: "preview" | "schedule",
) {
  useConnectionHealth.mockReturnValue({ data: HEALTH_ACTIVE, isError: false });
  const view = renderWizard({ resumeConnection: HOOK_CONNECTION });

  await user.click(screen.getByRole("button", { name: "Continue" }));
  if (target === "schedule") {
    await user.click(screen.getByRole("button", { name: "Next" }));
  }
  return view;
}

describe("AutoPostWizard source step", () => {
  it("shows all four source cards with the MCP card recommended", () => {
    renderWizard();

    const group = screen.getByRole("group", { name: "Activity source" });
    expect(
      within(group).getByRole("button", { name: /Coding agent \(MCP\)/ }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("button", { name: /Claude Code background hook/ }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("button", { name: /Local extractor CLI/ }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("button", { name: /GitHub \/ GitLab webhooks/ }),
    ).toBeInTheDocument();

    expect(within(group).getByText("Recommended")).toBeInTheDocument();
    // Phone users may browse the whole wizard; the chip says where setup ends.
    expect(
      within(group).getAllByText("Needs your dev machine for setup").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("prefills a sensible display name per source, following the kind selection", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(
      screen.getByRole("button", { name: /Local extractor CLI/ }),
    );
    // Kind defaults to personal, and the prefill must agree with it.
    expect(screen.getByLabelText("Display name")).toHaveValue(
      "Personal laptop — extractor",
    );

    // Switching kind re-prefills the untouched name.
    await user.click(screen.getByRole("button", { name: "Work" }));
    expect(screen.getByLabelText("Display name")).toHaveValue(
      "Work laptop — extractor",
    );

    await user.click(
      screen.getByRole("button", { name: /GitHub \/ GitLab webhooks/ }),
    );
    expect(screen.getByLabelText("Display name")).toHaveValue(
      "My GitHub repos",
    );
  });

  it("never clobbers a name the user typed when kind changes", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(
      screen.getByRole("button", { name: /Local extractor CLI/ }),
    );
    const input = screen.getByLabelText("Display name");
    await user.clear(input);
    await user.type(input, "My own name");

    await user.click(screen.getByRole("button", { name: "Work" }));
    expect(input).toHaveValue("My own name");
  });

  it("asks MCP for no kind and no name — it creates no connection to carry them", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(
      screen.getByRole("button", { name: /Coding agent \(MCP\)/ }),
    );

    expect(
      screen.queryByRole("group", { name: "Activity kind" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
    // The explanation stays: it is the reason the controls are absent.
    expect(
      screen.getByText(/MCP needs no connection on LinkHub's side/),
    ).toBeInTheDocument();
  });

  it("offers Both for a machine that holds personal and work repos", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(
      screen.getByRole("button", { name: /Local extractor CLI/ }),
    );

    const kinds = screen.getByRole("group", { name: "Activity kind" });
    expect(within(kinds).getByRole("button", { name: "Both" })).toBeInTheDocument();
    expect(
      screen.getByText(
        /Both — one machine that holds personal side projects and work repos\./,
      ),
    ).toBeInTheDocument();

    await user.click(within(kinds).getByRole("button", { name: "Both" }));

    // Mixed keeps the employer machinery, and says why.
    expect(screen.getByLabelText("Employer")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Mixed activity is held to your work disclosure rules — once the numbers are added together, the safest rule has to win\./,
      ),
    ).toBeInTheDocument();
    // The prefill follows the choice without claiming which laptop this is.
    expect(screen.getByLabelText("Display name")).toHaveValue(
      "This machine — extractor",
    );
  });

  it("creates a mixed connection with the employer attached", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue({
      ...CREATED_CONNECTION,
      kind: "mixed" as const,
    });
    renderWizard();

    await user.click(
      screen.getByRole("button", { name: /Claude Code background hook/ }),
    );
    await user.click(screen.getByRole("button", { name: "Both" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "claude_code",
        kind: "mixed",
        displayName: "This machine — Claude Code",
      }),
    );
  });

  it("requires a display name before creating anything", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(
      screen.getByRole("button", { name: /Local extractor CLI/ }),
    );
    await user.clear(screen.getByLabelText("Display name"));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(createMutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getByText(/give this source a name/i),
    ).toBeInTheDocument();
  });
});

describe("AutoPostWizard extractor path", () => {
  it("creates the connection once, and never again on Back → Next", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue(CREATED_CONNECTION);
    renderWizard();

    await user.click(
      screen.getByRole("button", { name: /Local extractor CLI/ }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(createMutateAsync).toHaveBeenCalledWith({
      provider: "extractor",
      kind: "personal",
      displayName: "Personal laptop — extractor",
      workExperienceId: null,
      autoPostEnabled: false,
      cadence: "weekly",
      includeAgentSummary: false,
    });

    // The connect step carries the REAL connection id, not a placeholder.
    const config = await screen.findByText(/"connectionId": "conn-new"/);
    expect(config).toBeInTheDocument();

    // Back to Source, forward again: no duplicate connection, and nothing to
    // PATCH when nothing was edited.
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it("PATCHes edits made on the way Back into the reused connection", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue(CREATED_CONNECTION);
    updateMutateAsync.mockResolvedValue({});
    renderWizard();

    await user.click(
      screen.getByRole("button", { name: /Local extractor CLI/ }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(createMutateAsync).toHaveBeenCalledTimes(1);

    // Back, flip personal → work: the reused connection must be re-classified,
    // not silently kept personal — that classification is what the disclosure
    // policy hangs off.
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(updateMutateAsync).toHaveBeenCalledWith({
      connectionId: "conn-new",
      patch: expect.objectContaining({ kind: "work" }),
    });
  });

  it("deletes the abandoned connection when the provider changes after a create", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue(CREATED_CONNECTION);
    deleteMutateAsync.mockResolvedValue({ success: true });
    renderWizard();

    await user.click(
      screen.getByRole("button", { name: /Local extractor CLI/ }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(createMutateAsync).toHaveBeenCalledTimes(1);

    // Back, pick a different provider: the first connection would otherwise be
    // orphaned and its stashed one-time secret overwritten.
    await user.click(screen.getByRole("button", { name: "Back" }));
    createMutateAsync.mockResolvedValue({
      ...CREATED_CONNECTION,
      id: "conn-hook-new",
      provider: "claude_code" as const,
    });
    await user.click(
      screen.getByRole("button", { name: /Claude Code background hook/ }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(deleteMutateAsync).toHaveBeenCalledWith("conn-new");
    expect(createMutateAsync).toHaveBeenCalledTimes(2);
    expect(createMutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ provider: "claude_code" }),
    );
  });

  it("explains a 409 as an already-existing source instead of a generic failure", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409 },
    });
    renderWizard();

    await user.click(
      screen.getByRole("button", { name: /Local extractor CLI/ }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(
      screen.getByText(
        /already have a Local extractor \(Personal\) source\. Use Finish setup/,
      ),
    ).toBeInTheDocument();
  });

  it("shows the review-first extract flow and an inline activity:write token affordance", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue(CREATED_CONNECTION);
    tokenMutateAsync.mockResolvedValue({
      id: "tok-1",
      name: "Work laptop — extractor extractor",
      tokenPrefix: "lh_pat_new",
      scopes: ["activity:write"],
      expiresAt: null,
      lastUsedAt: null,
      createdAt: new Date("2026-08-01"),
      revokedAt: null,
      token: "lh_pat_ONE_TIME_PLAINTEXT",
    });
    // The dialog renders in a Radix portal, so query from the document root.
    const { baseElement } = renderWizard();

    await user.click(
      screen.getByRole("button", { name: /Local extractor CLI/ }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));

    const codeText = () =>
      Array.from(baseElement.querySelectorAll("pre"))
        .map((el) => el.textContent ?? "")
        .join("\n");

    // The CLI is an installed tool — never "clone the repository".
    expect(codeText()).toContain("npx linkhub-extract ~/path/to/repo");
    expect(codeText()).toContain(
      "npx linkhub-extract upload linkhub-activity.json",
    );
    expect(codeText()).not.toContain("git clone");
    expect(
      screen.getAllByText(/STOPS for your review/i).length,
    ).toBeGreaterThan(0);

    // The cron shortcut exists but carries the --yes caution.
    expect(codeText()).toContain("0 18 * * 5 npx linkhub-extract --yes");
    expect(
      screen.getByText(/--yes skips the review step/i),
    ).toBeInTheDocument();

    // Inline token creation with the activity:write scope, shown once.
    await user.click(screen.getByRole("button", { name: "Create token" }));
    expect(tokenMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: ["activity:write"] }),
    );
    expect(
      await screen.findByText(/shown once and never again/i),
    ).toBeInTheDocument();
    // The export line now carries the real plaintext.
    expect(codeText()).toContain(
      "export LINKHUB_API_TOKEN=lh_pat_ONE_TIME_PLAINTEXT",
    );
    // Stashed like the settings page's own dialog does, so closing the wizard
    // (Escape, backdrop) cannot destroy the only copy of the plaintext.
    expect(
      window.sessionStorage.getItem("linkhub:last-created-token"),
    ).toContain("lh_pat_ONE_TIME_PLAINTEXT");
  });
});

describe("AutoPostWizard forge path", () => {
  it("shows the one-time webhook secret with the amber shown-once treatment", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue({
      ...CREATED_CONNECTION,
      provider: "github" as const,
      displayName: "My GitHub repos",
      webhookSecret: "whsec_shown_once_1234",
    });
    renderWizard();

    await user.click(
      screen.getByRole("button", { name: /GitHub \/ GitLab webhooks/ }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "github" }),
    );
    expect(
      await screen.findByText(/shown once and can never be retrieved/i),
    ).toBeInTheDocument();
    expect(screen.getByText("whsec_shown_once_1234")).toBeInTheDocument();
    // The forge steps travel with the secret.
    expect(
      screen.getByText(/Content type: application\/json/),
    ).toBeInTheDocument();
  });

  it("creates a gitlab connection when the segmented control says so", async () => {
    const user = userEvent.setup();
    createMutateAsync.mockResolvedValue({
      ...CREATED_CONNECTION,
      provider: "gitlab" as const,
      webhookSecret: "whsec_gl",
    });
    renderWizard();

    await user.click(
      screen.getByRole("button", { name: /GitHub \/ GitLab webhooks/ }),
    );
    await user.click(
      within(screen.getByRole("group", { name: "Forge" })).getByRole(
        "button",
        { name: "GitLab" },
      ),
    );
    // Switching the forge re-prefills the untouched name.
    expect(screen.getByLabelText("Display name")).toHaveValue(
      "My GitLab projects",
    );
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "gitlab" }),
    );
  });
});

describe("AutoPostWizard verify step", () => {
  it("resumes an existing connection straight into Verify and polls its health", () => {
    renderWizard({ resumeConnection: HOOK_CONNECTION });

    expect(
      screen.getByText(/Listening for first activity/),
    ).toBeInTheDocument();
    expect(useConnectionHealth).toHaveBeenCalledWith(
      "conn-hook",
      expect.objectContaining({ enabled: true, refetchInterval: 5000 }),
    );
    // Never a dead end: skipping is always on offer while listening.
    expect(
      screen.getByRole("button", { name: "Skip for now" }),
    ).toBeInTheDocument();
  });

  it("flips to success the moment health reports events", () => {
    useConnectionHealth.mockReturnValue({
      data: HEALTH_EMPTY,
      isError: false,
    });
    const view = renderWizard({ resumeConnection: HOOK_CONNECTION });
    expect(
      screen.getByText(/Listening for first activity/),
    ).toBeInTheDocument();

    useConnectionHealth.mockReturnValue({
      data: HEALTH_ACTIVE,
      isError: false,
    });
    view.rerender(
      <AutoPostWizard
        open
        onOpenChange={vi.fn()}
        resumeConnection={HOOK_CONNECTION}
      />,
    );

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(
      screen.getByText(/3 events received from 2 repos \(fingerprints only\)/),
    ).toBeInTheDocument();
    // The skip affordance yields to a real Continue.
    expect(
      screen.queryByRole("button", { name: "Skip for now" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue" }),
    ).toBeInTheDocument();
  });

  it("shows per-source recovery guidance after a minute of silence", () => {
    vi.useFakeTimers();
    try {
      renderWizard({ resumeConnection: HOOK_CONNECTION });
      expect(
        screen.queryByText(/Nothing yet — that's normal/),
      ).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(61_000);
      });

      // The hook-specific guidance, not a generic "still waiting".
      const recovery = screen.getByText(/Nothing yet — that's normal/);
      expect(recovery.parentElement?.textContent).toContain(
        "the hook fires when a session ends",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("AutoPostWizard preview step", () => {
  it("renders a ready preview as a real post card with the no-AI caption", async () => {
    const user = userEvent.setup();
    useDigestPreview.mockReturnValue({
      data: {
        status: "ready",
        post: {
          title: "This week in 2 repos",
          body: "Merged **3 pull requests** across 2 repositories.",
          tags: ["digest"],
        },
        window: { from: "2026-08-08", to: "2026-08-14" },
        eventCount: 3,
      },
      isLoading: false,
      isError: false,
    });
    await resumeAndAdvanceTo(user, "preview");

    expect(screen.getByText("This week in 2 repos")).toBeInTheDocument();
    // Markdown-rendered, not raw.
    expect(screen.getByText("3 pull requests").tagName).toBe("STRONG");
    expect(screen.getByText("#digest")).toBeInTheDocument();
    expect(
      screen.getByText(/no AI, byte-reproducible, nothing here names a repo/i),
    ).toBeInTheDocument();
  });

  it("explains no_activity as silence over filler and still allows continuing", async () => {
    const user = userEvent.setup();
    useDigestPreview.mockReturnValue({
      data: {
        status: "no_activity",
        post: null,
        window: { from: "2026-08-08", to: "2026-08-14" },
        eventCount: 0,
      },
      isLoading: false,
      isError: false,
    });
    await resumeAndAdvanceTo(user, "preview");

    expect(
      screen.getByText(/silence over filler/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("spells out what qualifies when evidence is insufficient", async () => {
    const user = userEvent.setup();
    useDigestPreview.mockReturnValue({
      data: {
        status: "insufficient_evidence",
        post: null,
        window: { from: "2026-08-08", to: "2026-08-14" },
        eventCount: 2,
      },
      isLoading: false,
      isError: false,
    });
    await resumeAndAdvanceTo(user, "preview");

    expect(
      screen.getByText(
        /merged pull requests, submitted reviews and releases qualify/i,
      ),
    ).toBeInTheDocument();
  });
});

describe("AutoPostWizard schedule step", () => {
  it("persists cadence and auto-post via the update mutation, then shows the checklist", async () => {
    const user = userEvent.setup();
    updateMutateAsync.mockResolvedValue({});
    useDigestPreview.mockReturnValue({
      data: {
        status: "no_activity",
        post: null,
        window: { from: "2026-08-08", to: "2026-08-14" },
        eventCount: 0,
      },
      isLoading: false,
      isError: false,
    });
    await resumeAndAdvanceTo(user, "schedule");

    // Weekly is the default and the stated goal.
    expect(
      screen.getByRole("button", { name: "Weekly", pressed: true }),
    ).toBeInTheDocument();
    expect(screen.getByText(/the goal: one post a week/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Every two weeks" }),
    );
    expect(
      screen.getByText(/pair two machines or accounts to alternate/i),
    ).toBeInTheDocument();

    // Auto-post defaults OFF, with the existing consequence copy.
    const autoPost = screen.getByRole("checkbox", {
      name: /post digests automatically/i,
    });
    expect(autoPost).not.toBeChecked();
    expect(
      screen.getByText(/wait for you to approve them/i),
    ).toBeInTheDocument();

    // claude_code is the one source with an agent summary to (not) send.
    expect(
      screen.getByRole("checkbox", {
        name: /send the coding agent.s own description/i,
      }),
    ).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(updateMutateAsync).toHaveBeenCalledWith({
      connectionId: "conn-hook",
      patch: {
        cadence: "biweekly",
        autoPostEnabled: false,
        includeAgentSummary: false,
      },
    });

    // Success checklist.
    expect(await screen.findByText("Source connected")).toBeInTheDocument();
    expect(screen.getByText("First data received")).toBeInTheDocument();
    expect(screen.getByText("Preview seen")).toBeInTheDocument();
    expect(screen.getByText("Schedule set")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add another source/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("never PATCHes the weekly coercion back onto a resumed off connection", async () => {
    const user = userEvent.setup();
    updateMutateAsync.mockResolvedValue({});
    useConnectionHealth.mockReturnValue({ data: HEALTH_ACTIVE, isError: false });
    renderWizard({
      resumeConnection: { ...HOOK_CONNECTION, cadence: "off" },
    });

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    // The UI shows Weekly only because it has no Off option — Finish without
    // touching the control must leave the deliberate "off" alone.
    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(updateMutateAsync).toHaveBeenCalledWith({
      connectionId: "conn-hook",
      patch: { autoPostEnabled: false, includeAgentSummary: false },
    });
  });

  it("PATCHes cadence for a resumed off connection once the user picks one", async () => {
    const user = userEvent.setup();
    updateMutateAsync.mockResolvedValue({});
    useConnectionHealth.mockReturnValue({ data: HEALTH_ACTIVE, isError: false });
    renderWizard({
      resumeConnection: { ...HOOK_CONNECTION, cadence: "off" },
    });

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Monthly" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(updateMutateAsync).toHaveBeenCalledWith({
      connectionId: "conn-hook",
      patch: expect.objectContaining({ cadence: "monthly" }),
    });
  });
});

describe("AutoPostWizard MCP path", () => {
  it("creates no connection, reuses the host tabs, and watches for the agent's post", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(
      screen.getByRole("button", { name: /Coding agent \(MCP\)/ }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));

    // No LinkHub-side connection for MCP — the agent posts with its token.
    expect(createMutateAsync).not.toHaveBeenCalled();

    // The exact host tabs from the manual panel, plus the generic MCP one.
    const tablist = screen.getByRole("tablist", { name: "AI tool" });
    expect(
      within(tablist).getByRole("tab", { name: "Claude Code" }),
    ).toBeInTheDocument();
    expect(
      within(tablist).getByRole("tab", { name: "Windsurf / Kiro / Codex" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));

    // Verify instructs the one action that proves the loop end-to-end.
    expect(
      screen.getByText(/mcp__linkhub__weekly_update/i),
    ).toBeInTheDocument();
    expect(useMyPosts).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ refetchInterval: 5000 }),
    );
  });

  it("offers a repo roster so the agent covers every project, not just the current one", async () => {
    const user = userEvent.setup();
    const { baseElement } = renderWizard();

    await user.click(
      screen.getByRole("button", { name: /Coding agent \(MCP\)/ }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));

    const block = screen
      .getByText(/Cover every project, not just the one you're in/)
      .closest("details");
    expect(block).not.toBeNull();
    // A refinement, not a prerequisite: collapsed, below the real config.
    expect(block).not.toHaveAttribute("open");
    expect(
      within(block as HTMLElement).getByText(
        /Without this, the agent only summarizes the repository it is currently in\./,
      ),
    ).toBeInTheDocument();

    const codeText = Array.from(baseElement.querySelectorAll("pre"))
      .map((el) => el.textContent ?? "")
      .join("\n");
    expect(codeText).toContain('"/home/you/work/payments-api"');
    expect(codeText).toContain("> ~/.linkhub/repos.json");
    // The file the agent reads, named where the user has to create it.
    expect(
      within(block as HTMLElement).getByText("~/.linkhub/repos.json"),
    ).toBeInTheDocument();
  });

  it("flips verify only for a post that was not in the first snapshot, ignoring clock skew", async () => {
    const user = userEvent.setup();

    const makePost = (id: string, title: string, createdAt: Date) => ({
      id,
      title,
      body: "This week...",
      tags: null,
      status: "pending_review",
      source: "mcp",
      metadata: null,
      coverImageUrl: null,
      externalUrl: null,
      publishedAt: null,
      createdAt,
      updatedAt: createdAt,
    });

    // A pre-existing post whose server timestamp is AHEAD of the client clock
    // — the wall-clock comparison this replaced would have counted it.
    const skewedOldPost = makePost(
      "post-old",
      "An old post from a fast server clock",
      new Date(Date.now() + 60_000),
    );
    useMyPosts.mockReturnValue({
      data: [skewedOldPost],
      isLoading: false,
      isError: false,
    });

    const view = renderWizard();
    await user.click(
      screen.getByRole("button", { name: /Coding agent \(MCP\)/ }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // The baseline snapshot: still listening, the old post does not count.
    expect(
      screen.getByText(/Listening for first activity/),
    ).toBeInTheDocument();

    useMyPosts.mockReturnValue({
      data: [
        skewedOldPost,
        makePost(
          "post-agent",
          "Shipped the auto-post wizard",
          // BEHIND the client clock — a slow server clock must not hide it.
          new Date(Date.now() - 60_000),
        ),
      ],
      isLoading: false,
      isError: false,
    });
    view.rerender(<AutoPostWizard open onOpenChange={vi.fn()} />);

    expect(
      await screen.findByText("Shipped the auto-post wizard"),
    ).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("offers a cadence and per-tool automation guidance, and saves nothing", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(
      screen.getByRole("button", { name: /Coding agent \(MCP\)/ }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    // Pick a host on the Connect step: the Schedule step must open on the
    // SAME tool rather than asking which one again.
    await user.click(screen.getByRole("tab", { name: "Cursor" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Weekly is the floor for every source type, MCP included.
    expect(
      screen.getByRole("button", { name: "Weekly", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Daily" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cursor", pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Cursor Automations — only for a hosted setup/i),
    ).toBeInTheDocument();

    // Switching tool switches guidance, with a runnable command.
    await user.click(screen.getByRole("button", { name: "Claude Code" }));
    expect(
      screen.getByText(/Routines in the Claude Code Desktop app/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/claude -p .*--allowedTools "mcp__linkhub"/),
    ).toBeInTheDocument();

    // The chat app has no scheduler of its own; the wizard points at the one
    // that can reach a local server, and gives the by-hand ritual as fallback.
    await user.click(screen.getByRole("button", { name: "Claude Desktop" }));
    expect(
      screen.getByText(/schedule it from Claude Code Desktop/i),
    ).toBeInTheDocument();
    // Twice over: the Claude Desktop path and the universal fallback list.
    expect(
      screen.getAllByText(/\+ menu → linkhub → weekly_update/).length,
    ).toBeGreaterThan(0);

    // Duplicate safety is what makes an over-firing scheduler harmless.
    expect(
      screen.getByText(/duplicate-safe/i),
    ).toBeInTheDocument();

    // MCP has no connection, so finishing must not PATCH anything.
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(updateMutateAsync).not.toHaveBeenCalled();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });
});
