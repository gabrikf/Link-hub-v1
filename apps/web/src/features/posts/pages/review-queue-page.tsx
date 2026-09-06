import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FiArrowLeft, FiInbox, FiLock } from "react-icons/fi";
import { getAuthTokens } from "../../../lib/auth-tokens";
import {
  useApprovePost,
  useDeletePost,
  useMyPosts,
} from "../../../lib/post-queries";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import {
  SURFACE_EMPTY,
  SURFACE_INSET,
} from "../../../shared-components/surface";
import { ReviewQueueItem } from "../components/review-queue-item";
import { ReviewQueueSkeleton } from "../components/review-queue-skeleton";
import { selectPendingReview } from "../lib/post-format";

/**
 * The message for a rolled-back optimistic mutation: the server's own message
 * when it sent one, else the generic fallback. `null` while the mutation is
 * fine, so the two queue mutations can be tried in order with `??`.
 */
function resolveMutationErrorMessage(
  mutation: { isError: boolean; error: unknown },
  fallback: string,
): string | null {
  if (!mutation.isError) {
    return null;
  }
  return mutation.error instanceof Error && mutation.error.message
    ? mutation.error.message
    : fallback;
}

/**
 * The review queue for software-written posts.
 *
 * Its own route rather than a tab on the posts page because the two surfaces
 * answer different questions with different layouts: the posts page is a
 * two-column grid of excerpts for *managing* everything the user has written,
 * while reviewing means reading each post end-to-end before consenting to it —
 * one column, full body, two decisions. It sits under `/dashboard/posts` so the
 * existing `startsWith("/dashboard/posts")` nav rule keeps Posts highlighted
 * and no seventh top-bar icon is needed; the posts page links here, with a
 * count, only when something is actually waiting.
 */
export function ReviewQueuePage() {
  const { t } = useTranslation();
  const userInfo = useUserInfoStore((state) => state.userInfo);
  const hasSession = Boolean(getAuthTokens() && userInfo);

  const postsQuery = useMyPosts(hasSession);
  const approvePost = useApprovePost();
  const deletePost = useDeletePost();

  const pending = selectPendingReview(postsQuery.data ?? []);

  // Approve and delete are optimistic, so a failure has already taken the card
  // off screen and put it back. Without this the rollback looks like a glitch.
  const mutationError =
    resolveMutationErrorMessage(approvePost, t("posts.approveFailed")) ??
    resolveMutationErrorMessage(deletePost, t("posts.deleteFailed"));

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-4 lg:p-8">
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
            {t("posts.reviewQueue")}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("posts.reviewQueueSubtitle")}
          </p>
        </div>
        <Link to="/dashboard/posts">
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            className="rounded-full"
          >
            <FiArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("posts.allPosts")}
          </Button>
        </Link>
      </header>

      {/* Requirement 4: why there is no Edit button, said once, in one line. */}
      <p
        className={`anim-fade-up flex items-start gap-2 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 ${SURFACE_INSET}`}
      >
        <FiLock
          className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400"
          aria-hidden="true"
        />
        <span>{t("posts.lockedBody")}</span>
      </p>

      {mutationError ? (
        <FeedbackMessage tone="error" message={mutationError} />
      ) : null}

      {postsQuery.isLoading ? (
        <ReviewQueueSkeleton />
      ) : postsQuery.isError ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          {t("posts.reviewQueueLoadFailed")}
        </p>
      ) : pending.length === 0 ? (
        <div className={`anim-fade-up p-10 text-center ${SURFACE_EMPTY}`}>
          <FiInbox
            className="mx-auto h-8 w-8 text-zinc-400"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            {t("posts.nothingWaiting")}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {t("posts.nothingWaitingHelp")}
          </p>
        </div>
      ) : (
        <ul className="grid gap-4">
          {pending.map((post) => (
            <ReviewQueueItem
              key={post.id}
              post={post}
              isApproving={
                approvePost.isPending && approvePost.variables === post.id
              }
              isDeleting={
                deletePost.isPending && deletePost.variables === post.id
              }
              onApprove={approvePost.mutate}
              onDelete={deletePost.mutate}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
