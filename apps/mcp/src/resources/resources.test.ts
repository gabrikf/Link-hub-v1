import { describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import {
  createPostSchemaInput,
  postStatusSchema,
  type AgentDisclosureLevel,
} from "@repo/schemas";
import {
  levelInfo,
  renderPolicyResource,
  type DisclosureContext,
} from "../disclosure.js";
import {
  registerAllResources,
  POST_GUIDELINES,
  POST_GUIDELINES_URI,
  DISCLOSURE_POLICY_URI,
} from "./index.js";

/**
 * Characterization tests for the two MCP resources.
 *
 * A host agent binds to these URIs and reads them before it writes anything, so
 * the names, the URIs and the mime types are contract. The bodies matter just as
 * much: `linkhub://policy/disclosure` is the privacy contract, and
 * `linkhub://guides/post-quality` is what the tool descriptions point at when
 * they say "full house style: read the resource".
 *
 * Driven through an in-memory fake host — no network, no stdio.
 */

// ── The fake host ───────────────────────────────────────────────────────────

interface RecordedResourceConfig {
  readonly title?: string;
  readonly description?: string;
  readonly mimeType?: string;
}

interface RecordedResource {
  readonly name: string;
  readonly uri: string;
  readonly config: RecordedResourceConfig;
  readonly read: (uri: URL) => ReadResourceResult;
}

interface FakeHost {
  /** Cast once, here, so no test has to reach for a cast of its own. */
  readonly server: McpServer;
  /** Registration order, which is also the order a host lists them in. */
  readonly order: readonly string[];
  readonly resources: ReadonlyMap<string, RecordedResource>;
}

function createFakeHost(): FakeHost {
  const order: string[] = [];
  const resources = new Map<string, RecordedResource>();

  const fake = {
    registerResource(
      name: string,
      uri: string,
      config: RecordedResourceConfig,
      read: (uri: URL) => ReadResourceResult,
    ): void {
      order.push(name);
      resources.set(name, { name, uri, config, read });
    },
  };

  return { server: fake as unknown as McpServer, order, resources };
}

function resourceNamed(host: FakeHost, name: string): RecordedResource {
  const resource = host.resources.get(name);
  if (!resource) throw new Error(`resource "${name}" was never registered`);
  return resource;
}

/**
 * Reads a resource at its own registered URI and returns the single content.
 *
 * The SDK's resource contents are a union of `{ text }` and `{ blob }`, so the
 * text arm has to be narrowed before `.text` can be read.
 */
function readOnlyText(resource: RecordedResource): {
  readonly uri: string;
  readonly mimeType?: string;
  readonly text: string;
} {
  const result = resource.read(new URL(resource.uri));
  const [content, ...rest] = result.contents;
  if (!content) throw new Error(`resource "${resource.name}" returned nothing`);
  if (rest.length > 0)
    throw new Error(
      `resource "${resource.name}" returned ${result.contents.length} contents`,
    );
  if (!("text" in content))
    throw new Error(`resource "${resource.name}" returned a blob, not text`);
  const { uri, mimeType } = content;
  return {
    uri: String(uri),
    mimeType: typeof mimeType === "string" ? mimeType : undefined,
    text: String(content.text),
  };
}

// ── Disclosure contexts ─────────────────────────────────────────────────────

function contextFor(
  level: AgentDisclosureLevel,
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

const SUMMARY = contextFor("summary");
const FULL = contextFor("full");
const WITH_BLOCKED_TERMS = contextFor("detailed", {
  blockedTerms: ["Acme Corp", "Project Falcon"],
});
const DEGRADED = contextFor("summary", {
  degraded: true,
  degradedReason: "401 Unauthorized: token is missing profile:read",
});
const DEGRADED_WITHOUT_REASON = contextFor("summary", { degraded: true });

function registerWith(disclosure: DisclosureContext): FakeHost {
  const host = createFakeHost();
  registerAllResources(host.server, disclosure);
  return host;
}

// ── Registration ────────────────────────────────────────────────────────────

describe("registerAllResources", () => {
  it("registers exactly two resources, by the names a host agent binds to", () => {
    const host = registerWith(SUMMARY);

    expect(host.order).toEqual(["post_quality_guide", "disclosure_policy"]);
  });

  it("pins the canonical URIs the tools and prompts point at", () => {
    const host = registerWith(SUMMARY);

    expect(POST_GUIDELINES_URI).toBe("linkhub://guides/post-quality");
    expect(DISCLOSURE_POLICY_URI).toBe("linkhub://policy/disclosure");
    expect(resourceNamed(host, "post_quality_guide").uri).toBe(
      POST_GUIDELINES_URI,
    );
    expect(resourceNamed(host, "disclosure_policy").uri).toBe(
      DISCLOSURE_POLICY_URI,
    );
  });

  it("serves both resources as markdown, in metadata and in the body", () => {
    const host = registerWith(SUMMARY);

    for (const name of ["post_quality_guide", "disclosure_policy"]) {
      const resource = resourceNamed(host, name);
      expect(resource.config.mimeType).toBe("text/markdown");
      expect(readOnlyText(resource).mimeType).toBe("text/markdown");
    }
  });

  it("echoes back the URI it was read at", () => {
    const host = registerWith(SUMMARY);

    expect(readOnlyText(resourceNamed(host, "post_quality_guide")).uri).toBe(
      "linkhub://guides/post-quality",
    );
    expect(readOnlyText(resourceNamed(host, "disclosure_policy")).uri).toBe(
      "linkhub://policy/disclosure",
    );
  });
});

// ── linkhub://policy/disclosure ─────────────────────────────────────────────

describe("disclosure_policy resource", () => {
  it("names the active level in its title, so a resource list already shows it", () => {
    expect(
      resourceNamed(registerWith(SUMMARY), "disclosure_policy").config.title,
    ).toBe("LinkHub disclosure policy (Summary)");
    expect(
      resourceNamed(registerWith(FULL), "disclosure_policy").config.title,
    ).toBe("LinkHub disclosure policy (Full)");
  });

  it("points the agent at get_work_context in its description", () => {
    const resource = resourceNamed(registerWith(SUMMARY), "disclosure_policy");

    expect(resource.config.description).toContain(
      "get_work_context — never git remotes or directory names",
    );
  });

  it("serves exactly renderPolicyResource for the context it was registered with", () => {
    for (const context of [
      SUMMARY,
      FULL,
      WITH_BLOCKED_TERMS,
      DEGRADED,
      DEGRADED_WITHOUT_REASON,
    ]) {
      const resource = resourceNamed(
        registerWith(context),
        "disclosure_policy",
      );
      expect(readOnlyText(resource).text).toBe(renderPolicyResource(context));
    }
  });

  it("renders the summary-level allow and block lists in full", () => {
    const { text } = readOnlyText(
      resourceNamed(registerWith(SUMMARY), "disclosure_policy"),
    );

    expect(text).toContain("# Active disclosure policy");
    expect(text).toContain("**Level: `summary` — Summary**");
    expect(text).toContain(
      "Share what you did and how you did it, never who you did it for.",
    );
    expect(text).toContain("## What you may say");
    expect(text).toContain("## What you must not say");
    for (const allow of SUMMARY.info.allows) expect(text).toContain(`- ${allow}`);
    for (const block of SUMMARY.info.blocks) expect(text).toContain(`- ${block}`);
    expect(text).toContain("## How this is enforced");
    expect(text).toContain(
      "`get_work_context` is the ONLY sanctioned source.",
    );
    expect(text).toContain('LinkHub Settings →\n"What your agent may share"');
  });

  it("renders the empty-blocks branch at the `full` level", () => {
    const { text } = readOnlyText(
      resourceNamed(registerWith(FULL), "disclosure_policy"),
    );

    expect(FULL.info.blocks).toHaveLength(0);
    expect(text).toContain("**Level: `full` — Full**");
    expect(text).toContain(
      "_Nothing beyond the user's own blocked terms below._",
    );
  });

  it("omits the banned-terms section when the user banned nothing", () => {
    const { text } = readOnlyText(
      resourceNamed(registerWith(SUMMARY), "disclosure_policy"),
    );

    expect(text).not.toContain("## Terms the user banned outright");
  });

  it("lists banned terms, and says they bind even at `full`", () => {
    const { text } = readOnlyText(
      resourceNamed(registerWith(WITH_BLOCKED_TERMS), "disclosure_policy"),
    );

    expect(text).toContain("## Terms the user banned outright");
    expect(text).toContain("These are blocked at EVERY level, including `full`:");
    expect(text).toContain("- Acme Corp");
    expect(text).toContain("- Project Falcon");
  });

  it("marks a degraded read as a fallback and names the reason", () => {
    const { text } = readOnlyText(
      resourceNamed(registerWith(DEGRADED), "disclosure_policy"),
    );

    expect(text).toContain("> **This is a fallback.**");
    expect(text).toContain(
      "Reason: 401 Unauthorized: token is missing profile:read",
    );
    // Failing closed: the strictest level is what gets served.
    expect(text).toContain("**Level: `summary` — Summary**");
    expect(text).toContain("- Employer and client names");
  });

  it("says 'unknown' when the degraded read carries no reason", () => {
    const { text } = readOnlyText(
      resourceNamed(registerWith(DEGRADED_WITHOUT_REASON), "disclosure_policy"),
    );

    expect(text).toContain("Reason: unknown");
  });

  it("does not claim to be a fallback when the policy was read", () => {
    const { text } = readOnlyText(
      resourceNamed(registerWith(SUMMARY), "disclosure_policy"),
    );

    expect(text).not.toContain("This is a fallback");
  });
});

// ── linkhub://guides/post-quality ───────────────────────────────────────────

describe("post_quality_guide resource", () => {
  it("carries its title and serves POST_GUIDELINES verbatim", () => {
    const resource = resourceNamed(
      registerWith(SUMMARY),
      "post_quality_guide",
    );

    expect(resource.config.title).toBe("LinkHub post quality guide");
    expect(resource.config.description).toContain(
      "Read this before writing any post.",
    );
    expect(readOnlyText(resource).text).toBe(POST_GUIDELINES);
  });

  it("does not vary with the disclosure context", () => {
    const withSummary = readOnlyText(
      resourceNamed(registerWith(SUMMARY), "post_quality_guide"),
    ).text;
    const withFull = readOnlyText(
      resourceNamed(registerWith(FULL), "post_quality_guide"),
    ).text;

    expect(withSummary).toBe(withFull);
  });

  it("keeps its sections, in order", () => {
    const headings = [
      "# LinkHub post quality guide",
      "## 1. The one rule: outcome over mechanics",
      "## 2. What a strong post contains",
      "## 2b. Write for search as well as for the reader",
      "## 3. What you may say about your job",
      "## 4. What to leave out — non-negotiable",
      "## 5. Length, tone, format",
      "## 6. Field mapping — `create_commit_summary_post`",
      "## 7. Worked example",
      "## 8. Before you publish",
    ];

    const positions = headings.map((heading) =>
      POST_GUIDELINES.indexOf(heading),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

// ── Promises the tool descriptions make about this resource ────────────────

/**
 * `create_commit_summary_post`'s description tells the host agent that the
 * "full house style" lives at `linkhub://guides/post-quality`. These pin the
 * specific claims that description makes, so the resource cannot quietly stop
 * delivering on them.
 */
describe("post_quality_guide keeps the promises the tools make for it", () => {
  it("holds the house style the tool description delegates to", () => {
    // The tool says: "Full house style: read the resource
    // linkhub://guides/post-quality".
    expect(POST_GUIDELINES).toContain("# LinkHub post quality guide");
    expect(POST_GUIDELINES_URI).toBe("linkhub://guides/post-quality");
  });

  it("repeats the outcome-over-mechanics rule the tool asks for", () => {
    expect(POST_GUIDELINES).toContain("## 1. The one rule: outcome over mechanics");
    expect(POST_GUIDELINES).toContain("80–200 words for a weekly update");
    expect(POST_GUIDELINES).toContain("first person, past tense");
  });

  it("repeats the never-publish list the tool description names", () => {
    for (const forbidden of [
      "Raw commit messages",
      "Commit SHAs, branch names, ticket ids",
      "Secrets and credentials",
      "Private repository detail",
    ]) {
      expect(POST_GUIDELINES).toContain(forbidden);
    }
  });

  it("repeats the <70 character title rule the tool description states", () => {
    expect(POST_GUIDELINES).toContain(
      "**Title:** under 70 characters, specific, no trailing punctuation.",
    );
    expect(POST_GUIDELINES).toContain("The headline (< 70 chars)");
  });

  it("documents every argument the tool accepts, in its field mapping", () => {
    const fieldMapping = POST_GUIDELINES.slice(
      POST_GUIDELINES.indexOf("## 6. Field mapping"),
      POST_GUIDELINES.indexOf("## 7. Worked example"),
    );

    for (const field of [
      "summary",
      "title",
      "period",
      "repo",
      "commitCount",
      "tags",
      "status",
    ]) {
      expect(fieldMapping).toContain(`\`${field}\``);
    }
  });

  it("repeats the 'this tool runs no AI' promise", () => {
    expect(POST_GUIDELINES).toContain(
      "The tool publishes it verbatim; it runs no AI of its own.",
    );
  });

  it("repeats the unattended-run rule: pending_review, not published", () => {
    expect(POST_GUIDELINES).toContain(
      'Use `"pending_review"` whenever this runs unattended',
    );
  });

  it("names the same repo scope-marker rule the tool's `repo` argument states", () => {
    expect(POST_GUIDELINES).toContain(
      'Several repositories in one post: the count, e.g. `"4 repositories"`',
    );
    expect(POST_GUIDELINES).toContain("Omit for private/client work.");
  });
});

// ── The guide's claims about the API, checked against @repo/schemas ─────────

describe("post_quality_guide agrees with the shared schemas", () => {
  it("names every post status the API actually accepts", () => {
    expect(postStatusSchema.options).toEqual([
      "draft",
      "pending_review",
      "published",
    ]);
    for (const status of postStatusSchema.options) {
      expect(POST_GUIDELINES).toContain(`\`"${status}"\``);
    }
  });

  it("states the real body limit: 20,000 characters", () => {
    expect(POST_GUIDELINES).toContain(
      "Never exceed 20,000 characters (the API limit).",
    );

    const atLimit = createPostSchemaInput.safeParse({
      source: "commit",
      body: "x".repeat(20_000),
    });
    const overLimit = createPostSchemaInput.safeParse({
      source: "commit",
      body: "x".repeat(20_001),
    });

    expect(atLimit.success).toBe(true);
    expect(overLimit.success).toBe(false);
  });

  it("recommends 2–5 tags, well inside the schema's cap of 20", () => {
    expect(POST_GUIDELINES).toContain("2–5 lowercase tags");

    const fiveTags = createPostSchemaInput.safeParse({
      source: "commit",
      body: "body",
      tags: ["typescript", "fastify", "postgres", "react", "vitest"],
    });

    expect(fiveTags.success).toBe(true);
  });
});

// ── BUG-20260827-mcp-overstates-redaction ───────────────────────────────────

describe("post_quality_guide does not overstate what LinkHub redacts", () => {
  it("stops calling get_work_context's payload already redacted", () => {
    expect(POST_GUIDELINES).not.toContain("already redacted");
    expect(POST_GUIDELINES).toContain(
      "place the user's blocked employer and client names have already been stripped.",
    );
    expect(POST_GUIDELINES).toContain(
      "Nothing else on this list is stripped anywhere; keeping it out is your job.",
    );
  });
});
