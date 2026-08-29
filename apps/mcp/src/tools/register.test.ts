import { describe, expect, it, vi } from "vitest";
import type {
  AgentDisclosureLevel,
  AgentPolicy,
  CreatePostInput,
  Post,
  UpdatePostInput,
} from "@repo/schemas";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  CraftHubApiClient,
  ListPostsParams,
  WorkContext,
  WorkContextRole,
} from "../api-client.js";
import { CraftHubApiError } from "../api-client.js";
import { levelInfo, type DisclosureContext } from "../disclosure.js";
import { registerAllTools } from "./index.js";
import { registerCreatePost } from "./create-post.js";
import { registerCreateCommitSummaryPost } from "./create-commit-summary-post.js";
import { registerUpdatePost } from "./update-post.js";
import { registerDeletePost } from "./delete-post.js";
import { registerListMyPosts } from "./list-my-posts.js";
import { registerGetDisclosurePolicy } from "./get-disclosure-policy.js";
import { registerGetWorkContext } from "./get-work-context.js";

/**
 * Characterization tests for every CraftHub MCP tool.
 *
 * Each `register*` function is driven through an in-memory fake host: it records
 * `{ name, config, handler }`, and the test then invokes the captured handler
 * directly. No stdio, no transport, no network — the api client is a stub whose
 * calls are the assertion surface, because "what payload reaches the user's
 * public profile" is the thing this package can get wrong.
 */

// ── fake MCP host ─────────────────────────────────────────────────────────────

type ToolArgs = Record<string, unknown>;
type ToolHandler = (args: ToolArgs, extra?: unknown) => Promise<CallToolResult>;

interface ToolConfig {
  title?: string;
  description?: string;
  inputSchema?: unknown;
}

interface RegisteredTool {
  name: string;
  config: ToolConfig;
  handler: ToolHandler;
}

interface FakeHost {
  /** The fake, shaped as an McpServer for the register* functions. */
  server: McpServer;
  names: () => string[];
  tool: (name: string) => RegisteredTool;
  description: (name: string) => string;
  call: (name: string, args?: ToolArgs) => Promise<CallToolResult>;
}

function createFakeHost(): FakeHost {
  const registered = new Map<string, RegisteredTool>();

  const host = {
    registerTool(name: string, config: ToolConfig, handler: ToolHandler): void {
      registered.set(name, { name, config, handler });
    },
  };

  const tool = (name: string): RegisteredTool => {
    const found = registered.get(name);
    if (!found) throw new Error(`tool "${name}" was never registered`);
    return found;
  };

  return {
    server: host as unknown as McpServer,
    names: () => [...registered.keys()],
    tool,
    description: (name) => tool(name).config.description ?? "",
    call: (name, args = {}) => tool(name).handler(args, {}),
  };
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const BASE_POST: Post = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  source: "mcp",
  title: "Shipped the resume importer",
  body: "Body text.",
  coverImageUrl: null,
  images: null,
  tags: null,
  status: "published",
  externalUrl: null,
  metadata: null,
  createdAt: new Date("2026-08-01T10:00:00.000Z"),
  updatedAt: new Date("2026-08-01T10:00:00.000Z"),
  publishedAt: new Date("2026-08-01T10:00:00.000Z"),
};

function makePost(overrides: Partial<Post> = {}): Post {
  return { ...BASE_POST, ...overrides };
}

const BASE_ROLE: WorkContextRole = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Senior Backend Engineer",
  seniorityHint: "senior",
  employmentType: "full-time",
  workModel: "remote",
  startDate: "2023-01",
  endDate: "2024-06",
  isCurrent: false,
  durationMonths: 18,
  stack: ["TypeScript", "Fastify"],
  practices: ["TDD"],
  domain: "payments",
  companyName: "Acme Financial",
  achievements: ["Cut p95 latency 40%"],
};

function makeRole(overrides: Partial<WorkContextRole> = {}): WorkContextRole {
  return { ...BASE_ROLE, ...overrides };
}

function makeDisclosure(
  level: AgentDisclosureLevel = "summary",
  overrides: Partial<DisclosureContext> = {},
): DisclosureContext {
  return {
    level,
    info: levelInfo(level),
    blockedTerms: [],
    degraded: false,
    ...overrides,
  };
}

function createStubClient() {
  const createPost = vi.fn(
    async (_body: CreatePostInput): Promise<Post> => makePost(),
  );
  const listPosts = vi.fn(
    async (_params: ListPostsParams): Promise<Post[]> => [],
  );
  const updatePost = vi.fn(
    async (_id: string, _body: UpdatePostInput): Promise<Post> => makePost(),
  );
  const deletePost = vi.fn(
    async (_id: string): Promise<{ success: boolean }> => ({ success: true }),
  );
  const getWorkContext = vi.fn(
    async (): Promise<WorkContext> => ({
      disclosureLevel: "summary",
      roles: [],
    }),
  );
  const getAgentPolicy = vi.fn(
    async (): Promise<AgentPolicy> => ({
      disclosureLevel: "summary",
      blockedTerms: [],
      perEmployer: [],
    }),
  );

  const stub = {
    createPost,
    listPosts,
    updatePost,
    deletePost,
    getWorkContext,
    getAgentPolicy,
  };

  return { stub, client: stub as unknown as CraftHubApiClient };
}

type StubClient = ReturnType<typeof createStubClient>["stub"];

function textOf(result: CallToolResult): string {
  const first = result.content[0];
  if (!first || first.type !== "text") {
    throw new Error(`expected a text block, got ${JSON.stringify(result)}`);
  }
  return first.text;
}

/** The single argument of the first recorded call, or a loud failure. */
function firstArg<A extends unknown[]>(calls: A[]): A {
  const call = calls[0];
  if (!call) throw new Error("the stub was never called");
  return call;
}

function createdPayload(stub: StubClient): CreatePostInput {
  return firstArg(stub.createPost.mock.calls)[0];
}

// ── registerAllTools ──────────────────────────────────────────────────────────

describe("registerAllTools", () => {
  it("registers exactly the seven CraftHub tools, in this order", () => {
    const host = createFakeHost();
    const { client } = createStubClient();

    registerAllTools(host.server, client, makeDisclosure());

    expect(host.names()).toEqual([
      "create_post",
      "list_my_posts",
      "update_post",
      "delete_post",
      "create_commit_summary_post",
      "get_work_context",
      "get_disclosure_policy",
    ]);
  });

  it("gives every tool a non-empty title and description", () => {
    const host = createFakeHost();
    const { client } = createStubClient();

    registerAllTools(host.server, client, makeDisclosure());

    for (const name of host.names()) {
      const { config } = host.tool(name);
      expect(config.title, name).toBeTruthy();
      expect(config.description, name).toBeTruthy();
    }
  });
});

// ── create_post ───────────────────────────────────────────────────────────────

describe("create_post", () => {
  function setup(disclosure: DisclosureContext = makeDisclosure()) {
    const host = createFakeHost();
    const { stub, client } = createStubClient();
    registerCreatePost(host.server, client, disclosure);
    return { host, stub };
  }

  it("sends source='mcp' with every optional field nulled and status defaulted to published", async () => {
    const { host, stub } = setup();

    await host.call("create_post", { body: "Hello." });

    expect(stub.createPost).toHaveBeenCalledTimes(1);
    expect(createdPayload(stub)).toEqual({
      source: "mcp",
      title: null,
      body: "Hello.",
      coverImageUrl: null,
      images: null,
      externalUrl: null,
      tags: null,
      status: "published",
    });
  });

  it("omits workExperienceId entirely when it is not given", async () => {
    const { host, stub } = setup();

    await host.call("create_post", { body: "Hello." });

    // The source spreads it conditionally, so the key is absent rather than
    // present-and-undefined. Asserted on the keys because toEqual ignores
    // undefined-valued keys and would not tell these two apart.
    expect(Object.keys(createdPayload(stub))).not.toContain("workExperienceId");
  });

  it("forwards every provided field, including workExperienceId", async () => {
    const { host, stub } = setup();

    await host.call("create_post", {
      title: "A title",
      body: "The body.",
      coverImageUrl: "https://example.com/cover.png",
      images: ["https://example.com/a.png"],
      externalUrl: "https://example.com/pr/1",
      tags: ["typescript", "fastify"],
      status: "pending_review",
      workExperienceId: "44444444-4444-4444-8444-444444444444",
    });

    expect(createdPayload(stub)).toEqual({
      source: "mcp",
      title: "A title",
      body: "The body.",
      coverImageUrl: "https://example.com/cover.png",
      images: ["https://example.com/a.png"],
      externalUrl: "https://example.com/pr/1",
      tags: ["typescript", "fastify"],
      status: "pending_review",
      workExperienceId: "44444444-4444-4444-8444-444444444444",
    });
  });

  it("drops an empty-string workExperienceId instead of forwarding it", async () => {
    const { host, stub } = setup();

    // CHARACTERIZATION: the guard is truthiness, not `!== undefined`.
    await host.call("create_post", { body: "b", workExperienceId: "" });

    expect(Object.keys(createdPayload(stub))).not.toContain("workExperienceId");
  });

  it("returns the describePost confirmation for the created post", async () => {
    const { host, stub } = setup();
    stub.createPost.mockResolvedValueOnce(
      makePost({ id: "abc", title: "T", tags: ["ts"] }),
    );

    const result = await host.call("create_post", { body: "Hello." });

    expect(Object.hasOwn(result, "isError")).toBe(false);
    expect(textOf(result)).toBe(
      ["Post created ✅", "id: abc", "title: T", "status: published", "source: mcp", "tags: ts"].join(
        "\n",
      ),
    );
  });

  it("surfaces a disclosure rejection verbatim as an isError result", async () => {
    const { host, stub } = setup();
    const rejection =
      'Post rejected: it mentions "Acme Financial", which your disclosure policy blocks.';
    stub.createPost.mockRejectedValueOnce(new CraftHubApiError(rejection, 400));

    const result = await host.call("create_post", { body: "Hello." });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(rejection);
  });

  it("embeds the active disclosure policy in the tool description", async () => {
    const { host } = setup(makeDisclosure("summary"));
    const description = host.description("create_post");

    expect(description).toContain("DISCLOSURE POLICY: ");
    expect(description).toContain('the user\'s level is "summary" (Summary)');
    expect(description).toContain("YOU MUST NOT SAY: Employer and client names");
    expect(description).toContain("call get_work_context");
  });

  it("announces the degraded policy in the description when the policy could not be read", () => {
    const { host } = setup(
      makeDisclosure("summary", { degraded: true, degradedReason: "403" }),
    );

    expect(host.description("create_post")).toContain(
      "assuming the STRICTEST level",
    );
  });

  it("says nothing is blocked at level full", () => {
    const { host } = setup(makeDisclosure("full"));

    expect(host.description("create_post")).toContain(
      "Nothing is blocked at this level beyond the user's own blocked terms.",
    );
  });
});

// ── create_commit_summary_post ────────────────────────────────────────────────

describe("create_commit_summary_post", () => {
  function setup(disclosure: DisclosureContext = makeDisclosure()) {
    const host = createFakeHost();
    const { stub, client } = createStubClient();
    registerCreateCommitSummaryPost(host.server, client, disclosure);
    return { host, stub };
  }

  it("sends source='commit', tags null, metadata null and status published for a bare summary", async () => {
    const { host, stub } = setup();

    await host.call("create_commit_summary_post", { summary: "We shipped X." });

    expect(createdPayload(stub)).toEqual({
      source: "commit",
      title: "Project update",
      body: "We shipped X.",
      tags: null,
      status: "published",
      metadata: null,
    });
  });

  it("sends only those six keys — no cover image, images or external url", async () => {
    const { host, stub } = setup();

    await host.call("create_commit_summary_post", { summary: "s" });

    expect(Object.keys(createdPayload(stub)).sort()).toEqual([
      "body",
      "metadata",
      "source",
      "status",
      "tags",
      "title",
    ]);
  });

  it.each([
    [{}, "Project update"],
    [{ repo: "crafthub-v.1" }, "crafthub-v.1 update"],
    [{ period: "weekly" }, "Project — weekly update"],
    [
      { repo: "4 repositories", period: "weekly" },
      "4 repositories — weekly update",
    ],
  ])("derives the title %j -> %s", async (args, expected) => {
    const { host, stub } = setup();

    await host.call("create_commit_summary_post", { summary: "s", ...args });

    expect(createdPayload(stub).title).toBe(expected);
  });

  it("uses an explicit title instead of the derived one", async () => {
    const { host, stub } = setup();

    await host.call("create_commit_summary_post", {
      summary: "s",
      repo: "crafthub-v.1",
      period: "weekly",
      title: "Search got 3x faster",
    });

    expect(createdPayload(stub).title).toBe("Search got 3x faster");
  });

  it("builds the metadata bag from repo, commitCount and period", async () => {
    const { host, stub } = setup();

    await host.call("create_commit_summary_post", {
      summary: "s",
      repo: "4 repositories",
      commitCount: 12,
      period: "2026-07-01..2026-07-07",
    });

    expect(createdPayload(stub).metadata).toEqual({
      repo: "4 repositories",
      commitCount: 12,
      period: "2026-07-01..2026-07-07",
    });
  });

  it("keeps commitCount 0 in the metadata even though it is falsy", async () => {
    const { host, stub } = setup();

    await host.call("create_commit_summary_post", {
      summary: "s",
      commitCount: 0,
    });

    // The guard is `!== undefined`, not truthiness, so a genuine zero survives
    // instead of silently vanishing from the review queue.
    expect(createdPayload(stub).metadata).toEqual({ commitCount: 0 });
  });

  it("includes only the metadata keys that were provided", async () => {
    const { host, stub } = setup();

    await host.call("create_commit_summary_post", {
      summary: "s",
      period: "weekly",
    });

    expect(createdPayload(stub).metadata).toEqual({ period: "weekly" });
  });

  it("forwards tags and an explicit status", async () => {
    const { host, stub } = setup();

    await host.call("create_commit_summary_post", {
      summary: "s",
      tags: ["changelog", "shipped"],
      status: "pending_review",
    });

    const payload = createdPayload(stub);
    expect(payload.tags).toEqual(["changelog", "shipped"]);
    expect(payload.status).toBe("pending_review");
  });

  it("publishes the summary verbatim as the body", async () => {
    const { host, stub } = setup();
    const summary = "## What shipped\n\nI cut p95 latency 40%.";

    await host.call("create_commit_summary_post", { summary });

    expect(createdPayload(stub).body).toBe(summary);
  });

  it("returns the 'Commit summary published' confirmation", async () => {
    const { host, stub } = setup();
    stub.createPost.mockResolvedValueOnce(
      makePost({ id: "p1", title: "Project update", source: "commit" }),
    );

    const result = await host.call("create_commit_summary_post", {
      summary: "s",
    });

    expect(textOf(result)).toBe(
      [
        "Commit summary published ✅",
        "id: p1",
        "title: Project update",
        "status: published",
        "source: commit",
      ].join("\n"),
    );
  });

  it("turns an api failure into an isError result", async () => {
    const { host, stub } = setup();
    stub.createPost.mockRejectedValueOnce(
      new CraftHubApiError("CraftHub API error (HTTP 500).", 500),
    );

    const result = await host.call("create_commit_summary_post", {
      summary: "s",
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("CraftHub API error (HTTP 500).");
  });

  it("embeds the disclosure policy and the metadata contract in the description", () => {
    const { host } = setup(makeDisclosure("detailed"));
    const description = host.description("create_commit_summary_post");

    expect(description).toContain("metadata { repo, commitCount, period }");
    expect(description).toContain("DISCLOSURE POLICY: ");
    expect(description).toContain('the user\'s level is "detailed" (Detailed)');
  });
});

// ── update_post ───────────────────────────────────────────────────────────────

describe("update_post", () => {
  const ID = "55555555-5555-4555-8555-555555555555";

  function setup() {
    const host = createFakeHost();
    const { stub, client } = createStubClient();
    registerUpdatePost(host.server, client);
    return { host, stub };
  }

  it("refuses an id-only call without touching the api", async () => {
    const { host, stub } = setup();

    const result = await host.call("update_post", { id: ID });

    expect(stub.updatePost).not.toHaveBeenCalled();
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Nothing to update: provide at least one field to change.",
        },
      ],
      isError: true,
    });
  });

  it("sends only the fields the caller provided", async () => {
    const { host, stub } = setup();

    await host.call("update_post", { id: ID, status: "published" });

    expect(stub.updatePost).toHaveBeenCalledWith(ID, { status: "published" });
    const [, patch] = firstArg(stub.updatePost.mock.calls);
    expect(Object.keys(patch)).toEqual(["status"]);
  });

  it("forwards every updatable field when all are provided", async () => {
    const { host, stub } = setup();

    await host.call("update_post", {
      id: ID,
      title: "New title",
      body: "New body",
      coverImageUrl: "https://example.com/c.png",
      images: ["https://example.com/1.png"],
      externalUrl: "https://example.com/pr/2",
      tags: ["ts"],
      status: "draft",
    });

    expect(stub.updatePost).toHaveBeenCalledWith(ID, {
      title: "New title",
      body: "New body",
      coverImageUrl: "https://example.com/c.png",
      images: ["https://example.com/1.png"],
      externalUrl: "https://example.com/pr/2",
      tags: ["ts"],
      status: "draft",
    });
  });

  it("never sends the id inside the patch body", async () => {
    const { host, stub } = setup();

    await host.call("update_post", { id: ID, title: "t" });

    const [, patch] = firstArg(stub.updatePost.mock.calls);
    expect(Object.keys(patch)).not.toContain("id");
  });

  it("returns the 'Post updated' confirmation", async () => {
    const { host, stub } = setup();
    stub.updatePost.mockResolvedValueOnce(makePost({ id: ID, title: "T" }));

    const result = await host.call("update_post", { id: ID, title: "T" });

    expect(textOf(result)).toContain("Post updated ✅");
    expect(textOf(result)).toContain(`id: ${ID}`);
  });

  it("surfaces the api's 403 refusal to edit a machine-authored post", async () => {
    const { host, stub } = setup();
    stub.updatePost.mockRejectedValueOnce(
      new CraftHubApiError(
        "Your CraftHub token is not allowed to perform this action.",
        403,
      ),
    );

    const result = await host.call("update_post", { id: ID, body: "b" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      "Your CraftHub token is not allowed to perform this action.",
    );
  });

  it("does NOT embed the disclosure policy in its description", () => {
    const { host } = setup();

    // CHARACTERIZATION: only the two post-CREATING tools carry the policy;
    // update_post takes no disclosure context at all.
    expect(host.description("update_post")).not.toContain("DISCLOSURE POLICY");
  });
});

// ── delete_post ───────────────────────────────────────────────────────────────

describe("delete_post", () => {
  const ID = "66666666-6666-4666-8666-666666666666";

  function setup() {
    const host = createFakeHost();
    const { stub, client } = createStubClient();
    registerDeletePost(host.server, client);
    return { host, stub };
  }

  it("confirms the deletion when the api reports success", async () => {
    const { host, stub } = setup();

    const result = await host.call("delete_post", { id: ID });

    expect(stub.deletePost).toHaveBeenCalledWith(ID);
    expect(Object.hasOwn(result, "isError")).toBe(false);
    expect(textOf(result)).toBe(`Post ${ID} deleted ✅`);
  });

  it("reports failure when the api answers success:false", async () => {
    const { host, stub } = setup();
    stub.deletePost.mockResolvedValueOnce({ success: false });

    const result = await host.call("delete_post", { id: ID });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Post ${ID} could not be deleted.`);
  });

  it("reports failure when the api answers with an empty body", async () => {
    const { host, stub } = setup();
    // The api client returns `undefined` for an empty response body, which the
    // optional chain in the handler turns into the failure branch.
    stub.deletePost.mockResolvedValueOnce(
      undefined as unknown as { success: boolean },
    );

    const result = await host.call("delete_post", { id: ID });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Post ${ID} could not be deleted.`);
  });

  it("surfaces a 404 verbatim", async () => {
    const { host, stub } = setup();
    stub.deletePost.mockRejectedValueOnce(
      new CraftHubApiError("Post not found.", 404),
    );

    const result = await host.call("delete_post", { id: ID });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Post not found.");
  });

  it("warns that the deletion cannot be undone, without embedding the policy", () => {
    const { host } = setup();

    expect(host.description("delete_post")).toContain("This cannot be undone.");
    expect(host.description("delete_post")).not.toContain("DISCLOSURE POLICY");
  });
});

// ── list_my_posts ─────────────────────────────────────────────────────────────

describe("list_my_posts", () => {
  function setup() {
    const host = createFakeHost();
    const { stub, client } = createStubClient();
    registerListMyPosts(host.server, client);
    return { host, stub };
  }

  it("says 'No posts found.' for an empty list, without isError", async () => {
    const { host } = setup();

    const result = await host.call("list_my_posts", {});

    expect(Object.hasOwn(result, "isError")).toBe(false);
    expect(textOf(result)).toBe("No posts found.");
  });

  it("renders a count header and one line per post", async () => {
    const { host, stub } = setup();
    stub.listPosts.mockResolvedValueOnce([
      makePost({ id: "a", title: "First", status: "published", source: "mcp" }),
      makePost({
        id: "b",
        title: null,
        status: "pending_review",
        source: "commit",
      }),
    ]);

    const result = await host.call("list_my_posts", {});

    expect(textOf(result)).toBe(
      [
        "2 post(s):",
        '- a · "First" · published · source=mcp · 2026-08-01T10:00:00.000Z',
        '- b · "(untitled)" · pending_review · source=commit · 2026-08-01T10:00:00.000Z',
      ].join("\n"),
    );
  });

  it("passes limit and offset through to the api client", async () => {
    const { host, stub } = setup();

    await host.call("list_my_posts", { limit: 5, offset: 10 });

    expect(stub.listPosts).toHaveBeenCalledWith({ limit: 5, offset: 10 });
  });

  it("always sends both keys, as undefined, when neither is given", async () => {
    const { host, stub } = setup();

    await host.call("list_my_posts", {});

    // The client drops undefined values from the query string, so the api's own
    // defaults (limit 20, offset 0) apply.
    const [params] = firstArg(stub.listPosts.mock.calls);
    expect(Object.keys(params).sort()).toEqual(["limit", "offset"]);
    expect(params.limit).toBeUndefined();
    expect(params.offset).toBeUndefined();
  });

  it("surfaces an api failure as an isError result", async () => {
    const { host, stub } = setup();
    stub.listPosts.mockRejectedValueOnce(
      new CraftHubApiError("Invalid or expired CraftHub token.", 401),
    );

    const result = await host.call("list_my_posts", {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Invalid or expired CraftHub token.");
  });
});

// ── get_disclosure_policy ─────────────────────────────────────────────────────

describe("get_disclosure_policy", () => {
  function setup(startup: DisclosureContext = makeDisclosure()) {
    const host = createFakeHost();
    const { stub, client } = createStubClient();
    registerGetDisclosurePolicy(host.server, client, startup);
    return { host, stub };
  }

  it("re-fetches the live policy instead of replaying the startup snapshot", async () => {
    const { host, stub } = setup(makeDisclosure("summary"));
    stub.getAgentPolicy.mockResolvedValueOnce({
      disclosureLevel: "full",
      blockedTerms: [],
      perEmployer: [],
    });

    const result = await host.call("get_disclosure_policy", {});

    expect(stub.getAgentPolicy).toHaveBeenCalledTimes(1);
    expect(textOf(result)).toContain("# Disclosure level: `full` — Full");
  });

  it("renders the allow list, the block list and the enforcement note", async () => {
    const { host, stub } = setup();
    stub.getAgentPolicy.mockResolvedValueOnce({
      disclosureLevel: "detailed",
      blockedTerms: [],
      perEmployer: [],
    });

    const text = textOf(await host.call("get_disclosure_policy", {}));

    expect(text).toContain("# Disclosure level: `detailed` — Detailed");
    expect(text).toContain("## You may say\n\n- Everything allowed at Summary level");
    expect(text).toContain("## You must not say\n\n- Internal repository");
    expect(text).toContain("rejected with HTTP 400 naming the term");
  });

  it("lists the user's outright-banned terms under their own heading", async () => {
    const { host, stub } = setup();
    stub.getAgentPolicy.mockResolvedValueOnce({
      disclosureLevel: "full",
      blockedTerms: ["Acme Financial", "Project Nimbus"],
      perEmployer: [],
    });

    const text = textOf(await host.call("get_disclosure_policy", {}));

    expect(text).toContain(
      "## Terms the user banned outright (blocked at every level)\n\n- Acme Financial\n- Project Nimbus",
    );
  });

  it("omits the banned-terms section when there are none", async () => {
    const { host } = setup();

    const text = textOf(await host.call("get_disclosure_policy", {}));

    expect(text).not.toContain("banned outright");
  });

  it("says nothing extra is blocked at level full", async () => {
    const { host, stub } = setup();
    stub.getAgentPolicy.mockResolvedValueOnce({
      disclosureLevel: "full",
      blockedTerms: [],
      perEmployer: [],
    });

    const text = textOf(await host.call("get_disclosure_policy", {}));

    expect(text).toContain(
      "_Nothing at this level beyond the user's own blocked terms._",
    );
  });

  it("fails closed to `summary` with a reason when the live read fails", async () => {
    const { host, stub } = setup(makeDisclosure("full"));
    stub.getAgentPolicy.mockRejectedValueOnce(
      new CraftHubApiError("Your token is missing the profile:read scope", 403),
    );

    const result = await host.call("get_disclosure_policy", {});
    const text = textOf(result);

    // Not an isError result: the failure is reported inside a usable answer.
    expect(Object.hasOwn(result, "isError")).toBe(false);
    expect(text).toContain("# Disclosure level: `summary` — Summary");
    expect(text).toContain("the STRICTEST level is assumed");
    expect(text).toContain("Reason: Your token is missing the profile:read scope");
  });

  it("CHARACTERIZATION: a failed live read also discards the startup blocked terms", async () => {
    const { host, stub } = setup(
      makeDisclosure("full", { blockedTerms: ["Acme Financial"] }),
    );
    stub.getAgentPolicy.mockRejectedValueOnce(new CraftHubApiError("boom", 500));

    const text = textOf(await host.call("get_disclosure_policy", {}));

    // The known terms are dropped rather than kept. Safe today only because the
    // level simultaneously drops to `summary`, which blocks employer/client
    // names anyway — but the user's own custom bans do disappear from the answer.
    expect(text).not.toContain("Acme Financial");
  });

  it("does not embed the policy text in its own description", () => {
    const { host } = setup();

    expect(host.description("get_disclosure_policy")).not.toContain(
      "DISCLOSURE POLICY",
    );
    expect(host.description("get_disclosure_policy")).toContain(
      "Requires the profile:read token scope.",
    );
  });
});

// ── get_work_context ──────────────────────────────────────────────────────────

describe("get_work_context", () => {
  function setup(disclosure: DisclosureContext = makeDisclosure()) {
    const host = createFakeHost();
    const { stub, client } = createStubClient();
    registerGetWorkContext(host.server, client, disclosure);
    return { host, stub };
  }

  it("tells the agent not to invent a history when there are no roles", async () => {
    const { host } = setup();

    const result = await host.call("get_work_context", {});

    expect(Object.hasOwn(result, "isError")).toBe(false);
    expect(textOf(result)).toBe(
      "No work history on this CraftHub profile yet. Do not invent one — " +
        "if the post needs employment context, ask the user to add their " +
        "roles in CraftHub first.",
    );
  });

  it("renders the header with the level and role count, then each role", async () => {
    const { host, stub } = setup();
    stub.getWorkContext.mockResolvedValueOnce({
      disclosureLevel: "detailed",
      roles: [makeRole()],
    });

    const text = textOf(await host.call("get_work_context", {}));

    expect(text).toContain(
      'Work history at disclosure level "detailed" (1 role(s)).',
    );
    expect(text).toContain("do not add anything that is not here either.");
    expect(text).toContain("### 1. Senior Backend Engineer");
    expect(text).toContain("- Employer: Acme Financial");
    expect(text).toContain("- Seniority: senior");
    expect(text).toContain("- Dates: 2023-01 → 2024-06 (1 year 6 months)");
    expect(text).toContain("- Employment type: full-time");
    expect(text).toContain("- Work model: remote");
    expect(text).toContain("- Problem domain: payments");
    expect(text).toContain("- Stack: TypeScript, Fastify");
    expect(text).toContain("- Engineering practices: TDD");
    expect(text).toContain(
      "- Achievements (employer and client names stripped; nothing else is):\n  - Cut p95 latency 40%",
    );
  });

  it("replaces a null companyName with the withheld notice at level summary", async () => {
    const { host, stub } = setup();
    stub.getWorkContext.mockResolvedValueOnce({
      disclosureLevel: "summary",
      roles: [makeRole({ companyName: null })],
    });

    const text = textOf(await host.call("get_work_context", {}));

    expect(text).toContain(
      "- Employer: (employer withheld by the disclosure policy — do not guess it)",
    );
  });

  it("omits every optional line when the redacted role has nothing to show", async () => {
    const { host, stub } = setup();
    stub.getWorkContext.mockResolvedValueOnce({
      disclosureLevel: "summary",
      roles: [
        makeRole({
          seniorityHint: null,
          employmentType: null,
          workModel: null,
          domain: null,
          stack: [],
          practices: [],
          achievements: [],
        }),
      ],
    });

    const text = textOf(await host.call("get_work_context", {}));

    for (const label of [
      "- Seniority:",
      "- Employment type:",
      "- Work model:",
      "- Problem domain:",
      "- Stack:",
      "- Engineering practices:",
      "- Achievements",
    ]) {
      expect(text, label).not.toContain(label);
    }
  });

  it("renders a current role as 'present' and missing dates as '?'", async () => {
    const { host, stub } = setup();
    stub.getWorkContext.mockResolvedValueOnce({
      disclosureLevel: "summary",
      roles: [
        makeRole({ isCurrent: true, endDate: null }),
        makeRole({ startDate: null, endDate: null, isCurrent: false }),
      ],
    });

    const text = textOf(await host.call("get_work_context", {}));

    expect(text).toContain("- Dates: 2023-01 → present (1 year 6 months)");
    expect(text).toContain("- Dates: ? → ? (1 year 6 months)");
  });

  it("numbers roles from 1 in the order the api returned them", async () => {
    const { host, stub } = setup();
    stub.getWorkContext.mockResolvedValueOnce({
      disclosureLevel: "summary",
      roles: [makeRole({ title: "First" }), makeRole({ title: "Second" })],
    });

    const text = textOf(await host.call("get_work_context", {}));

    expect(text).toContain("### 1. First");
    expect(text).toContain("### 2. Second");
    expect(text.indexOf("### 1. First")).toBeLessThan(
      text.indexOf("### 2. Second"),
    );
  });

  it.each([
    [null, "duration unknown"],
    [0, "0 months"],
    [1, "1 month"],
    [11, "11 months"],
    [12, "1 year"],
    [13, "1 year 1 month"],
    [24, "2 years"],
    [26, "2 years 2 months"],
  ])("formats %s months as %s", async (durationMonths, expected) => {
    const { host, stub } = setup();
    stub.getWorkContext.mockResolvedValueOnce({
      disclosureLevel: "summary",
      roles: [makeRole({ durationMonths })],
    });

    const text = textOf(await host.call("get_work_context", {}));

    expect(text).toContain(`(${expected})`);
  });

  it("surfaces the profile:read scope failure as an isError result", async () => {
    const { host, stub } = setup();
    stub.getWorkContext.mockRejectedValueOnce(
      new CraftHubApiError(
        "Your token is missing the profile:read scope — create a new token",
        403,
      ),
    );

    const result = await host.call("get_work_context", {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("profile:read scope");
  });

  it("names the active level in the description and forbids inferring the employer", () => {
    const { host } = setup(makeDisclosure("summary"));
    const description = host.description("get_work_context");

    expect(description).toContain("THIS IS THE ONLY SANCTIONED SOURCE");
    expect(description).toContain(
      'The user\'s disclosure level is "summary", so this tool returns exactly what that level permits and nothing more.',
    );
    expect(description).toContain("Requires the profile:read token scope.");
  });

  it("warns in the description when the policy could not be read at startup", () => {
    const { host } = setup(makeDisclosure("summary", { degraded: true }));

    expect(host.description("get_work_context")).toContain(
      "The disclosure policy could not be read at startup",
    );
  });

  it("CHARACTERIZATION: the description does not carry the full policy, only the level", () => {
    const { host } = setup(makeDisclosure("detailed"));

    expect(host.description("get_work_context")).not.toContain(
      "DISCLOSURE POLICY:",
    );
  });
});

// ── get_work_context: what it claims CraftHub enforces ─────────────────────────

/**
 * BUG-20260827-mcp-overstates-redaction.
 *
 * `redact-work-disclosure.ts` strips exactly one of the seven categories the
 * `summary` level promises to block: employer and client names on the user's
 * denylist. Ticket ids, customer names, internal codenames, unreleased
 * products, architecture specifics and headcount figures come back from the api
 * byte-identical. The tool used to call the whole payload "already redacted"
 * and to close with "publish only what appears here" — which tells an agent
 * that reading a role achievement is enough diligence, and is how "Led PROJ-4471
 * for our customer Acme Bank on the unreleased Falcon engine. Team of 42."
 * reaches a public post.
 */
describe("get_work_context does not overstate what CraftHub redacts", () => {
  function setup(disclosure: DisclosureContext = makeDisclosure()) {
    const host = createFakeHost();
    const { stub, client } = createStubClient();
    registerGetWorkContext(host.server, client, disclosure);
    return { host, stub };
  }

  const LEAKY_ACHIEVEMENT =
    "Led PROJ-4471 for our customer Acme Bank on the unreleased Falcon " +
    "settlement engine. Team of 42.";

  it("never tells the agent the payload is already redacted", async () => {
    const { host, stub } = setup();
    stub.getWorkContext.mockResolvedValueOnce({
      disclosureLevel: "summary",
      roles: [makeRole({ achievements: [LEAKY_ACHIEVEMENT] })],
    });

    const text = textOf(await host.call("get_work_context", {}));

    expect(text).not.toContain("already redacted");
    expect(text).not.toContain("publish only what appears here");
  });

  it("names the one category CraftHub strips and hands the rest to the agent", async () => {
    const { host, stub } = setup();
    stub.getWorkContext.mockResolvedValueOnce({
      disclosureLevel: "summary",
      roles: [makeRole({ achievements: [LEAKY_ACHIEVEMENT] })],
    });

    const text = textOf(await host.call("get_work_context", {}));

    expect(text).toContain(
      "CraftHub has stripped the employer and client names on the user's " +
        "denylist from this text — that is the ONLY category it removes.",
    );
    expect(text).toContain(
      "Ticket ids, customer names, internal codenames, unreleased products, " +
        "architecture details and headcount figures are NOT stripped and may " +
        "still appear below",
    );
    expect(text).toContain(
      "leaving them out of the post is your job, not CraftHub's",
    );
  });

  it("labels the achievements list with what was actually stripped", async () => {
    const { host, stub } = setup();
    stub.getWorkContext.mockResolvedValueOnce({
      disclosureLevel: "summary",
      roles: [makeRole({ achievements: [LEAKY_ACHIEVEMENT] })],
    });

    const text = textOf(await host.call("get_work_context", {}));

    expect(text).toContain(
      `- Achievements (employer and client names stripped; nothing else is):\n  - ${LEAKY_ACHIEVEMENT}`,
    );
  });

  it("does not promise full redaction in the tool description either", () => {
    const { host } = setup();

    const description = host.description("get_work_context");

    expect(description).not.toContain("ALREADY REDACTED");
    expect(description).toContain(
      "with the employer and client names on their denylist ALREADY STRIPPED " +
        "by CraftHub, and nothing else removed",
    );
  });
});
