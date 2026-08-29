import { describe, expect, it } from "vitest";
import type { Post } from "@repo/schemas";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CraftHubApiError } from "../api-client.js";
import {
  describePost,
  errorResult,
  runTool,
  summarizePostLine,
  textResult,
} from "./shared.js";

/**
 * Characterization tests for the tool-result helpers.
 *
 * These four functions are the only thing standing between an exception inside
 * a tool and a dead MCP session, and they are also what carries a disclosure
 * rejection back to the host agent. Everything here asserts TODAY's behaviour.
 */

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

/** Reads the single text block out of a result, or fails loudly. */
function textOf(result: CallToolResult): string {
  const first = result.content[0];
  if (!first || first.type !== "text") {
    throw new Error(`expected a text block, got ${JSON.stringify(result)}`);
  }
  return first.text;
}

describe("textResult", () => {
  it("wraps the text in a single text content block", () => {
    expect(textResult("hello")).toEqual({
      content: [{ type: "text", text: "hello" }],
    });
  });

  it("does not carry an isError key at all", () => {
    // Not just `isError === false` — the key is absent, which is what an MCP
    // host reads as "this call succeeded".
    expect(Object.hasOwn(textResult("hello"), "isError")).toBe(false);
  });

  it("keeps an empty string as an empty text block", () => {
    expect(textOf(textResult(""))).toBe("");
  });
});

describe("errorResult", () => {
  it("wraps the text and marks the result isError", () => {
    expect(errorResult("nope")).toEqual({
      content: [{ type: "text", text: "nope" }],
      isError: true,
    });
  });

  it("owns the isError key", () => {
    expect(Object.hasOwn(errorResult("nope"), "isError")).toBe(true);
  });
});

describe("runTool", () => {
  it("passes a successful result through untouched, by identity", async () => {
    const success = textResult("done");

    await expect(runTool(async () => success)).resolves.toBe(success);
  });

  it("turns a CraftHubApiError into an isError result carrying the message VERBATIM", async () => {
    // This is the disclosure-rejection path: the api answers 400 with a message
    // that names the blocked term, and the whole point is that the term reaches
    // the host agent so it can rewrite around it rather than retry.
    const message =
      'Post rejected: it mentions "Acme Financial", which your disclosure ' +
      "policy blocks. Rewrite the post without that name.";

    const result = await runTool(async () => {
      throw new CraftHubApiError(message, 400);
    });

    expect(result).toEqual({
      content: [{ type: "text", text: message }],
      isError: true,
    });
    expect(textOf(result)).toContain("Acme Financial");
  });

  it("does not prefix a CraftHubApiError message with 'Unexpected error'", async () => {
    const result = await runTool(async () => {
      throw new CraftHubApiError("Post not found.", 404);
    });

    expect(textOf(result)).toBe("Post not found.");
  });

  it("turns an unknown Error into 'Unexpected error: <message>'", async () => {
    const result = await runTool(async () => {
      throw new TypeError("boom");
    });

    expect(result).toEqual({
      content: [{ type: "text", text: "Unexpected error: boom" }],
      isError: true,
    });
  });

  it("stringifies a non-Error throw", async () => {
    const result = await runTool(async () => {
      throw "kaboom";
    });

    expect(textOf(result)).toBe("Unexpected error: kaboom");
  });

  it("stringifies a thrown object rather than crashing the session", async () => {
    const result = await runTool(async () => {
      throw { code: 500 };
    });

    expect(textOf(result)).toBe("Unexpected error: [object Object]");
  });
});

describe("summarizePostLine", () => {
  it("renders id, title, status, source and createdAt on one line", () => {
    expect(summarizePostLine(makePost())).toBe(
      '- 11111111-1111-4111-8111-111111111111 · "Shipped the resume importer" ' +
        "· published · source=mcp · 2026-08-01T10:00:00.000Z",
    );
  });

  it("renders a null title as (untitled)", () => {
    expect(summarizePostLine(makePost({ title: null }))).toContain(
      '· "(untitled)" ·',
    );
  });

  it("ISO-formats a Date createdAt", () => {
    const line = summarizePostLine(
      makePost({ createdAt: new Date("2020-01-02T03:04:05.678Z") }),
    );

    expect(line.endsWith("· 2020-01-02T03:04:05.678Z")).toBe(true);
  });

  it("passes a string createdAt straight through", () => {
    // The api client JSON.parses the response without a zod pass, so at runtime
    // `createdAt` is the raw ISO STRING the server sent, not a Date — despite
    // what `Post` declares. The cast reproduces that real runtime shape.
    const post = makePost({
      createdAt: "2019-05-06T07:08:09.000Z" as unknown as Date,
    });

    expect(summarizePostLine(post).endsWith("· 2019-05-06T07:08:09.000Z")).toBe(
      true,
    );
  });

  it("keeps a non-ISO string createdAt as-is instead of normalising it", () => {
    const post = makePost({ createdAt: "yesterday" as unknown as Date });

    expect(summarizePostLine(post).endsWith("· yesterday")).toBe(true);
  });

  it("reflects the source and status it is given", () => {
    const line = summarizePostLine(
      makePost({ source: "commit", status: "pending_review" }),
    );

    expect(line).toContain("· pending_review · source=commit ·");
  });
});

describe("describePost", () => {
  it("renders the heading and the five core fields, in order", () => {
    expect(describePost(makePost(), "Post created ✅")).toBe(
      [
        "Post created ✅",
        "id: 11111111-1111-4111-8111-111111111111",
        "title: Shipped the resume importer",
        "status: published",
        "source: mcp",
      ].join("\n"),
    );
  });

  it("renders a null title as (untitled)", () => {
    expect(describePost(makePost({ title: null }), "h")).toContain(
      "title: (untitled)",
    );
  });

  it("omits the tags line when tags are null", () => {
    expect(describePost(makePost({ tags: null }), "h")).not.toContain("tags:");
  });

  it("omits the tags line when tags are an empty array", () => {
    expect(describePost(makePost({ tags: [] }), "h")).not.toContain("tags:");
  });

  it("appends a comma-separated tags line when tags are present", () => {
    const text = describePost(
      makePost({ tags: ["typescript", "fastify", "postgres"] }),
      "Post updated ✅",
    );

    expect(text.split("\n").at(-1)).toBe("tags: typescript, fastify, postgres");
  });

  it("does not leak the body or metadata into the confirmation", () => {
    // The confirmation is what the host agent echoes back to the user; the
    // metadata bag (which can hold a repo name) is deliberately not in it.
    const text = describePost(
      makePost({ body: "secret body", metadata: { repo: "acme-internal" } }),
      "h",
    );

    expect(text).not.toContain("secret body");
    expect(text).not.toContain("acme-internal");
  });
});
