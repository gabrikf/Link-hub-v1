import { beforeEach, describe, expect, it, vi } from "vitest";
import { postSchema } from "@repo/schemas";
import { LinkHubApiClient, LinkHubApiError } from "./api-client.js";

/**
 * CHARACTERIZATION suite for the MCP → LinkHub HTTP transport.
 *
 * Every assertion here describes what `api-client.ts` does TODAY, not what it
 * ought to do. Where today's behaviour is wrong in a way that reaches a user,
 * the test says so in a `CHARACTERIZATION: ... WRONG` comment and still asserts
 * the current output, so the suite stays green until the behaviour is fixed on
 * purpose.
 *
 * Nothing here opens a socket: `globalThis.fetch` is replaced by a spy.
 */

const TOKEN = "lh_pat_c0ffee_do_not_leak_me";
const BASE = "http://localhost:3333";

let fetchMock: ReturnType<typeof vi.fn>;

function client(apiUrl = BASE, token = TOKEN): LinkHubApiClient {
  return new LinkHubApiClient({ apiUrl, token });
}

/** Queues one JSON response for the next fetch call. */
function respondJson(body: unknown, status = 200): void {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function respondRaw(body: BodyInit | null, status = 200): void {
  fetchMock.mockResolvedValueOnce(new Response(body, { status }));
}

/** The URL the client asked fetch for on call `n` (default: the first). */
function calledUrl(n = 0): string {
  return String(fetchMock.mock.calls[n]?.[0]);
}

function calledInit(n = 0): RequestInit {
  return fetchMock.mock.calls[n]?.[1] as RequestInit;
}

/** A body the api would really return for a created post. */
function postPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "6f1c0f6e-1a3c-4a5f-8f2b-1c2d3e4f5a6b",
    userId: "9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d",
    source: "mcp",
    title: "Shipped the retry backoff",
    body: "We cut the failure banner delay from 7s to 1s.",
    coverImageUrl: null,
    images: null,
    tags: ["typescript", "fastify"],
    status: "published",
    externalUrl: null,
    metadata: null,
    createdAt: "2026-08-23T10:00:00.000Z",
    updatedAt: "2026-08-23T10:00:00.000Z",
    publishedAt: "2026-08-23T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("request wiring", () => {
  it("sends the PAT as a Bearer Authorization header", async () => {
    respondJson(postPayload());

    await client().getPost("6f1c0f6e-1a3c-4a5f-8f2b-1c2d3e4f5a6b");

    const headers = calledInit().headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("uses the HTTP method of the operation and omits a body on reads", async () => {
    respondJson([]);

    await client().listPosts();

    expect(calledInit().method).toBe("GET");
    expect(calledInit().body).toBeUndefined();
  });

  it("JSON-serializes the request body on a write", async () => {
    respondJson(postPayload(), 201);

    await client().createPost({
      source: "mcp",
      body: "hello",
      status: "published",
    });

    expect(calledInit().method).toBe("POST");
    expect(JSON.parse(String(calledInit().body))).toEqual({
      source: "mcp",
      body: "hello",
      status: "published",
    });
  });

  it("concatenates base URL and path with no normalization", async () => {
    respondJson([]);

    await client().listPosts();

    expect(calledUrl()).toBe("http://localhost:3333/me/posts");
  });

  it("keeps a base URL that carries a path prefix", async () => {
    respondJson([]);

    await client("http://linkhub.internal/api").listPosts();

    expect(calledUrl()).toBe("http://linkhub.internal/api/me/posts");
  });

  it("produces a doubled slash when the base URL ends in one", async () => {
    // CHARACTERIZATION: the client does no trailing-slash normalization of its
    // own — `loadConfig()` is the only thing that strips it. Constructing a
    // client directly with a trailing slash yields `//me/posts`. Harmless
    // against Fastify (it matches the route anyway), recorded so a future
    // caller that bypasses loadConfig knows what it gets.
    respondJson([]);

    await client("http://localhost:3333/").listPosts();

    expect(calledUrl()).toBe("http://localhost:3333//me/posts");
  });

  it("omits the query string entirely when no pagination is given", async () => {
    respondJson([]);

    await client().listPosts();

    expect(calledUrl()).not.toContain("?");
  });

  it("sends limit and offset only when provided, and keeps an explicit 0", async () => {
    respondJson([]);
    respondJson([]);
    respondJson([]);

    const api = client();
    await api.listPosts({ limit: 5 });
    await api.listPosts({ offset: 0 });
    await api.listPosts({ limit: 10, offset: 20 });

    expect(calledUrl(0)).toBe("http://localhost:3333/me/posts?limit=5");
    expect(calledUrl(1)).toBe("http://localhost:3333/me/posts?offset=0");
    expect(calledUrl(2)).toBe(
      "http://localhost:3333/me/posts?limit=10&offset=20",
    );
  });

  it("percent-encodes a post id into the path", async () => {
    respondJson(postPayload());

    await client().getPost("a/b?c#d");

    expect(calledUrl()).toBe("http://localhost:3333/me/posts/a%2Fb%3Fc%23d");
  });

  it("routes each operation at its documented method and path", async () => {
    respondJson({});
    respondJson({});
    respondJson({});
    respondJson({});

    const api = client();
    await api.getAgentPolicy();
    await api.getWorkContext();
    await api.updatePost("abc", { title: "t" });
    await api.deletePost("abc");

    expect([calledUrl(0), calledInit(0).method]).toEqual([
      "http://localhost:3333/me/agent-policy",
      "GET",
    ]);
    expect([calledUrl(1), calledInit(1).method]).toEqual([
      "http://localhost:3333/me/work-context",
      "GET",
    ]);
    expect([calledUrl(2), calledInit(2).method]).toEqual([
      "http://localhost:3333/me/posts/abc",
      "PATCH",
    ]);
    expect([calledUrl(3), calledInit(3).method]).toEqual([
      "http://localhost:3333/me/posts/abc",
      "DELETE",
    ]);
  });
});

describe("error translation", () => {
  it("passes a disclosure-policy 400 through verbatim, offending term intact", async () => {
    // This message is the agent's ONLY guidance: it names the blocked term and
    // says what to do instead. Wrapping or truncating it would make the agent
    // retry the same rejected text.
    const guidance =
      'Post mentions "Acme Corp", which your disclosure settings do not allow. ' +
      'Each employer follows the level of its own role (this post\'s level is "summary") ' +
      "and your own blocked terms always apply, so raising one role never un-blocks another. " +
      "Describe the capability without naming the employer or client";
    respondJson(
      { error: "BADREQUEST", message: guidance, statusCode: 400 },
      400,
    );

    const err = await client()
      .createPost({ source: "mcp", body: "x", status: "published" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LinkHubApiError);
    expect((err as LinkHubApiError).message).toBe(guidance);
    expect((err as LinkHubApiError).message).toContain('"Acme Corp"');
    expect((err as LinkHubApiError).status).toBe(400);
  });

  it("reads the server message from `error` when there is no `message` key", async () => {
    respondJson({ error: "Body is required", statusCode: 400 }, 400);

    const err = await client()
      .createPost({ source: "mcp", body: "", status: "published" })
      .catch((e: unknown) => e);

    expect((err as LinkHubApiError).message).toBe("Body is required");
  });

  it("falls back to a generic sentence on a 400 with an unreadable body", async () => {
    respondRaw("not json at all", 400);

    const err = await client()
      .createPost({ source: "mcp", body: "x", status: "published" })
      .catch((e: unknown) => e);

    expect((err as LinkHubApiError).message).toBe(
      "LinkHub rejected the request as invalid.",
    );
  });

  it("reduces a zod 400 to the bare words 'Validation Error' and drops `details`", async () => {
    // CHARACTERIZATION: this is today's behaviour and it is WRONG — see
    // CANDIDATE BUG "validation 400 loses its field details".
    //
    // The api caps `body` at 20000 chars (createPostSchemaInput) while the MCP
    // `create_post` input schema caps nothing, so an over-long body is rejected
    // only server-side. The response carries `details` naming the field and the
    // limit; `extractMessage()` reads `message`/`error` only, so all of that is
    // thrown away and the agent is told "Validation Error" with no field, no
    // limit and no fix. It has nothing to change, so it retries the same text.
    respondJson(
      {
        error: "VALIDATION_ERROR",
        message: "Validation Error",
        statusCode: 400,
        code: "VALIDATION_ERROR",
        details: [
          {
            path: "body",
            message: "Too big: expected string to have <=20000 characters",
          },
        ],
        timestamp: "2026-08-23T10:00:00.000Z",
        path: "/me/posts",
      },
      400,
    );

    const err = await client()
      .createPost({ source: "mcp", body: "x".repeat(20001), status: "published" })
      .catch((e: unknown) => e);

    expect((err as LinkHubApiError).message).toBe("Validation Error");
    expect((err as LinkHubApiError).message).not.toContain("20000");
    expect((err as LinkHubApiError).message).not.toContain("body");
  });

  it("turns a 401 into fixed token-renewal instructions", async () => {
    respondJson({ message: "Unauthorized", statusCode: 401 }, 401);

    const err = await client()
      .listPosts()
      .catch((e: unknown) => e);

    expect((err as LinkHubApiError).status).toBe(401);
    expect((err as LinkHubApiError).message).toBe(
      "Invalid or expired LinkHub token. Create a fresh Personal Access Token in LinkHub settings and set LINKHUB_API_TOKEN.",
    );
  });

  it("explains the missing profile:read scope on the two profile paths", async () => {
    respondJson({ message: "Forbidden", statusCode: 403 }, 403);
    respondJson({ message: "Forbidden", statusCode: 403 }, 403);

    const api = client();
    const policyErr = await api.getAgentPolicy().catch((e: unknown) => e);
    const contextErr = await api.getWorkContext().catch((e: unknown) => e);

    for (const err of [policyErr, contextErr]) {
      expect((err as LinkHubApiError).message).toContain(
        "missing the profile:read scope",
      );
      expect((err as LinkHubApiError).message).toContain(
        "it will assume the strictest one",
      );
    }
  });

  it("uses the generic scope message for a 403 on a posts path", async () => {
    respondJson({ message: "Forbidden", statusCode: 403 }, 403);

    const err = await client()
      .listPosts({ limit: 5 })
      .catch((e: unknown) => e);

    expect((err as LinkHubApiError).message).toBe(
      "Your LinkHub token is not allowed to perform this action (Forbidden). Ensure it has the posts:write / posts:read scopes.",
    );
  });

  it("calls every 404 'Post not found', even one that means the base URL is wrong", async () => {
    // CHARACTERIZATION: a POST to a mistyped base URL (LINKHUB_API_URL with a
    // stray `/api`) 404s at the router, and the client reports "Post not found"
    // for a call that was creating a post, not reading one. The Fastify message
    // is appended in the suffix, which is the only thing that saves it.
    respondJson(
      { message: "Route POST:/api/me/posts not found", statusCode: 404 },
      404,
    );

    const err = await client("http://localhost:3333/api")
      .createPost({ source: "mcp", body: "x", status: "published" })
      .catch((e: unknown) => e);

    expect((err as LinkHubApiError).message).toBe(
      "Post not found (Route POST:/api/me/posts not found).",
    );
  });

  it("reports an unmapped status with its HTTP code and the server message", async () => {
    respondJson({ message: "Internal Server Error", statusCode: 500 }, 500);

    const err = await client()
      .listPosts()
      .catch((e: unknown) => e);

    expect((err as LinkHubApiError).status).toBe(500);
    expect((err as LinkHubApiError).message).toBe(
      "LinkHub API error (HTTP 500) (Internal Server Error).",
    );
  });

  it("strips the query string before matching a path against the profile:read set", async () => {
    respondJson({ message: "Forbidden" }, 403);

    // `/me/posts?limit=1` must not accidentally match; and the profile paths are
    // matched on the part before `?`.
    const err = await client()
      .listPosts({ limit: 1 })
      .catch((e: unknown) => e);

    expect((err as LinkHubApiError).message).not.toContain("profile:read");
  });

  it("never puts the PAT into any error message", async () => {
    const statuses = [400, 401, 403, 404, 409, 500];
    for (const status of statuses) {
      respondJson({ message: `boom ${status}` }, status);
    }
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    const api = client();
    const messages: string[] = [];
    for (let i = 0; i < statuses.length + 1; i += 1) {
      const err = await api.listPosts().catch((e: unknown) => e);
      messages.push((err as Error).message);
    }

    expect(messages).toHaveLength(statuses.length + 1);
    for (const message of messages) {
      expect(message).not.toContain(TOKEN);
      expect(message).not.toContain("Bearer");
      expect(message).not.toContain("lh_pat_");
    }
  });

  it("turns a transport rejection into a LinkHubApiError with no status", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    const err = await client()
      .listPosts()
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LinkHubApiError);
    expect((err as LinkHubApiError).status).toBeUndefined();
    expect((err as LinkHubApiError).message).toBe(
      "Could not reach the LinkHub API at http://localhost:3333. " +
        "Make sure the API is running and LINKHUB_API_URL is correct. (fetch failed)",
    );
  });

  it("stringifies a non-Error transport rejection into the same message", async () => {
    fetchMock.mockRejectedValueOnce("ECONNREFUSED");

    const err = await client()
      .listPosts()
      .catch((e: unknown) => e);

    expect((err as LinkHubApiError).message).toContain("(ECONNREFUSED)");
  });
});

describe("response decoding", () => {
  it("resolves undefined for an empty 200/204 body", async () => {
    // CHARACTERIZATION: the empty-body guard returns `undefined as T`, so the
    // declared return type lies. `delete_post` survives because it reads
    // `result?.success`; a caller that dereferences the result would throw.
    // The api returns `{success:true}` with a 200 today, so this is a latent
    // shape, not a live failure.
    respondRaw(null, 204);

    const result = await client().deletePost("abc");

    expect(result).toBeUndefined();
  });

  it("resolves the decoded JSON on success", async () => {
    respondJson(postPayload(), 201);

    const post = await client().createPost({
      source: "mcp",
      body: "x",
      status: "published",
    });

    expect(post.id).toBe("6f1c0f6e-1a3c-4a5f-8f2b-1c2d3e4f5a6b");
    expect(post.status).toBe("published");
  });

  it("throws a raw SyntaxError — not a LinkHubApiError — on a 200 that is not JSON", async () => {
    // CHARACTERIZATION: this is today's behaviour and it is WRONG — see
    // CANDIDATE BUG "non-JSON 200 surfaces a raw parser error".
    //
    // Pointing LINKHUB_API_URL at the web dev server (5173) instead of the api
    // (3333) returns 200 text/html. `JSON.parse` throws a SyntaxError that is
    // NOT wrapped, so the agent is shown the parser's own words and nothing
    // about LINKHUB_API_URL being wrong.
    respondRaw("<!doctype html><html><body>LinkHub</body></html>", 200);

    const err = await client("http://localhost:5173")
      .listPosts()
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SyntaxError);
    expect(err).not.toBeInstanceOf(LinkHubApiError);
    expect((err as Error).message).not.toContain("LINKHUB_API_URL");
  });

  it("returns a body that violates the shared contract without complaint", async () => {
    // CHARACTERIZATION: this is today's behaviour and it is WRONG — see
    // CANDIDATE BUG "responses are never parsed through @repo/schemas".
    //
    // `request()` ends in `JSON.parse(text) as T` — a cast, not a parse. The
    // payload below is what api contract drift looks like (the post nested
    // under a `post` key); postSchema rejects it, the client does not.
    const drifted = { post: postPayload() };
    expect(postSchema.safeParse(drifted).success).toBe(false);

    respondJson(drifted, 201);

    const post = await client().createPost({
      source: "mcp",
      body: "x",
      status: "published",
    });

    expect(post).toEqual(drifted);
    // Every field the tool prints back to the user is undefined, and nothing
    // anywhere said so.
    expect(post.id).toBeUndefined();
    expect(post.status).toBeUndefined();
  });

  it("hands back a bare {} on a 2xx as if it were a real post", async () => {
    // CHARACTERIZATION: same root cause as above, stated as the worst case.
    respondJson({}, 201);

    const post = await client().createPost({
      source: "mcp",
      body: "x",
      status: "published",
    });

    expect(post).toEqual({});
  });

  it("does not coerce date strings — createdAt stays a string", async () => {
    // postSchema uses z.coerce.date(); because the client never parses, the
    // tool receives the raw ISO string. `summarizePostLine` handles both, which
    // is why nothing has broken.
    respondJson(postPayload());

    const post = await client().getPost("abc");

    expect(typeof post.createdAt).toBe("string");
    expect(post.createdAt).not.toBeInstanceOf(Date);
  });
});
