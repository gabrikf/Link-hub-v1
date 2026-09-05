import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertDefined } from "../../../test-support/assert-defined";

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
const approveMutate = vi.fn();
const deleteMutate = vi.fn();
const updateMutateAsync = vi.fn();

vi.mock("../../../lib/post-queries", () => ({
  useMyPosts: () => useMyPosts(),
  useApprovePost: () => ({
    mutate: approveMutate,
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
  }),
  useDeletePost: () => ({
    mutate: deleteMutate,
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
  }),
  // Consumed by the AttachLinkControl rendered on machine-authored rows.
  useUpdatePost: () => ({
    mutateAsync: updateMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

import { ReviewQueuePage } from "./review-queue-page";

const pendingCommitPost = {
  id: "pending-1",
  userId: "user-1",
  title: "crafthub-v.1 — weekly update",
  body: "Shipped the **review queue** this week.",
  tags: ["changelog"],
  status: "pending_review",
  source: "commit",
  metadata: { repo: "crafthub-v.1", commitCount: 12, period: "weekly" },
  coverImageUrl: null,
  images: null,
  externalUrl: null,
  publishedAt: null,
  createdAt: new Date("2026-03-02"),
  updatedAt: new Date("2026-03-02"),
};

const olderPendingPost = {
  ...pendingCommitPost,
  id: "pending-0",
  title: "An older generated post",
  body: "Older text.",
  metadata: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const publishedPost = {
  ...pendingCommitPost,
  id: "published-1",
  title: "Already public",
  body: "Public text.",
  status: "published",
  publishedAt: new Date("2026-02-01"),
};

const draftPost = {
  ...pendingCommitPost,
  id: "draft-1",
  title: "My own draft",
  body: "Draft text.",
  status: "draft",
  source: "manual",
  metadata: null,
};

beforeEach(() => {
  useMyPosts.mockReturnValue({
    data: [publishedPost, draftPost, olderPendingPost, pendingCommitPost],
    isLoading: false,
    isError: false,
  });
});

afterEach(() => {
  useMyPosts.mockReset();
  approveMutate.mockReset();
  deleteMutate.mockReset();
  updateMutateAsync.mockReset();
});

describe("ReviewQueuePage", () => {
  it("lists only pending_review posts, newest first", () => {
    render(<ReviewQueuePage />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);

    // Neither the published post nor the user's own draft belongs in a queue
    // of "software wrote this, do you consent".
    expect(screen.queryByText("Already public")).not.toBeInTheDocument();
    expect(screen.queryByText("My own draft")).not.toBeInTheDocument();

    expect(items[0]).toHaveTextContent("crafthub-v.1 — weekly update");
    expect(items[1]).toHaveTextContent("An older generated post");
  });

  it("shows provenance, metadata facts, the rendered body and the created date", () => {
    render(<ReviewQueuePage />);

    const [item] = screen.getAllByRole("listitem");
    assertDefined(item, "the first review-queue item");

    expect(item).toHaveTextContent(
      "Generated from your commit activity in crafthub-v.1",
    );
    expect(item).toHaveTextContent("Pending review");

    // metadata the MCP commit flow carries, labelled rather than raw
    expect(within(item).getByText("Repository")).toBeInTheDocument();
    expect(within(item).getByText("Commits")).toBeInTheDocument();
    expect(within(item).getByText("12")).toBeInTheDocument();
    expect(within(item).getByText("Period")).toBeInTheDocument();
    expect(within(item).getByText("weekly")).toBeInTheDocument();

    // Body goes through the shared markdown renderer, not a raw dump.
    expect(within(item).getByText("review queue").tagName).toBe("STRONG");

    expect(item).toHaveTextContent(/Created/);
  });

  it("renders no edit control for a machine-authored post, and says why", () => {
    render(<ReviewQueuePage />);

    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.getByText(/published exactly as generated/i),
    ).toBeInTheDocument();
  });

  it("attaches an external link to a machine post via the update mutation", async () => {
    const user = userEvent.setup();
    updateMutateAsync.mockResolvedValue({});
    render(<ReviewQueuePage />);

    const [item] = screen.getAllByRole("listitem");
    assertDefined(item, "the first review-queue item");
    await user.click(within(item).getByRole("button", { name: /add link/i }));

    const field = within(item).getByLabelText("Link URL");
    await user.type(field, "https://github.com/ada/crafthub/pull/42");
    await user.click(within(item).getByRole("button", { name: /save/i }));

    // The body stays frozen; the link is the ONE field a machine post accepts.
    expect(updateMutateAsync).toHaveBeenCalledWith({
      postId: "pending-1",
      patch: { externalUrl: "https://github.com/ada/crafthub/pull/42" },
    });
  });

  it("rejects a non-http(s) link before calling the mutation", async () => {
    const user = userEvent.setup();
    render(<ReviewQueuePage />);

    const [item] = screen.getAllByRole("listitem");
    assertDefined(item, "the first review-queue item");
    await user.click(within(item).getByRole("button", { name: /add link/i }));
    await user.type(within(item).getByLabelText("Link URL"), "not-a-url");
    await user.click(within(item).getByRole("button", { name: /save/i }));

    expect(updateMutateAsync).not.toHaveBeenCalled();
    expect(
      within(item).getByText(/enter a full http\(s\) url/i),
    ).toBeInTheDocument();
  });

  it("approves a post through the approve mutation", async () => {
    const user = userEvent.setup();
    render(<ReviewQueuePage />);

    const [item] = screen.getAllByRole("listitem");
    assertDefined(item, "the first review-queue item");
    await user.click(
      within(item).getByRole("button", { name: /approve & publish/i }),
    );

    // The queue filters on status, so the optimistic flip to `published` in
    // `useApprovePost` is what removes the card — see post-queries.test.ts.
    expect(approveMutate).toHaveBeenCalledTimes(1);
    expect(approveMutate).toHaveBeenCalledWith("pending-1");
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("asks for confirmation before deleting", async () => {
    const user = userEvent.setup();
    render(<ReviewQueuePage />);

    const [item] = screen.getAllByRole("listitem");
    assertDefined(item, "the first review-queue item");
    await user.click(within(item).getByRole("button", { name: /delete/i }));

    // The click alone must not destroy anything.
    expect(deleteMutate).not.toHaveBeenCalled();

    const confirmation = await screen.findByRole("alertdialog");
    expect(confirmation).toHaveTextContent("Delete this post?");

    await user.click(
      within(confirmation).getByRole("button", { name: /confirm/i }),
    );

    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate).toHaveBeenCalledWith("pending-1");
  });

  it("renders the skeleton, not a text label, while the queue loads", () => {
    useMyPosts.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(<ReviewQueuePage />);

    expect(container.textContent).not.toContain("Loading...");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading posts waiting for review",
    );
    expect(container.querySelectorAll(".anim-sheen").length).toBeGreaterThan(0);

    // No decision can be offered over a placeholder.
    expect(
      screen.queryByRole("button", { name: /approve & publish/i }),
    ).toBeNull();
  });

  it("shows an empty state when nothing is waiting", () => {
    useMyPosts.mockReturnValue({
      data: [publishedPost, draftPost],
      isLoading: false,
      isError: false,
    });

    render(<ReviewQueuePage />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.getByText(/nothing is waiting for review/i),
    ).toBeInTheDocument();
  });
});
