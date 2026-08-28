import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreatePostInput, UpdatePostInput } from "@repo/schemas";
import { LinkHubApiClient, LinkHubApiError } from "./api-client.js";
import type { LinkHubConfig } from "./config.js";

/**
 * Characterization tests for the LinkHub API client.
 *
 * This class is the only thing standing between an MCP host and the user's
 * LinkHub account, so these tests pin what it does TODAY: the exact URL and
 * init object handed to `fetch`, the query string it builds, the path encoding,
 * and the message every failure status is translated into. They assert current
 * behaviour, not desired behaviour — where the two differ it is called out with
 * a CHARACTERIZATION comment.
 *
 * Nothing here touches the network: `globalThis.fetch` is replaced per test and
 * restored afterwards. Responses are built with the real `Response`
 * constructor, because `describeError` calls `response.clone()`, which an
 * object literal does not have.
 */

const CONFIG: LinkHubConfig = {
  apiUrl: "http://api.test",
  token: "lh_pat_test",
};

/** Exactly what `request` puts in `headers`, for every verb. */
const EXPECTED_HEADERS = {
  "Content-Type": "application/json",
  Authorization: "Bearer lh_pat_test",
};

const originalFetch = globalThis.fetch;
let fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function client(config: LinkHubConfig = CONFIG): LinkHubApiClient {
  return new LinkHubApiClient(config);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

function respondWith(response: Response): void {
  fetchMock.mockResolvedValue(response);
}

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit;
}

/** The arguments of the most recent `fetch` call, narrowed without a cast. */
function lastFetchCall(): FetchCall {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error("fetch was never called");
  const [input, init] = call;
  if (typeof input !== "string") {
    throw new Error(`expected a string URL, got ${String(input)}`);
  }
  if (init === undefined) throw new Error("expected an init argument");
  return { url: input, init };
}

async function captureThrown(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("expected the call to reject, but it resolved");
}

async function captureApiError(
  promise: Promise<unknown>,
): Promise<LinkHubApiError> {
  const err = await captureThrown(promise);
  if (!(err instanceof LinkHubApiError)) {
    throw new Error(
      `expected a LinkHubApiError, got ${String(err)} (${typeof err})`,
    );
  }
  return err;
}

/**
 * `request` is private and no public method builds a profile-read path that
 * carries a query string, so the only way to characterize that branch of
 * `describeError` is to reach the private method directly. `private` is a
 * compile-time marker only; this bridge names the reach instead of hiding it.
 */
interface PrivateRequest {
  request(method: string, path: string, body?: unknown): Promise<unknown>;
}

function reachPrivateRequest(instance: LinkHubApiClient): PrivateRequest {
  return instance as unknown as PrivateRequest;
}

const CREATE_INPUT: CreatePostInput = {
  source: "manual",
  status: "published",
  body: "Shipped the retry backoff.",
  title: "Retry backoff",
};

const UPDATE_INPUT: UpdatePostInput = { title: "Renamed" };

// ── Request shape ────────────────────────────────────────────────────────────

describe("request shape", () => {
  it("GET sends the bearer token and the JSON content type, with no body", async () => {
    respondWith(jsonResponse({ level: "summary" }));

    await client().getAgentPolicy();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/me/agent-policy", {
      method: "GET",
      headers: EXPECTED_HEADERS,
      body: undefined,
    });

    // `toHaveBeenCalledWith` treats a missing key and an explicit `undefined`
    // as equal, so the key itself is asserted separately.
    const { init } = lastFetchCall();
    expect("body" in init).toBe(true);
    expect(init.body).toBeUndefined();
  });

  it("DELETE sends the same headers and no body", async () => {
    respondWith(jsonResponse({ success: true }));

    await client().deletePost("post-1");

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/me/posts/post-1", {
      method: "DELETE",
      headers: EXPECTED_HEADERS,
      body: undefined,
    });
    expect(lastFetchCall().init.body).toBeUndefined();
  });

  it("POST sends JSON.stringify(body)", async () => {
    respondWith(jsonResponse({ id: "post-1" }));

    await client().createPost(CREATE_INPUT);

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/me/posts", {
      method: "POST",
      headers: EXPECTED_HEADERS,
      body: JSON.stringify(CREATE_INPUT),
    });
  });

  it("PATCH sends JSON.stringify(body)", async () => {
    respondWith(jsonResponse({ id: "post-1" }));

    await client().updatePost("post-1", UPDATE_INPUT);

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/me/posts/post-1", {
      method: "PATCH",
      headers: EXPECTED_HEADERS,
      body: JSON.stringify(UPDATE_INPUT),
    });
  });

  it("sends the token from the config it was constructed with", async () => {
    respondWith(jsonResponse([]));

    await client({ apiUrl: "https://linkhub.dev/api", token: "lh_pat_other" })
      .listPosts();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://linkhub.dev/api/me/posts",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer lh_pat_other",
        },
      }),
    );
  });

  it("joins baseUrl and path by plain concatenation, with no double slash", async () => {
    respondWith(jsonResponse({ disclosureLevel: "summary", roles: [] }));

    await client().getWorkContext();

    expect(lastFetchCall().url).toBe("http://api.test/me/work-context");
  });

  it("CHARACTERIZATION: a trailing slash on the configured url does produce a double slash", async () => {
    // The client normalizes nothing — it relies entirely on `loadConfig()`
    // stripping trailing slashes. Benign today; it would bite anyone who
    // constructs the client with a hand-built config.
    respondWith(jsonResponse([]));

    await client({ apiUrl: "http://api.test/", token: "lh_pat_test" })
      .listPosts();

    expect(lastFetchCall().url).toBe("http://api.test//me/posts");
  });

  it("issues exactly one fetch per call", async () => {
    respondWith(jsonResponse([]));

    await client().listPosts();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── listPosts query string ───────────────────────────────────────────────────

describe("listPosts query string", () => {
  beforeEach(() => {
    respondWith(jsonResponse([]));
  });

  it("omits the ? entirely when no params are given", async () => {
    await client().listPosts();

    expect(lastFetchCall().url).toBe("http://api.test/me/posts");
  });

  it("omits the ? for an empty params object", async () => {
    await client().listPosts({});

    expect(lastFetchCall().url).toBe("http://api.test/me/posts");
  });

  it("sends limit alone", async () => {
    await client().listPosts({ limit: 5 });

    expect(lastFetchCall().url).toBe("http://api.test/me/posts?limit=5");
  });

  it("sends offset alone", async () => {
    await client().listPosts({ offset: 10 });

    expect(lastFetchCall().url).toBe("http://api.test/me/posts?offset=10");
  });

  it("always orders limit before offset, whatever order the caller used", async () => {
    await client().listPosts({ offset: 10, limit: 5 });

    expect(lastFetchCall().url).toBe(
      "http://api.test/me/posts?limit=5&offset=10",
    );
  });

  it("sends offset=0 — zero is not undefined", async () => {
    await client().listPosts({ offset: 0 });

    expect(lastFetchCall().url).toBe("http://api.test/me/posts?offset=0");
  });

  it("sends limit=0 — zero is not undefined", async () => {
    // CHARACTERIZATION: today's behaviour. The API's listPostsQuerySchema has
    // `limit.min(1)`, so limit=0 is forwarded only to be rejected as a 400.
    // The client does no bounds checking of its own.
    await client().listPosts({ limit: 0 });

    expect(lastFetchCall().url).toBe("http://api.test/me/posts?limit=0");
  });

  it("sends both zeros", async () => {
    await client().listPosts({ limit: 0, offset: 0 });

    expect(lastFetchCall().url).toBe(
      "http://api.test/me/posts?limit=0&offset=0",
    );
  });

  it("percent-encodes a param value rather than splicing it raw into the url", async () => {
    await client().listPosts({ limit: Number.NaN });

    expect(lastFetchCall().url).toBe("http://api.test/me/posts?limit=NaN");
  });
});

// ── Path encoding ────────────────────────────────────────────────────────────

describe("post id encoding", () => {
  // A `/` would add a path segment and a `#` would truncate the request at the
  // fragment; both make the row unreachable. This repo has already shipped one
  // bug of exactly that shape, so each verb is pinned separately.
  const HOSTILE_ID = "a/b#c?d";
  const ENCODED = "a%2Fb%23c%3Fd";

  beforeEach(() => {
    respondWith(jsonResponse({ id: HOSTILE_ID }));
  });

  it("getPost encodes the id", async () => {
    await client().getPost(HOSTILE_ID);

    expect(lastFetchCall().url).toBe(`http://api.test/me/posts/${ENCODED}`);
  });

  it("updatePost encodes the id", async () => {
    await client().updatePost(HOSTILE_ID, UPDATE_INPUT);

    expect(lastFetchCall().url).toBe(`http://api.test/me/posts/${ENCODED}`);
  });

  it("deletePost encodes the id", async () => {
    await client().deletePost(HOSTILE_ID);

    expect(lastFetchCall().url).toBe(`http://api.test/me/posts/${ENCODED}`);
  });

  it("leaves an ordinary uuid untouched", async () => {
    const uuid = "3f1b6a2e-7c40-4f4a-9f0e-2b5d8c1a9e77";

    await client().getPost(uuid);

    expect(lastFetchCall().url).toBe(`http://api.test/me/posts/${uuid}`);
  });

  it("encodes an empty id into a trailing-slash url", async () => {
    // CHARACTERIZATION: an empty id silently becomes `GET /me/posts/`, which is
    // a different route, not a client-side error.
    await client().getPost("");

    expect(lastFetchCall().url).toBe("http://api.test/me/posts/");
  });
});

// ── Response body handling ───────────────────────────────────────────────────

describe("response body", () => {
  it("parses and returns the JSON body", async () => {
    respondWith(jsonResponse([{ id: "post-1", body: "hello" }]));

    await expect(client().listPosts()).resolves.toEqual([
      { id: "post-1", body: "hello" },
    ]);
  });

  it("returns undefined for a 200 with an empty body instead of throwing", async () => {
    // CHARACTERIZATION: today's behaviour, suspected wrong — `deletePost` is
    // typed `Promise<OperationSuccess>` but resolves to `undefined` whenever
    // the server answers 200 with no body. The declared type is a lie the
    // compiler cannot catch. `tools/delete-post.ts` guards with `result?.success`
    // and would report "could not be deleted" for a delete that DID happen.
    respondWith(textResponse("", 200));

    await expect(client().deletePost("post-1")).resolves.toBeUndefined();
  });

  it("returns undefined for a 204-style null body", async () => {
    respondWith(new Response(null, { status: 200 }));

    await expect(client().deletePost("post-1")).resolves.toBeUndefined();
  });

  it("CHARACTERIZATION: a 200 with a non-JSON body throws a raw SyntaxError, not a LinkHubApiError", async () => {
    // Suspected wrong. A proxy, a captive portal or a misrouted request answers
    // 200 with HTML; the MCP host then sees "Unexpected token '<'" instead of
    // one of this client's actionable messages, and `status` is absent.
    respondWith(textResponse("<!doctype html><html>login</html>", 200));

    const err = await captureThrown(client().getPost("post-1"));

    expect(err).toBeInstanceOf(SyntaxError);
    expect(err).not.toBeInstanceOf(LinkHubApiError);
  });

  it("CHARACTERIZATION: a whitespace-only 200 body also throws a raw SyntaxError", async () => {
    // `if (!text)` is falsy only for the empty string, so " " reaches JSON.parse.
    respondWith(textResponse("   ", 200));

    const err = await captureThrown(client().deletePost("post-1"));

    expect(err).toBeInstanceOf(SyntaxError);
  });

  it("passes a JSON scalar body straight through", async () => {
    respondWith(textResponse("null", 200));

    await expect(client().getPost("post-1")).resolves.toBeNull();
  });
});

// ── Error mapping ────────────────────────────────────────────────────────────

describe("error mapping", () => {
  it("400 passes the server message through VERBATIM", async () => {
    // The disclosure-policy rejection path. The message already names the
    // offending term and the fix, so any wrapping would destroy the one piece
    // of information the agent needs to correct its post.
    const serverMessage =
      'The post names "Acme Corp", which your disclosure policy hides at the summary level. Remove the term or raise the level for that role.';
    respondWith(jsonResponse({ message: serverMessage }, 400));

    const err = await captureApiError(client().createPost(CREATE_INPUT));

    expect(err).toBeInstanceOf(LinkHubApiError);
    expect(err.message).toBe(serverMessage);
    expect(err.status).toBe(400);
    expect(err.name).toBe("LinkHubApiError");
  });

  it("400 passes an `error` key through verbatim too", async () => {
    respondWith(jsonResponse({ error: "Body is required" }, 400));

    const err = await captureApiError(client().createPost(CREATE_INPUT));

    expect(err.message).toBe("Body is required");
  });

  it("400 with no message falls back to the generic sentence", async () => {
    respondWith(jsonResponse({}, 400));

    const err = await captureApiError(client().createPost(CREATE_INPUT));

    expect(err.message).toBe("LinkHub rejected the request as invalid.");
    expect(err.status).toBe(400);
  });

  it("400 with an empty-string message falls back as well", async () => {
    respondWith(jsonResponse({ message: "" }, 400));

    const err = await captureApiError(client().createPost(CREATE_INPUT));

    expect(err.message).toBe("LinkHub rejected the request as invalid.");
  });

  it("401 names the env var and ignores whatever the server said", async () => {
    respondWith(jsonResponse({ message: "jwt malformed" }, 401));

    const err = await captureApiError(client().listPosts());

    expect(err.status).toBe(401);
    expect(err.message).toBe(
      "Invalid or expired LinkHub token. Create a fresh Personal Access Token in LinkHub settings and set LINKHUB_API_TOKEN.",
    );
    expect(err.message).not.toContain("jwt malformed");
  });

  it("403 on /me/agent-policy gives the profile:read guidance", async () => {
    respondWith(jsonResponse({ message: "missing scope" }, 403));

    const err = await captureApiError(client().getAgentPolicy());

    expect(err.status).toBe(403);
    expect(err.message).toContain("missing the profile:read scope");
    expect(err.message).toContain("Settings → Personal access tokens");
    expect(err.message).toContain("assume the strictest one");
    // The server's own message is deliberately dropped on this branch.
    expect(err.message).not.toContain("missing scope");
  });

  it("403 on /me/work-context gives the same profile:read guidance", async () => {
    respondWith(jsonResponse({}, 403));

    const err = await captureApiError(client().getWorkContext());

    expect(err.message).toContain("missing the profile:read scope");
  });

  it("403 on a profile-read path that carries a query string still gives the guidance", async () => {
    respondWith(jsonResponse({}, 403));

    const err = await captureApiError(
      reachPrivateRequest(client()).request(
        "GET",
        "/me/work-context?include=archived",
      ),
    );

    expect(err.message).toContain("missing the profile:read scope");
  });

  it("403 on any other path gives the generic scope message with the server detail", async () => {
    respondWith(jsonResponse({ message: "posts:write required" }, 403));

    const err = await captureApiError(client().createPost(CREATE_INPUT));

    expect(err.status).toBe(403);
    expect(err.message).toBe(
      "Your LinkHub token is not allowed to perform this action (posts:write required). Ensure it has the posts:write / posts:read scopes.",
    );
  });

  it("403 on a non-profile path that carries a query string is still generic", async () => {
    respondWith(jsonResponse({}, 403));

    const err = await captureApiError(client().listPosts({ limit: 5 }));

    expect(err.message).toBe(
      "Your LinkHub token is not allowed to perform this action. Ensure it has the posts:write / posts:read scopes.",
    );
  });

  it("404 appends the server message to the not-found sentence", async () => {
    respondWith(jsonResponse({ message: "no post with that id" }, 404));

    const err = await captureApiError(client().getPost("post-1"));

    expect(err.status).toBe(404);
    expect(err.message).toBe("Post not found (no post with that id).");
  });

  it("404 without a server message keeps the bare sentence", async () => {
    respondWith(jsonResponse({}, 404));

    const err = await captureApiError(client().deletePost("post-1"));

    expect(err.message).toBe("Post not found.");
  });

  it("an unmapped 500 reports the raw status", async () => {
    respondWith(jsonResponse({}, 500));

    const err = await captureApiError(client().listPosts());

    expect(err.status).toBe(500);
    expect(err.message).toBe("LinkHub API error (HTTP 500).");
  });

  it("an unmapped 429 appends the server message", async () => {
    respondWith(jsonResponse({ message: "Too many requests" }, 429));

    const err = await captureApiError(client().createPost(CREATE_INPUT));

    expect(err.status).toBe(429);
    expect(err.message).toBe("LinkHub API error (HTTP 429) (Too many requests).");
  });

  it("a 502 with an unparseable body still yields a LinkHubApiError carrying the status", async () => {
    respondWith(textResponse("<html>bad gateway</html>", 502));

    const err = await captureApiError(client().getPost("post-1"));

    expect(err).toBeInstanceOf(LinkHubApiError);
    expect(err.status).toBe(502);
    expect(err.message).toBe("LinkHub API error (HTTP 502).");
  });
});

// ── extractMessage ───────────────────────────────────────────────────────────

describe("extractMessage", () => {
  // Read through the 404 branch, which is the one that appends the extracted
  // message as a suffix.
  async function messageFrom(response: Response): Promise<string> {
    respondWith(response);
    const err = await captureApiError(client().getPost("post-1"));
    return err.message;
  }

  it("prefers `message` over `error`", async () => {
    const message = await messageFrom(
      jsonResponse({ message: "from message", error: "from error" }, 404),
    );

    expect(message).toBe("Post not found (from message).");
  });

  it("falls back to `error` when `message` is absent", async () => {
    const message = await messageFrom(jsonResponse({ error: "from error" }, 404));

    expect(message).toBe("Post not found (from error).");
  });

  it("falls back to `error` when `message` is null", async () => {
    const message = await messageFrom(
      jsonResponse({ message: null, error: "from error" }, 404),
    );

    expect(message).toBe("Post not found (from error).");
  });

  it("CHARACTERIZATION: a non-string `message` is ignored AND blocks the `error` fallback", async () => {
    // `data.message ?? data.error` — a number is not nullish, so it wins the
    // coalesce and is then rejected by the typeof check, discarding a perfectly
    // good `error` string.
    const message = await messageFrom(
      jsonResponse({ message: 42, error: "from error" }, 404),
    );

    expect(message).toBe("Post not found.");
  });

  it("ignores an object-valued message", async () => {
    const message = await messageFrom(
      jsonResponse({ message: { code: "E_NOPE" } }, 404),
    );

    expect(message).toBe("Post not found.");
  });

  it("survives a body that is not JSON at all", async () => {
    const message = await messageFrom(textResponse("plain text", 404));

    expect(message).toBe("Post not found.");
  });

  it("survives a body that is JSON `null`", async () => {
    const message = await messageFrom(textResponse("null", 404));

    expect(message).toBe("Post not found.");
  });

  it("survives an empty body", async () => {
    const message = await messageFrom(textResponse("", 404));

    expect(message).toBe("Post not found.");
  });

  it("survives a JSON array body", async () => {
    const message = await messageFrom(jsonResponse(["nope"], 404));

    expect(message).toBe("Post not found.");
  });
});

// ── Transport failure ────────────────────────────────────────────────────────

describe("transport failure", () => {
  it("wraps a rejected fetch in a LinkHubApiError with no status", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const err = await captureApiError(client().listPosts());

    expect(err).toBeInstanceOf(LinkHubApiError);
    expect(err.status).toBeUndefined();
    expect(err.message).toBe(
      "Could not reach the LinkHub API at http://api.test. " +
        "Make sure the API is running and LINKHUB_API_URL is correct. (fetch failed)",
    );
  });

  it("names the configured base url, not a hardcoded default", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const err = await captureApiError(
      client({ apiUrl: "https://linkhub.dev/api", token: "t" }).getAgentPolicy(),
    );

    expect(err.message).toContain("https://linkhub.dev/api");
    expect(err.message).toContain("LINKHUB_API_URL");
    expect(err.message).toContain("(ECONNREFUSED)");
  });

  it("stringifies a non-Error rejection value", async () => {
    fetchMock.mockRejectedValue("socket hang up");

    const err = await captureApiError(client().deletePost("post-1"));

    expect(err.status).toBeUndefined();
    expect(err.message).toContain("(socket hang up)");
  });

  it("applies to every verb, including the write path", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const err = await captureApiError(client().createPost(CREATE_INPUT));

    expect(err).toBeInstanceOf(LinkHubApiError);
    expect(err.status).toBeUndefined();
  });
});
