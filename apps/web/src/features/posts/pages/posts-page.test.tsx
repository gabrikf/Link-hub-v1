import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
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

  it("keeps a pending_review post visually distinct from a draft", () => {
    useMyPosts.mockReturnValue({
      data: [
        {
          id: "draft-1",
          title: "A parked draft",
          body: "Half-written.",
          tags: null,
          status: "draft",
          source: "manual",
          metadata: null,
          coverImageUrl: null,
          externalUrl: null,
          publishedAt: null,
          createdAt: new Date("2026-03-01"),
        },
        {
          id: "pending-1",
          title: "Generated weekly update",
          body: "Shipped the review queue.",
          tags: null,
          status: "pending_review",
          source: "commit",
          metadata: { repo: "crafthub-v.1" },
          coverImageUrl: null,
          externalUrl: null,
          publishedAt: null,
          createdAt: new Date("2026-03-02"),
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<PostsPage />);

    // Two different labels, not one shared "not published yet" bucket.
    const draftBadge = screen.getByText("Draft");
    const pendingBadge = screen.getByText("Pending review");
    expect(draftBadge.className).not.toBe(pendingBadge.className);

    // ...and the queue is reachable from here, with a count.
    const queueLink = screen.getByRole("link", { name: /open review queue/i });
    expect(queueLink).toHaveAttribute("href", "/dashboard/posts/review");
    expect(queueLink).toHaveTextContent("1");
    expect(queueLink).toHaveTextContent(/post is waiting for your review/i);
  });

  it("offers no edit control for a machine-authored post", () => {
    useMyPosts.mockReturnValue({
      data: [
        {
          id: "manual-1",
          title: "Hand-written",
          body: "I typed this.",
          tags: null,
          status: "published",
          source: "manual",
          metadata: null,
          coverImageUrl: null,
          externalUrl: null,
          publishedAt: new Date("2026-03-01"),
          createdAt: new Date("2026-03-01"),
        },
        {
          id: "commit-1",
          title: "Generated changelog",
          body: "Software wrote this.",
          tags: null,
          status: "published",
          source: "commit",
          metadata: { repo: "crafthub-v.1" },
          coverImageUrl: null,
          externalUrl: null,
          publishedAt: new Date("2026-03-02"),
          createdAt: new Date("2026-03-02"),
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<PostsPage />);

    // Exactly one Edit button — the manual post's. The generated one explains
    // itself instead of offering a control the API would reject with a 403,
    // and offers the ONE field a machine post accepts: an external link.
    expect(screen.getAllByRole("button", { name: /^edit$/i })).toHaveLength(1);
    expect(
      screen.getByText(/body written by software — you can attach a link/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add link/i }),
    ).toBeInTheDocument();
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
