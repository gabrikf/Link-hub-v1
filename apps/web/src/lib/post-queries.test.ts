import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithTokens = vi.fn();

vi.mock("./auth-api", () => ({
  fetchWithTokens: (path: string, config: unknown) =>
    fetchWithTokens(path, config),
}));

import { fetchPublicPosts } from "./post-queries";
import { CAPTURED_PUBLIC_POSTS_PAYLOAD } from "./public-posts-payload.fixture";

beforeEach(() => {
  fetchWithTokens.mockReset();
});

describe("fetchPublicPosts", () => {
  /**
   * BUG-20260822-public-posts-contract.
   *
   * The public feed is the one artifact this product exists to produce, and a
   * visitor saw "Could not load posts. Please try again." on every profile
   * that had published anything. The api was healthy — HTTP 200, real rows —
   * and the failure was entirely in this function: it parsed the response with
   * a schema that requires `metadata`, a field the public projection drops on
   * purpose (it can hold a repository name).
   *
   * The payload below is captured verbatim from the running api, so this test
   * fails the moment either side of the contract moves again.
   */
  it("parses the real public-feed payload, which carries no `metadata`", async () => {
    fetchWithTokens.mockResolvedValue({ data: CAPTURED_PUBLIC_POSTS_PAYLOAD });

    const posts = await fetchPublicPosts("gabrielkochf");

    expect(posts).toHaveLength(3);
    expect(posts[0]?.title).toBe(
      "Shipped a privacy-first auto-posting pipeline with a setup wizard",
    );
    expect(posts.every((post) => post.status === "published")).toBe(true);
    expect(posts[0]?.publishedAt).toBeInstanceOf(Date);
  });

  it("requests the public route and forwards limit/offset", async () => {
    fetchWithTokens.mockResolvedValue({ data: [] });

    await fetchPublicPosts("gabrielkochf", { limit: 2, offset: 4 });

    expect(fetchWithTokens).toHaveBeenCalledWith(
      "/profile/gabrielkochf/posts?limit=2&offset=4",
      { method: "GET" },
    );
  });

  /**
   * BUG-20260823-handle-slash-breaks-profile.
   *
   * The public posts panel is the fourth reader on the public profile page, and
   * it interpolated the already-decoded handle straight into the path. A handle
   * holding `/`, `?` or `#` therefore reshaped the request — `?` in particular
   * turned the rest of the handle into a query string — and the panel showed
   * its error state on a profile the api serves fine at the encoded path.
   */
  it("encodes a handle that holds path-significant characters", async () => {
    fetchWithTokens.mockResolvedValue({ data: [] });

    await fetchPublicPosts("dev/with?path#chars", { limit: 2 });

    expect(fetchWithTokens).toHaveBeenCalledWith(
      "/profile/dev%2Fwith%3Fpath%23chars/posts?limit=2",
      { method: "GET" },
    );
  });

  /**
   * The other half of the contract: `metadata` is provenance the public feed
   * must never carry. A server that regressed and echoed it back gets it
   * stripped here rather than rendered.
   */
  it("strips `metadata` if a server ever echoes it on the public feed", async () => {
    fetchWithTokens.mockResolvedValue({
      data: [
        {
          id: "9d1f9e0e-1f2a-4c3b-8d4e-5f6a7b8c9d0e",
          userId: "cc8069cd-b1d1-49be-99b7-22cb8dbaf28f",
          source: "commit",
          title: null,
          body: "published",
          coverImageUrl: null,
          images: null,
          tags: null,
          status: "published",
          externalUrl: null,
          metadata: { repo: "acme-internal-billing" },
          createdAt: "2026-08-15T18:42:59.556Z",
          updatedAt: "2026-08-15T18:42:59.556Z",
          publishedAt: "2026-08-15T18:42:59.556Z",
        },
      ],
    });

    const posts = await fetchPublicPosts("gabrielkochf");

    expect(posts).toHaveLength(1);
    expect(posts[0]).not.toHaveProperty("metadata");
  });
});
