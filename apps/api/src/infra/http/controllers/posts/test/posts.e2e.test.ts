/**
 * E2E tests for the Posts HTTP API.
 *
 * These run against a fully DB-free Fastify app built by `buildTestApp()`:
 * in-memory repositories + real (hermetic) token/JWT providers are registered
 * into the tsyringe container, and the real controllers, zod validation and
 * guards run end-to-end via `app.inject()`. No Postgres, Redis or OpenAI.
 */
import { publicPostSchema } from "@repo/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makePost } from "../../../../../core/entity/post/post-test-factory.js";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("Posts E2E (JWT session)", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function authedUser() {
    const user = await ctx.seedUser();
    const token = await ctx.signJwt(user.id);
    return { user, token };
  }

  it("creates a post (201) and forces source to 'manual' for a JWT session even if body says 'commit'", async () => {
    const { user, token } = await authedUser();

    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/posts",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: "# Hello", source: "commit" }),
    });

    expect(response.statusCode).toBe(201);
    const post = response.json();
    expect(post.body).toBe("# Hello");
    // A JWT session may not spoof provenance.
    expect(post.source).toBe("manual");
    expect(post.status).toBe("published");
    expect(post.userId).toBe(user.id);
    expect(post.publishedAt).not.toBeNull();
  });

  it("lists my posts including drafts", async () => {
    const { user, token } = await authedUser();

    await ctx.postsRepository.create(
      makePost({
        userId: user.id,
        source: "manual",
        body: "published one",
        status: "published",
        publishedAt: new Date(),
      }),
    );
    await ctx.postsRepository.create(
      makePost({
        userId: user.id,
        source: "manual",
        body: "draft one",
        status: "draft",
      }),
    );

    const response = await ctx.app.inject({
      method: "GET",
      url: "/me/posts",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const posts = response.json();
    expect(posts).toHaveLength(2);
    expect(posts.map((p: { status: string }) => p.status).sort()).toEqual([
      "draft",
      "published",
    ]);
  });

  it("gets, patches and deletes the caller's own post (2xx)", async () => {
    const { user, token } = await authedUser();
    const post = makePost({
      userId: user.id,
      source: "manual",
      body: "original",
      status: "draft",
    });
    await ctx.postsRepository.create(post);

    const getResponse = await ctx.app.inject({
      method: "GET",
      url: `/me/posts/${post.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().id).toBe(post.id);

    const patchResponse = await ctx.app.inject({
      method: "PATCH",
      url: `/me/posts/${post.id}`,
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: "published", title: "Shipped" }),
    });
    expect(patchResponse.statusCode).toBe(200);
    const patched = patchResponse.json();
    expect(patched.status).toBe("published");
    expect(patched.title).toBe("Shipped");
    expect(patched.publishedAt).not.toBeNull();

    const deleteResponse = await ctx.app.inject({
      method: "DELETE",
      url: `/me/posts/${post.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({ success: true });
  });

  it("returns 403 when patching or deleting someone else's post", async () => {
    const { token } = await authedUser();
    const otherUser = await ctx.seedUser();
    const foreignPost = makePost({
      userId: otherUser.id,
      source: "manual",
      body: "not yours",
      status: "published",
      publishedAt: new Date(),
    });
    await ctx.postsRepository.create(foreignPost);

    const patchResponse = await ctx.app.inject({
      method: "PATCH",
      url: `/me/posts/${foreignPost.id}`,
      headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: "hijacked" }),
    });
    expect(patchResponse.statusCode).toBe(403);

    const deleteResponse = await ctx.app.inject({
      method: "DELETE",
      url: `/me/posts/${foreignPost.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleteResponse.statusCode).toBe(403);

    const getResponse = await ctx.app.inject({
      method: "GET",
      url: `/me/posts/${foreignPost.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getResponse.statusCode).toBe(403);
  });

  describe("machine-authored posts: review, approve, never edit", () => {
    async function seedPendingReviewPost(userId: string) {
      const post = makePost({
        userId,
        source: "commit",
        title: "Weekly update",
        body: "written by software",
        status: "pending_review",
        publishedAt: null,
      });
      await ctx.postsRepository.create(post);
      return post;
    }

    it("accepts status='pending_review' on create and keeps publishedAt null", async () => {
      const { token } = await authedUser();

      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: "awaiting review", status: "pending_review" }),
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().status).toBe("pending_review");
      expect(response.json().publishedAt).toBeNull();
    });

    it("returns 403 when patching the CONTENT of a machine-authored post", async () => {
      const { user, token } = await authedUser();
      const post = await seedPendingReviewPost(user.id);

      const response = await ctx.app.inject({
        method: "PATCH",
        url: `/me/posts/${post.id}`,
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: "polished by the candidate" }),
      });

      expect(response.statusCode).toBe(403);
      const stored = await ctx.postsRepository.findById(post.id);
      expect(stored!.body).toBe("written by software");
    });

    it("approves a pending_review post (200) and publishes it verbatim", async () => {
      const { user, token } = await authedUser();
      const post = await seedPendingReviewPost(user.id);

      const response = await ctx.app.inject({
        method: "POST",
        url: `/me/posts/${post.id}/approve`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const approved = response.json();
      expect(approved.status).toBe("published");
      expect(approved.publishedAt).not.toBeNull();
      expect(approved.body).toBe("written by software");
    });

    it("keeps a pending_review post out of the public feed until it is approved", async () => {
      const author = await ctx.seedUser({ login: "reviewer" });
      const token = await ctx.signJwt(author.id);
      const post = await seedPendingReviewPost(author.id);

      const before = await ctx.app.inject({
        method: "GET",
        url: "/profile/reviewer/posts",
      });
      expect(before.json()).toHaveLength(0);

      await ctx.app.inject({
        method: "POST",
        url: `/me/posts/${post.id}/approve`,
        headers: { authorization: `Bearer ${token}` },
      });

      const after = await ctx.app.inject({
        method: "GET",
        url: "/profile/reviewer/posts",
      });
      expect(after.json()).toHaveLength(1);
    });

    it("returns 403 when approving someone else's post", async () => {
      const { token } = await authedUser();
      const otherUser = await ctx.seedUser();
      const foreignPost = await seedPendingReviewPost(otherUser.id);

      const response = await ctx.app.inject({
        method: "POST",
        url: `/me/posts/${foreignPost.id}/approve`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it("returns 401 when approving without a token", async () => {
      const { user } = await authedUser();
      const post = await seedPendingReviewPost(user.id);

      const response = await ctx.app.inject({
        method: "POST",
        url: `/me/posts/${post.id}/approve`,
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 400 when un-publishing a post via PATCH", async () => {
      const { user, token } = await authedUser();
      const post = makePost({
        userId: user.id,
        source: "manual",
        body: "public",
        status: "published",
        publishedAt: new Date(),
      });
      await ctx.postsRepository.create(post);

      const response = await ctx.app.inject({
        method: "PATCH",
        url: `/me/posts/${post.id}`,
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "draft" }),
      });

      expect(response.statusCode).toBe(400);
    });
  });

  it("returns 404 when getting a missing (but well-formed) post id", async () => {
    const { token } = await authedUser();
    const missingId = crypto.randomUUID();

    const response = await ctx.app.inject({
      method: "GET",
      url: `/me/posts/${missingId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 401 when no Authorization header is present", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/me/posts",
    });
    expect(response.statusCode).toBe(401);
  });

  describe("body validation (zod bounds)", () => {
    it("rejects a create with a missing body (400)", async () => {
      const { token } = await authedUser();

      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: "no body here" }),
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects an over-long body (> 20000 chars) with 400", async () => {
      const { token } = await authedUser();

      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: "x".repeat(20001) }),
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects too many tags (> 20) with 400", async () => {
      const { token } = await authedUser();

      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({
          body: "valid",
          tags: Array.from({ length: 21 }, (_, i) => `tag-${i}`),
        }),
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects too many images (> 12) with 400", async () => {
      const { token } = await authedUser();

      const response = await ctx.app.inject({
        method: "POST",
        url: "/me/posts",
        headers: { ...JSON_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify({
          body: "valid",
          images: Array.from(
            { length: 13 },
            (_, i) => `https://cdn.example.com/${i}.png`,
          ),
        }),
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

describe("Public feed E2E — GET /profile/:username/posts (no auth)", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it("returns only PUBLISHED posts, excludes drafts, and needs no auth", async () => {
    const author = await ctx.seedUser({ login: "author" });

    await ctx.postsRepository.create(
      makePost({
        userId: author.id,
        source: "manual",
        body: "published",
        status: "published",
        publishedAt: new Date("2024-03-01"),
      }),
    );
    await ctx.postsRepository.create(
      makePost({
        userId: author.id,
        source: "manual",
        body: "draft",
        status: "draft",
      }),
    );

    const response = await ctx.app.inject({
      method: "GET",
      url: "/profile/author/posts",
    });

    expect(response.statusCode).toBe(200);
    const posts = response.json();
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toBe("published");
    expect(
      posts.every((p: { status: string }) => p.status === "published"),
    ).toBe(true);
  });

  it("never serves post metadata publicly — it can hold a repository name", async () => {
    const author = await ctx.seedUser({ login: "author" });

    await ctx.postsRepository.create(
      makePost({
        userId: author.id,
        // A commit-summary post: the one writer that fills metadata, because a
        // coding agent supplies it rather than the deterministic template.
        source: "commit",
        body: "published",
        status: "published",
        publishedAt: new Date("2024-03-01"),
        metadata: {
          repo: "acme-internal-billing",
          commitCount: 12,
          period: "weekly",
        },
      }),
    );

    const response = await ctx.app.inject({
      method: "GET",
      url: "/profile/author/posts",
    });

    expect(response.statusCode).toBe(200);
    const [post] = response.json();
    expect(post.body).toBe("published");
    expect(post).not.toHaveProperty("metadata");
    // The strong assertion: the repo name must not appear ANYWHERE in the
    // public payload, whatever shape a future projection gives it.
    expect(response.body).not.toContain("acme-internal-billing");
  });

  /**
   * The other half of BUG-20260822-public-posts-contract.
   *
   * `apps/web/src/lib/post-queries.test.ts` proves the web parses a captured
   * payload; this proves the payload the route emits TODAY is the one that
   * schema accepts. Without it, a later change to the projection would only
   * surface as an error state on a real profile.
   */
  it("emits exactly what the web parses the public feed with", async () => {
    const author = await ctx.seedUser({ login: "author" });

    await ctx.postsRepository.create(
      makePost({
        userId: author.id,
        source: "commit",
        body: "published",
        status: "published",
        publishedAt: new Date("2024-03-01"),
        metadata: { repo: "acme-internal-billing", commitCount: 12 },
      }),
    );

    const response = await ctx.app.inject({
      method: "GET",
      url: "/profile/author/posts",
    });

    expect(response.statusCode).toBe(200);
    const parsed = publicPostSchema.array().safeParse(response.json());
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it("respects limit and offset", async () => {
    const author = await ctx.seedUser({ login: "author" });
    for (let i = 1; i <= 3; i++) {
      await ctx.postsRepository.create(
        makePost({
          userId: author.id,
        source: "manual",
          body: `post-${i}`,
          status: "published",
          publishedAt: new Date(`2024-03-0${i}`),
        }),
      );
    }

    const firstPage = await ctx.app.inject({
      method: "GET",
      url: "/profile/author/posts?limit=2&offset=0",
    });
    expect(firstPage.statusCode).toBe(200);
    expect(firstPage.json().map((p: { body: string }) => p.body)).toEqual([
      "post-3",
      "post-2",
    ]);

    const secondPage = await ctx.app.inject({
      method: "GET",
      url: "/profile/author/posts?limit=2&offset=2",
    });
    expect(secondPage.json().map((p: { body: string }) => p.body)).toEqual([
      "post-1",
    ]);
  });

  it("returns 404 for an unknown username", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/profile/ghost/posts",
    });
    expect(response.statusCode).toBe(404);
  });
});

/**
 * BUG-20260822-agent-self-publish.
 *
 * The review queue tells the user "nothing here is public until you approve
 * it", and the approve route's own description calls itself the only way a
 * machine-authored post becomes public. Both promises are about WHO releases
 * the post, so they have to be enforced against the credential, not the tool:
 * an agent holding the user's PAT must not be able to release its own post,
 * either by PATCHing the status or by calling the approve route itself.
 */
describe("Posts E2E (PAT) — releasing a post from review", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  /** Mints a real PAT through the real create-token route. */
  async function mintPat(jwt: string) {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/tokens",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        name: "agent",
        scopes: ["posts:read", "posts:write", "profile:read"],
      }),
    });
    return response.json().token as string;
  }

  async function agentSession(login = "agent-author") {
    const user = await ctx.seedUser({ login });
    const token = await ctx.signJwt(user.id);
    const pat = await mintPat(token);
    return { user, token, pat };
  }

  /** Creates a post the agent itself put up for review, over the PAT. */
  async function createPendingReviewPost(pat: string) {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/me/posts",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify({
        source: "mcp",
        body: "Shipped the checkout rewrite.",
        status: "pending_review",
      }),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe("pending_review");
    return response.json().id as string;
  }

  it("returns 403 when a PAT PATCHes its own pending_review post to published", async () => {
    const { pat } = await agentSession();
    const postId = await createPendingReviewPost(pat);

    const response = await ctx.app.inject({
      method: "PATCH",
      url: `/me/posts/${postId}`,
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify({ status: "published" }),
    });

    expect(response.statusCode).toBe(403);
    const stored = await ctx.postsRepository.findById(postId);
    expect(stored!.status).toBe("pending_review");
    expect(stored!.publishedAt).toBeNull();
  });

  it("returns 403 when a PAT calls the approve route on its own post", async () => {
    const { pat } = await agentSession();
    const postId = await createPendingReviewPost(pat);

    const response = await ctx.app.inject({
      method: "POST",
      url: `/me/posts/${postId}/approve`,
      headers: { authorization: `Bearer ${pat}` },
    });

    expect(response.statusCode).toBe(403);
    const stored = await ctx.postsRepository.findById(postId);
    expect(stored!.status).toBe("pending_review");
  });

  it("keeps the post out of the anonymous public feed after both attempts", async () => {
    const { user, pat } = await agentSession("feed-check");
    const postId = await createPendingReviewPost(pat);

    await ctx.app.inject({
      method: "PATCH",
      url: `/me/posts/${postId}`,
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify({ status: "published" }),
    });
    await ctx.app.inject({
      method: "POST",
      url: `/me/posts/${postId}/approve`,
      headers: { authorization: `Bearer ${pat}` },
    });

    const feed = await ctx.app.inject({
      method: "GET",
      url: `/profile/${user.login}/posts`,
    });

    expect(feed.statusCode).toBe(200);
    expect(feed.json()).toHaveLength(0);
  });

  it("still lets the human approve the same post in a real session (200)", async () => {
    const { token, pat } = await agentSession();
    const postId = await createPendingReviewPost(pat);

    const response = await ctx.app.inject({
      method: "POST",
      url: `/me/posts/${postId}/approve`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("published");
    expect(response.json().body).toBe("Shipped the checkout rewrite.");
  });

  it("still lets a PAT publish its own draft (200) — a draft awaits nobody", async () => {
    const { pat } = await agentSession();

    const created = await ctx.app.inject({
      method: "POST",
      url: "/me/posts",
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify({
        source: "mcp",
        body: "A draft the agent parked.",
        status: "draft",
      }),
    });
    expect(created.statusCode).toBe(201);

    const response = await ctx.app.inject({
      method: "PATCH",
      url: `/me/posts/${created.json().id}`,
      headers: { ...JSON_HEADERS, authorization: `Bearer ${pat}` },
      body: JSON.stringify({ status: "published" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("published");
  });
});
