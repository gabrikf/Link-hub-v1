import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock("../../../lib/auth-tokens", () => ({
  getAuthTokens: () => ({ accessToken: "x", refreshToken: "y" }),
}));
vi.mock("../../../lib/user-info-store", () => ({
  useUserInfoStore: (selector: (state: unknown) => unknown) =>
    selector({ userInfo: { login: "ada", name: "Ada Lovelace" } }),
}));

const useMyPosts = vi.fn();
vi.mock("../../../lib/post-queries", () => ({
  useMyPosts: () => useMyPosts(),
  useCreatePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePost: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { PostsPage } from "./posts-page";

afterEach(() => {
  useMyPosts.mockReset();
});

describe("PostsPage loading state", () => {
  it("renders skeleton cards instead of a text label while posts load", () => {
    useMyPosts.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<PostsPage />);

    // The bare text loading state is gone.
    expect(container.textContent).not.toContain("Loading posts...");

    // Skeletons are aria-hidden, so the announcement carries the state.
    expect(screen.getByRole("status")).toHaveTextContent("Loading posts");

    // Placeholders live in the same grid the real cards use, so the layout
    // does not reflow when the query resolves.
    const grid = container.querySelector("ul.grid.gap-4");
    expect(grid).not.toBeNull();
    expect(grid).toHaveClass("sm:grid-cols-2");
    expect(grid?.querySelectorAll(":scope > li")).toHaveLength(4);
  });

  it("swaps the skeleton for the real cards once posts arrive", () => {
    useMyPosts.mockReturnValue({
      data: [
        {
          id: "post-1",
          title: "Shipping the layout editor",
          body: "We rebuilt the grid.",
          tags: ["release"],
          status: "published",
          source: "manual",
          coverImageUrl: null,
          externalUrl: null,
          publishedAt: new Date("2026-03-01"),
          createdAt: new Date("2026-03-01"),
        },
      ],
      isLoading: false,
      isError: false,
    });

    const { container } = render(<PostsPage />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.getByText("Shipping the layout editor"),
    ).toBeInTheDocument();

    // Same wrapper, now holding exactly the one real post.
    const grid = container.querySelector("ul.grid.gap-4");
    expect(grid?.querySelectorAll(":scope > li")).toHaveLength(1);
  });

  it("keeps the empty state distinct from the loading state", () => {
    useMyPosts.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<PostsPage />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText(/haven.?t written any posts yet/i)).toBeInTheDocument();
  });
});
