import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithTokens = vi.fn();

vi.mock("../../../lib/auth-api", () => ({
  fetchWithTokens: (path: string, config: unknown) =>
    fetchWithTokens(path, config),
}));

import {
  createConnection,
  fetchConnectionHealth,
  fetchDigestPreview,
  fetchMyConnections,
  updateConnection,
} from "./connection-queries";

const ROW = {
  id: "b0d0f6e0-6a3b-4d05-9d4e-6b0a35f2c8a1",
  userId: "user-1",
  provider: "github",
  kind: "work",
  displayName: "Work GitHub",
  externalAccountId: "ada",
  workExperienceId: "9f1d0f6e-6a3b-4d05-9d4e-6b0a35f2c8a1",
  disclosureLevelOverride: null,
  autoPostEnabled: false,
  cadence: "weekly",
  includeAgentSummary: false,
  lastDigestAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  fetchWithTokens.mockReset();
});

describe("fetchMyConnections", () => {
  /**
   * The read model omits `webhookSecret` deliberately, and zod strips unknown
   * keys — so even a server that regressed and echoed a secret on a list call
   * could not put one on screen.
   */
  it("drops a webhookSecret that appears on a read path", async () => {
    fetchWithTokens.mockResolvedValue({
      data: [{ ...ROW, webhookSecret: "whsec_leaked" }],
    });

    const [connection] = await fetchMyConnections();

    expect(connection).not.toHaveProperty("webhookSecret");
    expect(JSON.stringify(connection)).not.toContain("whsec_leaked");
    // Dates are coerced, not left as the wire's strings.
    expect(connection?.createdAt).toBeInstanceOf(Date);
  });
});

describe("createConnection", () => {
  it("carries the one-time plaintext secret off the create response", async () => {
    fetchWithTokens.mockResolvedValue({
      data: { ...ROW, webhookSecret: "whsec_shown_once" },
    });

    const result = await createConnection({
      provider: "github",
      kind: "work",
      displayName: "Work GitHub",
      autoPostEnabled: false,
      cadence: "weekly",
      includeAgentSummary: false,
    });

    expect(result.webhookSecret).toBe("whsec_shown_once");
    expect(fetchWithTokens).toHaveBeenCalledWith(
      "/me/connections",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reports null rather than undefined for a provider with no signed webhook", async () => {
    fetchWithTokens.mockResolvedValue({
      data: { ...ROW, provider: "claude_code", webhookSecret: null },
    });

    const result = await createConnection({
      provider: "claude_code",
      kind: "personal",
      displayName: "Laptop agent",
      autoPostEnabled: false,
      cadence: "weekly",
      includeAgentSummary: false,
    });

    expect(result.webhookSecret).toBeNull();
  });
});

describe("updateConnection", () => {
  it("PATCHes only the fields it was given", async () => {
    fetchWithTokens.mockResolvedValue({ data: ROW });

    await updateConnection(ROW.id, { autoPostEnabled: true });

    expect(fetchWithTokens).toHaveBeenCalledWith(
      `/me/connections/${ROW.id}`,
      expect.objectContaining({
        method: "PATCH",
        data: { autoPostEnabled: true },
      }),
    );
  });
});

describe("fetchConnectionHealth", () => {
  it("parses the health read model, coercing digest dates", async () => {
    fetchWithTokens.mockResolvedValue({
      data: {
        connectionId: ROW.id,
        totalEvents: 12,
        lastEventOn: "2026-08-14",
        eventsLast7Days: 5,
        distinctReposLast30Days: 3,
        lastDigestAt: "2026-08-08T00:00:00.000Z",
        nextDigestDueAt: null,
      },
    });

    const health = await fetchConnectionHealth(ROW.id);

    expect(fetchWithTokens).toHaveBeenCalledWith(
      `/me/connections/${ROW.id}/health`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(health.totalEvents).toBe(12);
    // `lastEventOn` stays a plain YYYY-MM-DD; digest timestamps become Dates.
    expect(health.lastEventOn).toBe("2026-08-14");
    expect(health.lastDigestAt).toBeInstanceOf(Date);
    expect(health.nextDigestDueAt).toBeNull();
  });

  it("rejects a response that fails the schema instead of rendering it", async () => {
    fetchWithTokens.mockResolvedValue({
      data: { connectionId: ROW.id, totalEvents: -1 },
    });

    await expect(fetchConnectionHealth(ROW.id)).rejects.toThrow();
  });
});

describe("fetchDigestPreview", () => {
  it("parses a ready preview with its post and window", async () => {
    fetchWithTokens.mockResolvedValue({
      data: {
        status: "ready",
        post: { title: "This week", body: "Merged 3 PRs.", tags: ["digest"] },
        window: { from: "2026-08-08", to: "2026-08-14" },
        eventCount: 3,
      },
    });

    const preview = await fetchDigestPreview(ROW.id);

    expect(fetchWithTokens).toHaveBeenCalledWith(
      `/me/connections/${ROW.id}/digest-preview`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(preview.status).toBe("ready");
    expect(preview.post?.title).toBe("This week");
  });

  it("accepts the two empty statuses with a null post", async () => {
    fetchWithTokens.mockResolvedValue({
      data: {
        status: "no_activity",
        post: null,
        window: { from: "2026-08-08", to: "2026-08-14" },
        eventCount: 0,
      },
    });

    const preview = await fetchDigestPreview(ROW.id);

    expect(preview.status).toBe("no_activity");
    expect(preview.post).toBeNull();
  });
});
