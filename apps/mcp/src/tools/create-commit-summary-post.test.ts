import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createPostSchemaInput, type CreatePostInput } from "@repo/schemas";
import type { LinkHubApiClient } from "../api-client.js";
import { LinkHubApiError } from "../api-client.js";
import type { DisclosureContext } from "../disclosure.js";
import { levelInfo } from "../disclosure.js";
import { registerCreateCommitSummaryPost } from "./create-commit-summary-post.js";

/**
 * CHARACTERIZATION SUITE for the tool an autonomous coding agent calls
 * unattended. Assertions record today's behaviour; the ones that record a
 * WRONG behaviour say so.
 */

interface CapturedTool {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

function captureTool(
  client: Partial<LinkHubApiClient>,
  level: DisclosureContext["level"] = "summary",
): CapturedTool {
  const captured: CapturedTool[] = [];
  const fakeServer = {
    registerTool(
      name: string,
      config: { description: string; inputSchema: z.ZodRawShape },
      handler: unknown,
    ) {
      captured.push({
        name,
        description: config.description,
        inputSchema: config.inputSchema,
        handler: handler as CapturedTool["handler"],
      });
    },
  };

  registerCreateCommitSummaryPost(
    fakeServer as unknown as McpServer,
    client as LinkHubApiClient,
    {
      level,
      info: levelInfo(level),
      blockedTerms: [],
      degraded: false,
    },
  );

  const tool = captured[0];
  if (!tool) throw new Error("create_commit_summary_post was not registered");
  return tool;
}

function fakePost(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    source: "commit",
    title: "A title",
    body: "A body",
    coverImageUrl: null,
    images: null,
    tags: null,
    status: "published",
    externalUrl: null,
    metadata: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    publishedAt: null,
    ...overrides,
  };
}

/** Drives the tool exactly as the MCP SDK does: parse args, then call. */
async function callTool(
  tool: CapturedTool,
  raw: Record<string, unknown>,
): Promise<CallToolResult> {
  return tool.handler(z.object(tool.inputSchema).parse(raw));
}

function capturingClient(): {
  client: Partial<LinkHubApiClient>;
  calls: CreatePostInput[];
} {
  const calls: CreatePostInput[] = [];
  return {
    calls,
    client: {
      createPost: async (body: CreatePostInput) => {
        calls.push(body);
        return fakePost();
      },
    },
  };
}

function textOf(result: CallToolResult): string {
  return result.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

describe("create_commit_summary_post — input schema", () => {
  const shape = () => z.object(captureTool({}).inputSchema);

  it("requires only `summary`", () => {
    expect(shape().safeParse({ summary: "I shipped X." }).success).toBe(true);
    expect(shape().safeParse({}).success).toBe(false);
  });

  it("rejects an empty summary", () => {
    expect(shape().safeParse({ summary: "" }).success).toBe(false);
  });

  it("rejects a non-string summary", () => {
    expect(shape().safeParse({ summary: 7 }).success).toBe(false);
    expect(shape().safeParse({ summary: null }).success).toBe(false);
  });

  it("requires commitCount to be a non-negative integer", () => {
    expect(shape().safeParse({ summary: "s", commitCount: 0 }).success).toBe(
      true,
    );
    expect(shape().safeParse({ summary: "s", commitCount: -1 }).success).toBe(
      false,
    );
    expect(shape().safeParse({ summary: "s", commitCount: 1.5 }).success).toBe(
      false,
    );
    expect(shape().safeParse({ summary: "s", commitCount: "3" }).success).toBe(
      false,
    );
  });

  it("rejects an empty title but allows the key to be absent", () => {
    expect(shape().safeParse({ summary: "s", title: "" }).success).toBe(false);
    expect(shape().safeParse({ summary: "s" }).success).toBe(true);
  });

  it("silently drops an unexpected extra field", () => {
    expect(shape().parse({ summary: "s", branch: "main" })).toEqual({
      summary: "s",
    });
  });

  it("accepts only the three known statuses", () => {
    expect(shape().safeParse({ summary: "s", status: "draft" }).success).toBe(
      true,
    );
    expect(
      shape().safeParse({ summary: "s", status: "pending_review" }).success,
    ).toBe(true);
    expect(shape().safeParse({ summary: "s", status: "public" }).success).toBe(
      false,
    );
  });

  it("puts NO constraint whatever on `repo` — a path, a remote URL or 500 chars all pass", () => {
    // CHARACTERIZATION: the description says "name only, never a path or remote
    // URL", but nothing enforces it. See the leak test below for why this
    // matters.
    for (const repo of [
      "linkhub-v.1",
      "/home/gabriel/clients/acme-payments",
      "git@github.com:acme-internal/billing.git",
      "@acme-internal/billing-service",
      "x".repeat(500),
    ]) {
      expect(shape().safeParse({ summary: "s", repo }).success).toBe(true);
    }
  });

  it("accepts a 25 000-char summary the shared contract caps at 20 000", () => {
    const summary = "x".repeat(25_000);
    // CHARACTERIZATION: the local shape has drifted from createPostSchemaInput
    // (which caps `body` at 20 000). The api rejects what this accepts.
    expect(shape().safeParse({ summary }).success).toBe(true);
    expect(
      createPostSchemaInput.safeParse({ body: summary, source: "commit" })
        .success,
    ).toBe(false);
  });

  it("accepts a `repo` longer than the 500-char metadata value cap", () => {
    const repo = "r".repeat(600);
    expect(shape().safeParse({ summary: "s", repo }).success).toBe(true);
    expect(
      createPostSchemaInput.safeParse({
        body: "s",
        source: "commit",
        metadata: { repo },
      }).success,
    ).toBe(false);
  });
});

describe("create_commit_summary_post — what reaches the published post", () => {
  it("publishes `summary` VERBATIM as the body — it adds, prefixes and appends nothing", async () => {
    const { client, calls } = capturingClient();
    const tool = captureTool(client);
    const summary = "I shipped a resume importer this week.";

    await callTool(tool, {
      summary,
      repo: "acme-payments",
      commitCount: 42,
      period: "weekly",
    });

    expect(calls[0]?.body).toBe(summary);
  });

  it("no repo-derived value leaks into the BODY when the caller passes a title", async () => {
    const { client, calls } = capturingClient();
    const tool = captureTool(client);

    await callTool(tool, {
      summary: "Shipped background jobs and cut p95 latency.",
      repo: "git@github.com:acme-internal/billing.git",
      period: "weekly",
      title: "Faster background jobs",
    });

    expect(calls[0]?.body).not.toContain("acme-internal");
    expect(calls[0]?.title).toBe("Faster background jobs");
  });

  it("LEAK: with `title` omitted, the repo string becomes the published post TITLE", async () => {
    const { client, calls } = capturingClient();
    const tool = captureTool(client);

    await callTool(tool, {
      summary: "Shipped background jobs and cut p95 latency.",
      repo: "acme-payments-core",
      period: "weekly",
    });

    // CHARACTERIZATION: this is today's behaviour and it is WRONG — see
    // deriveTitle(). The same tool's description promises "repository names,
    // paths and remotes never appear in a post", yet with `title` omitted the
    // caller-supplied `repo` is interpolated straight into `post.title`, which
    // IS served on the public profile (publicPostSchema keeps `title`; it only
    // omits `metadata`). This is a different path from the already-rejected
    // CAND-0103, which was about the metadata bag.
    expect(calls[0]?.title).toBe("acme-payments-core — weekly update");
  });

  it("LEAK: a full git remote URL passed as `repo` is published as the title unchanged", async () => {
    const { client, calls } = capturingClient();
    const tool = captureTool(client);

    await callTool(tool, {
      summary: "Shipped invoicing.",
      repo: "git@github.com:acme-internal/billing.git",
    });

    // CHARACTERIZATION: today's behaviour, and wrong for the same reason.
    expect(calls[0]?.title).toBe(
      "git@github.com:acme-internal/billing.git update",
    );
  });

  it("derives 'Project update' when neither repo nor period is given", async () => {
    const { client, calls } = capturingClient();
    const tool = captureTool(client);
    await callTool(tool, { summary: "s" });
    expect(calls[0]?.title).toBe("Project update");
  });

  it("derives 'Project — weekly update' from a period alone", async () => {
    const { client, calls } = capturingClient();
    const tool = captureTool(client);
    await callTool(tool, { summary: "s", period: "weekly" });
    expect(calls[0]?.title).toBe("Project — weekly update");
  });

  it("interpolates an aggregate scope marker verbatim, as intended", async () => {
    const { client, calls } = capturingClient();
    const tool = captureTool(client);
    await callTool(tool, { summary: "s", repo: "4 repositories", period: "weekly" });
    expect(calls[0]?.title).toBe("4 repositories — weekly update");
  });

  it("an explicit title always wins over the derived one", async () => {
    const { client, calls } = capturingClient();
    const tool = captureTool(client);
    await callTool(tool, { summary: "s", repo: "acme", title: "Ship log" });
    expect(calls[0]?.title).toBe("Ship log");
  });
});

describe("create_commit_summary_post — metadata and defaults", () => {
  it("stores exactly repo/commitCount/period as metadata, and source='commit'", async () => {
    const { client, calls } = capturingClient();
    const tool = captureTool(client);

    await callTool(tool, {
      summary: "s",
      repo: "linkhub-v.1",
      commitCount: 12,
      period: "2026-07-01..2026-07-07",
      tags: ["changelog"],
      status: "pending_review",
    });

    expect(calls[0]).toEqual({
      source: "commit",
      title: "linkhub-v.1 — 2026-07-01..2026-07-07 update",
      body: "s",
      tags: ["changelog"],
      status: "pending_review",
      metadata: {
        repo: "linkhub-v.1",
        commitCount: 12,
        period: "2026-07-01..2026-07-07",
      },
    });
  });

  it("sends metadata: null when the caller gives no repo, count or period", async () => {
    const { client, calls } = capturingClient();
    const tool = captureTool(client);
    await callTool(tool, { summary: "s" });
    expect(calls[0]?.metadata).toBeNull();
  });

  it("keeps commitCount: 0 in the metadata rather than treating it as absent", async () => {
    const { client, calls } = capturingClient();
    const tool = captureTool(client);
    await callTool(tool, { summary: "s", commitCount: 0 });
    expect(calls[0]?.metadata).toEqual({ commitCount: 0 });
  });

  it("defaults status to 'published' — an unattended agent must opt IN to review", async () => {
    const { client, calls } = capturingClient();
    const tool = captureTool(client);
    await callTool(tool, { summary: "s" });
    // CHARACTERIZATION: the description tells the agent to pass
    // status='pending_review' when unattended, but the DEFAULT is 'published'.
    // An agent that simply omits `status` publishes straight to the profile.
    expect(calls[0]?.status).toBe("published");
  });

  it("sends no coverImageUrl / images / externalUrl keys at all", async () => {
    const { client, calls } = capturingClient();
    const tool = captureTool(client);
    await callTool(tool, { summary: "s" });
    const sent = calls[0] as unknown as Record<string, unknown>;
    expect("coverImageUrl" in sent).toBe(false);
    expect("images" in sent).toBe(false);
    expect("externalUrl" in sent).toBe(false);
  });

  it("the payload it builds parses cleanly through the shared createPostSchemaInput", async () => {
    const { client, calls } = capturingClient();
    const tool = captureTool(client);
    await callTool(tool, {
      summary: "s",
      repo: "linkhub-v.1",
      commitCount: 3,
      period: "weekly",
      tags: ["changelog"],
    });
    expect(createPostSchemaInput.safeParse(calls[0]).success).toBe(true);
  });
});

describe("create_commit_summary_post — results and errors", () => {
  it("confirms with the commit-summary heading and the post's provenance", async () => {
    const tool = captureTool({
      createPost: async () => fakePost({ title: "linkhub-v.1 update" }),
    });
    const result = await callTool(tool, { summary: "s" });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toBe(
      [
        "Commit summary published ✅",
        "id: 11111111-1111-4111-8111-111111111111",
        "title: linkhub-v.1 update",
        "status: published",
        "source: commit",
      ].join("\n"),
    );
  });

  it("preserves the 400 denylist message verbatim so the agent can rewrite", async () => {
    const message =
      'Post mentions "Acme Corp", which your disclosure settings do not allow. ' +
      "Describe the capability without naming the employer or client.";
    const tool = captureTool({
      createPost: async () => {
        throw new LinkHubApiError(message, 400);
      },
    });
    const result = await callTool(tool, { summary: "Worked at Acme Corp" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(message);
  });

  it("surfaces an unexpected failure as an isError result instead of throwing", async () => {
    const tool = captureTool({
      createPost: async () => {
        throw new Error("boom");
      },
    });
    const result = await callTool(tool, { summary: "s" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Unexpected error: boom");
  });
});
