import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createPostSchemaInput, type CreatePostInput } from "@repo/schemas";
import type { LinkHubApiClient } from "../api-client.js";
import { LinkHubApiError } from "../api-client.js";
import type { DisclosureContext } from "../disclosure.js";
import { levelInfo } from "../disclosure.js";
import { registerCreatePost } from "./create-post.js";

/**
 * CHARACTERIZATION SUITE. Every expectation here records what the code does
 * TODAY, not what it ought to do. Where today's behaviour is wrong, the
 * assertion is kept green and marked.
 */

interface CapturedTool {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

function captureCreatePost(client: Partial<LinkHubApiClient>): CapturedTool {
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

  const disclosure: DisclosureContext = {
    level: "summary",
    info: levelInfo("summary"),
    blockedTerms: [],
    degraded: false,
  };

  registerCreatePost(
    fakeServer as unknown as McpServer,
    client as LinkHubApiClient,
    disclosure,
  );

  const tool = captured[0];
  if (!tool) throw new Error("create_post was not registered");
  return tool;
}

/** A Post as the api returns it, for the fake client to resolve with. */
function fakePost(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    source: "mcp",
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

function textOf(result: CallToolResult): string {
  return result.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

describe("create_post — registration", () => {
  it("registers under the name the agent calls", () => {
    const tool = captureCreatePost({});
    expect(tool.name).toBe("create_post");
  });

  it("embeds the resolved disclosure policy in the description the agent reads", () => {
    const tool = captureCreatePost({});
    expect(tool.description).toContain("DISCLOSURE POLICY");
    expect(tool.description).toContain('the user\'s level is "summary"');
  });
});

describe("create_post — input schema (the agent-facing contract)", () => {
  const shape = () => z.object(captureCreatePost({}).inputSchema);

  it("accepts the minimal call: a body and nothing else", () => {
    expect(shape().safeParse({ body: "shipped a thing" }).success).toBe(true);
  });

  it("rejects a missing body", () => {
    expect(shape().safeParse({}).success).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(shape().safeParse({ body: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only body — no, it ACCEPTS it", () => {
    // CHARACTERIZATION: `.min(1)` is not `.trim().min(1)`, so a body of pure
    // whitespace is accepted here and by the shared schema too. Consistent, so
    // not a drift; recorded because it is surprising.
    expect(shape().safeParse({ body: "   \n  " }).success).toBe(true);
    expect(createPostSchemaInput.safeParse({ body: "   \n  " }).success).toBe(
      true,
    );
  });

  it("rejects a non-string body", () => {
    expect(shape().safeParse({ body: 42 }).success).toBe(false);
    expect(shape().safeParse({ body: null }).success).toBe(false);
    expect(shape().safeParse({ body: ["a"] }).success).toBe(false);
  });

  it("rejects an empty title but allows the key to be absent", () => {
    expect(shape().safeParse({ body: "b", title: "" }).success).toBe(false);
    expect(shape().safeParse({ body: "b" }).success).toBe(true);
  });

  it("silently DROPS an unexpected extra field instead of rejecting it", () => {
    const parsed = shape().parse({ body: "b", metadata: { repo: "x" } });
    expect(parsed).toEqual({ body: "b" });
    expect("metadata" in parsed).toBe(false);
  });

  it("accepts only http(s) URLs for coverImageUrl / images / externalUrl", () => {
    expect(
      shape().safeParse({ body: "b", coverImageUrl: "https://a.test/x.png" })
        .success,
    ).toBe(true);
    expect(
      shape().safeParse({ body: "b", coverImageUrl: "ftp://a.test/x.png" })
        .success,
    ).toBe(false);
    expect(
      shape().safeParse({ body: "b", coverImageUrl: "not a url" }).success,
    ).toBe(false);
    expect(
      shape().safeParse({ body: "b", images: ["https://a.test/1.png"] }).success,
    ).toBe(true);
    expect(
      shape().safeParse({ body: "b", images: ["javascript:alert(1)"] }).success,
    ).toBe(false);
    expect(
      shape().safeParse({ body: "b", externalUrl: "http://a.test" }).success,
    ).toBe(true);
  });

  it("rejects a workExperienceId that is not a uuid", () => {
    expect(
      shape().safeParse({ body: "b", workExperienceId: "role-1" }).success,
    ).toBe(false);
    expect(
      shape().safeParse({
        body: "b",
        workExperienceId: "33333333-3333-4333-8333-333333333333",
      }).success,
    ).toBe(true);
  });

  it("accepts only the three known statuses", () => {
    for (const status of ["draft", "pending_review", "published"]) {
      expect(shape().safeParse({ body: "b", status }).success).toBe(true);
    }
    expect(shape().safeParse({ body: "b", status: "archived" }).success).toBe(
      false,
    );
  });
});

describe("create_post — LOCAL schema vs the shared @repo/schemas contract", () => {
  const shape = () => z.object(captureCreatePost({}).inputSchema);

  it("accepts a 25 000-char body the shared contract caps at 20 000", () => {
    const body = "x".repeat(25_000);
    // CHARACTERIZATION: this is today's behaviour and it is WRONG — the MCP
    // tool re-declares the post shape locally instead of deriving it from
    // `createPostSchemaInput`, so the local copy has drifted: no max on body.
    // The agent's text is accepted here and refused by the api afterwards.
    expect(shape().safeParse({ body }).success).toBe(true);
    expect(
      createPostSchemaInput.safeParse({ body, source: "mcp" }).success,
    ).toBe(false);
  });

  it("accepts a 5 000-char title the shared contract caps at 200", () => {
    const title = "t".repeat(5_000);
    // CHARACTERIZATION: same drift, title edition.
    expect(shape().safeParse({ body: "b", title }).success).toBe(true);
    expect(
      createPostSchemaInput.safeParse({ body: "b", title, source: "mcp" })
        .success,
    ).toBe(false);
  });

  it("accepts an empty-string tag and 50 tags, which the shared contract refuses", () => {
    const many = Array.from({ length: 50 }, (_, i) => `tag${i}`);
    // CHARACTERIZATION: shared caps tags at 20 entries of 1-40 trimmed chars.
    expect(shape().safeParse({ body: "b", tags: [""] }).success).toBe(true);
    expect(shape().safeParse({ body: "b", tags: many }).success).toBe(true);
    expect(
      createPostSchemaInput.safeParse({ body: "b", tags: [""], source: "mcp" })
        .success,
    ).toBe(false);
    expect(
      createPostSchemaInput.safeParse({ body: "b", tags: many, source: "mcp" })
        .success,
    ).toBe(false);
  });

  it("accepts 20 images where the shared contract caps the array at 12", () => {
    const images = Array.from(
      { length: 20 },
      (_, i) => `https://a.test/${i}.png`,
    );
    expect(shape().safeParse({ body: "b", images }).success).toBe(true);
    expect(
      createPostSchemaInput.safeParse({ body: "b", images, source: "mcp" })
        .success,
    ).toBe(false);
  });
});

describe("create_post — handler", () => {
  it("sends source='mcp', status='published' and explicit nulls for every omitted field", async () => {
    const calls: CreatePostInput[] = [];
    const tool = captureCreatePost({
      createPost: async (body: CreatePostInput) => {
        calls.push(body);
        return fakePost();
      },
    });

    const args = z.object(tool.inputSchema).parse({ body: "shipped a thing" });
    await tool.handler(args);

    expect(calls[0]).toEqual({
      source: "mcp",
      title: null,
      body: "shipped a thing",
      coverImageUrl: null,
      images: null,
      externalUrl: null,
      tags: null,
      status: "published",
    });
  });

  it("omits workExperienceId entirely (rather than sending null) when absent", async () => {
    const calls: CreatePostInput[] = [];
    const tool = captureCreatePost({
      createPost: async (body: CreatePostInput) => {
        calls.push(body);
        return fakePost();
      },
    });

    await tool.handler(z.object(tool.inputSchema).parse({ body: "b" }));
    expect(calls[0] && "workExperienceId" in calls[0]).toBe(false);
  });

  it("forwards workExperienceId when the agent supplies it", async () => {
    const calls: Record<string, unknown>[] = [];
    const tool = captureCreatePost({
      createPost: async (body: CreatePostInput) => {
        calls.push(body as unknown as Record<string, unknown>);
        return fakePost();
      },
    });

    await tool.handler(
      z.object(tool.inputSchema).parse({
        body: "b",
        workExperienceId: "33333333-3333-4333-8333-333333333333",
      }),
    );
    expect(calls[0]?.workExperienceId).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
  });

  it("the payload it builds parses cleanly through the shared createPostSchemaInput", async () => {
    const calls: CreatePostInput[] = [];
    const tool = captureCreatePost({
      createPost: async (body: CreatePostInput) => {
        calls.push(body);
        return fakePost();
      },
    });

    await tool.handler(
      z.object(tool.inputSchema).parse({
        body: "shipped a thing",
        title: "Shipped",
        tags: ["typescript", "fastify"],
        externalUrl: "https://a.test/pr/1",
        status: "pending_review",
      }),
    );

    expect(createPostSchemaInput.safeParse(calls[0]).success).toBe(true);
  });

  it("confirms back to the agent with the new post's id, status and source", async () => {
    const tool = captureCreatePost({
      createPost: async () =>
        fakePost({ title: "Shipped", tags: ["typescript"] }),
    });

    const result = await tool.handler(
      z.object(tool.inputSchema).parse({ body: "b" }),
    );

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toBe(
      [
        "Post created ✅",
        "id: 11111111-1111-4111-8111-111111111111",
        "title: Shipped",
        "status: published",
        "source: mcp",
        "tags: typescript",
      ].join("\n"),
    );
  });

  it("renders a null title as (untitled) rather than 'null'", async () => {
    const tool = captureCreatePost({
      createPost: async () => fakePost({ title: null }),
    });
    const result = await tool.handler(
      z.object(tool.inputSchema).parse({ body: "b" }),
    );
    expect(textOf(result)).toContain("title: (untitled)");
  });
});

describe("create_post — api errors reaching the agent", () => {
  const DENYLIST_400 =
    'Post mentions "Acme Corp", which your disclosure settings do not allow. ' +
    'Each employer follows the level of its own role (this post\'s level is "summary") ' +
    "and your own blocked terms always apply, so raising one role never un-blocks another. " +
    "Describe the capability without naming the employer or client — what you built, " +
    "the stack, the practices and the outcome are all still allowed — or raise the " +
    "disclosure level of the role in question in LinkHub settings under " +
    '"What your agent may share".';

  it("preserves the 400 denylist message VERBATIM — it is the agent's only rewrite guidance", async () => {
    const tool = captureCreatePost({
      createPost: async () => {
        throw new LinkHubApiError(DENYLIST_400, 400);
      },
    });

    const result = await tool.handler(
      z.object(tool.inputSchema).parse({ body: "Worked at Acme Corp" }),
    );

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(DENYLIST_400);
  });

  it("passes a 401 token message through unwrapped", async () => {
    const message =
      "Invalid or expired LinkHub token. Create a fresh Personal Access Token in LinkHub settings and set LINKHUB_API_TOKEN.";
    const tool = captureCreatePost({
      createPost: async () => {
        throw new LinkHubApiError(message, 401);
      },
    });
    const result = await tool.handler(
      z.object(tool.inputSchema).parse({ body: "b" }),
    );
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(message);
  });

  it("wraps a non-api error with an 'Unexpected error:' prefix instead of crashing", async () => {
    const tool = captureCreatePost({
      createPost: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const result = await tool.handler(
      z.object(tool.inputSchema).parse({ body: "b" }),
    );
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Unexpected error: fetch failed");
  });
});
