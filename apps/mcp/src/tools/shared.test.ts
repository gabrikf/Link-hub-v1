import type { Post } from "@repo/schemas";
import { describe, expect, it } from "vitest";
import { LinkHubApiError } from "../api-client.js";
import {
  describePost,
  errorResult,
  runTool,
  summarizePostLine,
  textResult,
} from "./shared.js";

/** CHARACTERIZATION suite for the tool result/error wrapping. */

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: "6f1c0f6e-1a3c-4a5f-8f2b-1c2d3e4f5a6b",
    userId: "9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d",
    source: "mcp",
    title: "Shipped the retry backoff",
    body: "body",
    coverImageUrl: null,
    images: null,
    tags: ["typescript", "fastify"],
    status: "published",
    externalUrl: null,
    metadata: null,
    createdAt: new Date("2026-08-23T10:00:00.000Z"),
    updatedAt: new Date("2026-08-23T10:00:00.000Z"),
    publishedAt: new Date("2026-08-23T10:00:00.000Z"),
    ...overrides,
  };
}

describe("result builders", () => {
  it("textResult is a plain text content block with no isError", () => {
    expect(textResult("hello")).toEqual({
      content: [{ type: "text", text: "hello" }],
    });
    expect(textResult("hello").isError).toBeUndefined();
  });

  it("errorResult flags isError so the host agent sees a failure", () => {
    expect(errorResult("nope")).toEqual({
      content: [{ type: "text", text: "nope" }],
      isError: true,
    });
  });
});

describe("runTool", () => {
  it("passes a successful result straight through", async () => {
    const result = await runTool(async () => textResult("done"));

    expect(result).toEqual({ content: [{ type: "text", text: "done" }] });
  });

  it("turns a LinkHubApiError into an isError result carrying the message verbatim", async () => {
    // The end-to-end guarantee that matters: the disclosure 400's guidance
    // reaches the agent word for word, blocked term included, instead of the
    // session crashing or the message being replaced.
    const guidance =
      'Post mentions "Acme Corp", which your disclosure settings do not allow. ' +
      "Describe the capability without naming the employer or client.";

    const result = await runTool(async () => {
      throw new LinkHubApiError(guidance, 400);
    });

    expect(result).toEqual({
      content: [{ type: "text", text: guidance }],
      isError: true,
    });
  });

  it("drops the HTTP status — only the message survives", () => {
    // CHARACTERIZATION: `status` is carried on the error but never rendered, so
    // the agent cannot tell a 401 from a 500 except by reading the prose. The
    // prose is written to be self-explanatory, so this stays below the bug bar.
    const err = new LinkHubApiError("Invalid or expired LinkHub token.", 401);

    expect(err.status).toBe(401);
    expect(err.name).toBe("LinkHubApiError");
    expect(err).toBeInstanceOf(Error);
  });

  it("wraps an unknown Error with an 'Unexpected error' prefix", async () => {
    const result = await runTool(async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'id')");
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: "text",
        text: "Unexpected error: Cannot read properties of undefined (reading 'id')",
      },
    ]);
  });

  it("stringifies a thrown non-Error", async () => {
    const result = await runTool(async () => {
      throw "boom";
    });

    expect(result.content).toEqual([
      { type: "text", text: "Unexpected error: boom" },
    ]);
  });

  it("catches a synchronous throw from the handler as well", async () => {
    const result = await runTool(() => {
      throw new Error("sync");
    });

    expect(result).toEqual({
      content: [{ type: "text", text: "Unexpected error: sync" }],
      isError: true,
    });
  });

  it("surfaces the raw JSON parser message when the api answers with HTML", async () => {
    // CHARACTERIZATION: this is today's behaviour and it is WRONG — see
    // CANDIDATE BUG "non-JSON 200 surfaces a raw parser error". api-client.ts
    // lets the SyntaxError escape unwrapped, so this is what the user reads
    // when LINKHUB_API_URL points at the web dev server.
    const result = await runTool(async () => {
      JSON.parse("<!doctype html>");
      return textResult("unreachable");
    });

    const text = (result.content as { text: string }[])[0]?.text ?? "";
    expect(result.isError).toBe(true);
    expect(text.startsWith("Unexpected error: ")).toBe(true);
    expect(text).not.toContain("LINKHUB_API_URL");
  });
});

describe("post rendering", () => {
  it("summarizes a post with an ISO timestamp", () => {
    expect(summarizePostLine(makePost())).toBe(
      '- 6f1c0f6e-1a3c-4a5f-8f2b-1c2d3e4f5a6b · "Shipped the retry backoff" · published · source=mcp · 2026-08-23T10:00:00.000Z',
    );
  });

  it("accepts the raw string createdAt the unparsed client actually returns", () => {
    // api-client.ts never runs postSchema, so createdAt arrives as a string
    // despite the Post type. This branch is the only reason that has not shown.
    const post = makePost({
      createdAt: "2026-08-23T10:00:00.000Z" as unknown as Date,
    });

    expect(summarizePostLine(post)).toContain("· 2026-08-23T10:00:00.000Z");
  });

  it("labels a null title as (untitled) in both renderers", () => {
    const post = makePost({ title: null });

    expect(summarizePostLine(post)).toContain('"(untitled)"');
    expect(describePost(post, "Post created")).toContain("title: (untitled)");
  });

  it("describes a post as a labelled block under the given heading", () => {
    expect(describePost(makePost(), "Post created ✅")).toBe(
      [
        "Post created ✅",
        "id: 6f1c0f6e-1a3c-4a5f-8f2b-1c2d3e4f5a6b",
        "title: Shipped the retry backoff",
        "status: published",
        "source: mcp",
        "tags: typescript, fastify",
      ].join("\n"),
    );
  });

  it("omits the tags line when there are none", () => {
    expect(describePost(makePost({ tags: null }), "h")).not.toContain("tags:");
    expect(describePost(makePost({ tags: [] }), "h")).not.toContain("tags:");
  });

  it("reports a contract-drifted post as a line full of undefined", () => {
    // CHARACTERIZATION: this is today's behaviour and it is WRONG — see
    // CANDIDATE BUG "responses are never parsed through @repo/schemas".
    // With no parse in api-client.ts, a drifted 2xx body reaches here and the
    // tool prints a confident "Post created ✅" over undefined fields.
    const drifted = {} as Post;

    expect(describePost(drifted, "Post created ✅")).toBe(
      [
        "Post created ✅",
        "id: undefined",
        "title: (untitled)",
        "status: undefined",
        "source: undefined",
      ].join("\n"),
    );
  });
});
