import type { Post, ProfileLayout } from "@repo/schemas";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// PostsBlock is rendered internally by ProfileBlocks for a "posts" block.
// It reads its data from usePublicPosts, which we mock here.
const usePublicPosts = vi.fn();
vi.mock("../../../lib/post-queries", () => ({
  usePublicPosts: (...args: unknown[]) => usePublicPosts(...args),
}));

import { ProfileBlocks } from "./profile-blocks";

const profile = {
  name: "Ada Lovelace",
  username: "ada",
  description: null,
  userPhoto: null,
};

const makePost = (overrides: Partial<Post>): Post =>
  ({
    id: "post-1",
    userId: "user-1",
    source: "manual",
    title: "First post",
    body: "Body text",
    coverImageUrl: null,
    images: null,
    tags: null,
    status: "published",
    externalUrl: null,
    metadata: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    publishedAt: new Date("2026-01-01"),
    ...overrides,
  }) as Post;

const postsLayout = (limit?: number): ProfileLayout => ({
  tabs: [{ id: "tab-1", title: "One", order: 0 }],
  blocks: [
    {
      id: "posts-block",
      groupId: "posts-group",
      kind: "posts",
      tabId: "tab-1",
      gridX: 0,
      gridY: 0,
      gridW: 12,
      gridH: 4,
      isVisible: true,
      pinnedAllTabs: false,
      config: limit === undefined ? null : { limit },
    },
  ],
});

const renderPostsBlock = (limit?: number) =>
  render(
    <ProfileBlocks
      layout={postsLayout(limit)}
      viewport="pc"
      profile={profile}
      links={[]}
      resume={null}
      workExperiences={[]}
    />,
  );

afterEach(() => usePublicPosts.mockReset());

describe("PostsBlock", () => {
  it("renders post cards from the query data", () => {
    usePublicPosts.mockReturnValue({
      data: [
        makePost({ id: "a", title: "Alpha post" }),
        makePost({ id: "b", title: "Beta post" }),
      ],
      isLoading: false,
      isError: false,
    });

    renderPostsBlock();

    expect(screen.getByText("Alpha post")).toBeInTheDocument();
    expect(screen.getByText("Beta post")).toBeInTheDocument();
  });

  it("shows the error state (not the empty state) when the query errors", () => {
    usePublicPosts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderPostsBlock();

    expect(
      screen.getByText(/could not load posts/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no posts published yet/i),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no posts", () => {
    usePublicPosts.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    renderPostsBlock();

    expect(screen.getByText(/no posts published yet/i)).toBeInTheDocument();
  });

  it("respects the configured limit and only renders that many cards", () => {
    usePublicPosts.mockReturnValue({
      data: [
        makePost({ id: "a", title: "Kept post" }),
        makePost({ id: "b", title: "Dropped post" }),
      ],
      isLoading: false,
      isError: false,
    });

    renderPostsBlock(1);

    expect(screen.getByText("Kept post")).toBeInTheDocument();
    expect(screen.queryByText("Dropped post")).not.toBeInTheDocument();
  });
});
