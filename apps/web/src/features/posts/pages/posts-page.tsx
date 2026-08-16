import type {
  CreatePostInput,
  Post,
  UpdatePostInput,
} from "@repo/schemas";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  FiChevronRight,
  FiEdit2,
  FiExternalLink,
  FiLock,
  FiPlus,
  FiTrash2,
} from "react-icons/fi";
import { getAuthTokens } from "../../../lib/auth-tokens";
import {
  useCreatePost,
  useDeletePost,
  useMyPosts,
  useUpdatePost,
} from "../../../lib/post-queries";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import {
  LoadingLabel,
  Skeleton,
} from "../../../shared-components/skeleton";
import {
  BADGE,
  SURFACE,
  SURFACE_EMPTY,
  SURFACE_INSET,
} from "../../../shared-components/surface";
import { AttachLinkControl } from "../components/attach-link-control";
import { PostComposerDialog } from "../components/post-composer-dialog";
import { markdownExcerpt } from "../lib/markdown";
import {
  formatPostDate,
  isMachineAuthored,
  selectPendingReview,
  SOURCE_META,
  STATUS_META,
} from "../lib/post-format";

type MutationErrorSource = { isError: boolean; error: unknown };

/** First failing mutation's message, or its fallback copy. */
function resolveMutationError(
  candidates: ReadonlyArray<readonly [MutationErrorSource, string]>,
): string | null {
  const failure = candidates.find(([mutation]) => mutation.isError);

  if (!failure) {
    return null;
  }

  const [mutation, fallback] = failure;

  return mutation.error instanceof Error && mutation.error.message
    ? mutation.error.message
    : fallback;
}

export function PostsPage() {
  const navigate = useNavigate();
  const userInfo = useUserInfoStore((state) => state.userInfo);
  const hasSession = Boolean(getAuthTokens() && userInfo);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);

  useEffect(() => {
    if (!hasSession) {
      navigate({ to: "/" });
    }
  }, [hasSession, navigate]);

  const postsQuery = useMyPosts(hasSession);
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const deletePost = useDeletePost();

  const posts = postsQuery.data ?? [];
  const pendingCount = selectPendingReview(posts).length;

  const openCreate = () => {
    setEditingPost(null);
    setComposerOpen(true);
  };

  const openEdit = (post: Post) => {
    setEditingPost(post);
    setComposerOpen(true);
  };

  const handleSubmit = async (input: CreatePostInput | UpdatePostInput) => {
    if (editingPost) {
      await updatePost.mutateAsync({
        postId: editingPost.id,
        patch: input as UpdatePostInput,
      });
    } else {
      await createPost.mutateAsync(input as CreatePostInput);
    }
  };

  /**
   * Delete has no dialog to report into, so a failure left the card sitting
   * there and delete simply looked broken. Create/update failures are shown
   * inside the composer too; this is the page-level backstop.
   */
  const mutationError = resolveMutationError([
    [createPost, "Could not publish your post."],
    [updatePost, "Could not save your changes."],
    [deletePost, "Could not delete that post. It is still here."],
  ]);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-4 lg:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="anim-grid-bg absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_65%)]" />
        <div className="anim-float absolute -top-20 right-10 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <header className="anim-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="anim-gradient bg-linear-to-r from-violet-600 via-fuchsia-500 to-cyan-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
            Posts
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Write updates, articles and changelog entries. Published posts appear
            in your profile’s Posts block.
          </p>
        </div>
        <Button
          type="button"
          fullWidth={false}
          className="rounded-full"
          onClick={openCreate}
        >
          <FiPlus className="h-4 w-4" aria-hidden="true" />
          New post
        </Button>
      </header>

      {/* Only shown when there is actually something to triage — an always-on
          link to an empty inbox trains people to ignore it. */}
      {pendingCount > 0 ? (
        <Link
          to="/dashboard/posts/review"
          className={`anim-fade-up flex items-center gap-3 px-4 py-3 text-sm transition hover:border-violet-400 dark:hover:border-violet-500/70 ${SURFACE_INSET}`}
        >
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE.warning}`}
          >
            {pendingCount}
          </span>
          <span className="text-zinc-700 dark:text-zinc-200">
            {pendingCount === 1 ? "post is" : "posts are"} waiting for your
            review
          </span>
          <span className="ml-auto inline-flex items-center gap-1 font-medium text-violet-700 dark:text-violet-300">
            Open review queue
            <FiChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </Link>
      ) : null}

      {mutationError ? (
        <FeedbackMessage tone="error" message={mutationError} />
      ) : null}

      {postsQuery.isLoading ? (
        <PostListSkeleton />
      ) : postsQuery.isError ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          Could not load your posts. Please try again.
        </p>
      ) : posts.length === 0 ? (
        <div className={`anim-fade-up p-10 text-center ${SURFACE_EMPTY}`}>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            You haven’t written any posts yet.
          </p>
          <Button
            type="button"
            variant="soft"
            fullWidth={false}
            className="mt-4 rounded-full"
            onClick={openCreate}
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" />
            Write your first post
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {posts.map((post, index) => {
            const source = SOURCE_META[post.source];
            const statusMeta = STATUS_META[post.status];
            const excerpt = markdownExcerpt(post.body, 140);
            return (
              <li
                key={post.id}
                style={{ animationDelay: `${0.05 + index * 0.05}s` }}
                className={`anim-fade-up group flex flex-col overflow-hidden transition duration-300 hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_0_24px_-6px_rgba(139,92,246,0.5)] dark:hover:border-violet-500/70 ${SURFACE}`}
              >
                {post.coverImageUrl ? (
                  <img
                    src={post.coverImageUrl}
                    alt=""
                    loading="lazy"
                    className="h-36 w-full object-cover"
                  />
                ) : null}
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${statusMeta.className}`}
                    >
                      {statusMeta.label}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${source.className}`}
                    >
                      {source.label}
                    </span>
                    <span className="ml-auto text-xs text-zinc-400">
                      {formatPostDate(post.publishedAt ?? post.createdAt)}
                    </span>
                  </div>

                  <div className="flex-1">
                    <h2 className="line-clamp-2 font-semibold text-zinc-900 dark:text-zinc-100">
                      {post.title ?? (excerpt.slice(0, 60) || "Untitled post")}
                    </h2>
                    {post.title ? (
                      <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {excerpt}
                      </p>
                    ) : null}
                  </div>

                  {post.tags && post.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {post.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700 dark:bg-violet-500/10 dark:text-violet-200"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    {/* No Edit for a post the user did not write: the server
                        rejects every content field on it (403), and offering a
                        button that always fails is worse than explaining why
                        there isn't one. Pending ones route to the queue, where
                        the full text and the reason live. */}
                    {post.status === "pending_review" ? (
                      <Link to="/dashboard/posts/review">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          fullWidth={false}
                        >
                          Review
                        </Button>
                      </Link>
                    ) : isMachineAuthored(post.source) ? (
                      // The body is frozen, but `externalUrl` is provenance,
                      // not content — the one field a machine post accepts.
                      <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                        <FiLock className="h-3.5 w-3.5" aria-hidden="true" />
                        Body written by software — you can attach a link
                        {!post.externalUrl ? (
                          <AttachLinkControl post={post} />
                        ) : null}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        fullWidth={false}
                        onClick={() => openEdit(post)}
                      >
                        <FiEdit2 className="h-4 w-4" aria-hidden="true" />
                        Edit
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      fullWidth={false}
                      shouldHaveConfirmation
                      confirmationTitle="Delete post?"
                      confirmationDescription="This permanently removes the post."
                      onClick={() => deletePost.mutate(post.id)}
                    >
                      <FiTrash2 className="h-4 w-4" aria-hidden="true" />
                      Delete
                    </Button>
                    {post.externalUrl ? (
                      <a
                        href={post.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-violet-600 dark:hover:text-violet-300"
                      >
                        <FiExternalLink className="h-4 w-4" aria-hidden="true" />
                        Link
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PostComposerDialog
        open={composerOpen}
        onOpenChange={(open) => {
          setComposerOpen(open);
          if (!open) {
            setEditingPost(null);
          }
        }}
        initialPost={editingPost}
        isSubmitting={createPost.isPending || updatePost.isPending}
        onSubmit={handleSubmit}
      />
    </main>
  );
}

/**
 * Stand-in for the post grid above.
 *
 * Mirrors the real `<li>` card box-for-box: same `grid gap-4 sm:grid-cols-2`
 * wrapper, same card chrome, same internal `gap-3 p-4` stack (badge row →
 * title/excerpt → tags → action footer), and the same line-box heights, so the
 * grid does not reflow when the query resolves.
 *
 * The one thing it cannot mirror is the optional cover image: `coverImageUrl`
 * is per-post and unknowable before the data lands, so the skeleton renders the
 * no-cover variant rather than reserving 144px that most cards won't use.
 */
function PostCardSkeleton() {
  return (
    <li className={`flex flex-col overflow-hidden ${SURFACE}`}>
      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* status pill + source pill + date — matches the badge row */}
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton shape="circle" height={18} width={62} />
          <Skeleton shape="circle" height={18} width={54} />
          <Skeleton shape="text" height={12} width={72} className="ml-auto" />
        </div>

        {/* one 24px title line + two 20px excerpt lines */}
        <div className="flex-1">
          <div className="flex h-6 items-center">
            <Skeleton shape="text" height={14} width="85%" />
          </div>
          <div className="mt-1">
            <div className="flex h-5 items-center">
              <Skeleton shape="text" height={12} width="100%" />
            </div>
            <div className="flex h-5 items-center">
              <Skeleton shape="text" height={12} width="65%" />
            </div>
          </div>
        </div>

        {/* tag chips */}
        <div className="flex flex-wrap gap-1.5">
          <Skeleton shape="circle" height={20} width={58} />
          <Skeleton shape="circle" height={20} width={72} />
          <Skeleton shape="circle" height={20} width={48} />
        </div>

        {/* Edit / Delete — both are `size="sm"`, i.e. h-9 */}
        <div className="flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <Skeleton height={36} width={80} className="rounded-md" />
          <Skeleton height={36} width={92} className="rounded-md" />
        </div>
      </div>
    </li>
  );
}

function PostListSkeleton() {
  return (
    <>
      <LoadingLabel>Loading posts</LoadingLabel>
      <ul className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <PostCardSkeleton key={index} />
        ))}
      </ul>
    </>
  );
}
