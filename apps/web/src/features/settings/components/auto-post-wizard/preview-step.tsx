import type { DigestPreview, Post } from "@repo/schemas";
import { FiFileText, FiInbox, FiLoader } from "react-icons/fi";
import { SURFACE_INSET } from "../../../../shared-components/surface";
import { Markdown } from "../../../posts/lib/markdown";

/**
 * A REAL post, or an honest explanation of why there is none yet. Never a
 * mocked-up example pretending to be the user's data.
 */

const TEMPLATE_CAPTION =
  "Built from your real activity by a fixed template — no AI, byte-reproducible, nothing here names a repo, employer or teammate.";

export function PreviewPostCard({
  post,
  caption = TEMPLATE_CAPTION,
}: {
  post: { title: string | null; body: string; tags: string[] | null };
  caption?: string;
}) {
  return (
    <div className={`p-4 ${SURFACE_INSET}`}>
      {post.title ? (
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {post.title}
        </h3>
      ) : null}
      <div className="mt-2">
        <Markdown>{post.body}</Markdown>
      </div>
      {post.tags && post.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700 dark:bg-violet-500/10 dark:text-violet-200"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
      <p className="mt-3 border-t border-zinc-200 pt-2 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        {caption}
      </p>
    </div>
  );
}

function EmptyPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/40">
      <p className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
        <FiInbox className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
        {title}
      </p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{children}</p>
    </div>
  );
}

export function ConnectionPreviewBody({
  preview,
  isLoading,
  isError,
}: {
  preview: DigestPreview | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      // `role="status"`: the preview replaces this panel without user input,
      // so the change must be announced.
      <div
        role="status"
        className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-500/30 dark:bg-violet-500/10"
      >
        <p className="flex items-center gap-2.5 text-sm font-medium text-violet-900 dark:text-violet-100">
          <FiLoader
            className="h-4 w-4 shrink-0 animate-spin"
            aria-hidden="true"
          />
          Building your preview from real events…
        </p>
        <div
          aria-hidden="true"
          className="anim-sheen mt-3 h-1.5 rounded-full bg-violet-200/80 dark:bg-violet-500/25"
        />
      </div>
    );
  }

  if (isError || !preview) {
    return (
      <EmptyPanel title="Could not build a preview">
        The preview endpoint did not answer. This does not affect the
        connection — continue, and check the digest from the review queue when
        it is due.
      </EmptyPanel>
    );
  }

  if (preview.status === "ready" && preview.post) {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <FiFileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          What your next digest would say — {preview.eventCount} event
          {preview.eventCount === 1 ? "" : "s"}, {preview.window.from} to{" "}
          {preview.window.to}.
        </p>
        <PreviewPostCard post={preview.post} />
      </div>
    );
  }

  if (preview.status === "no_activity") {
    return (
      <EmptyPanel title="No activity in this window yet">
        Your first digest will wait for evidence — silence over filler. Nothing
        posts until events arrive, so an empty week costs you nothing.
      </EmptyPanel>
    );
  }

  // insufficient_evidence
  return (
    <EmptyPanel title="Events arrived, but none clears the bar yet">
      Digests only make claims they can back: merged pull requests, submitted
      reviews and releases qualify; a lone commit does not. Keep working — the
      digest fills itself in.
    </EmptyPanel>
  );
}

export function McpPreviewBody({ detectedPost }: { detectedPost: Post | null }) {
  if (detectedPost) {
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <FiFileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          The post your agent just wrote:
        </p>
        <PreviewPostCard
          post={{
            title: detectedPost.title,
            body: detectedPost.body,
            tags: detectedPost.tags,
          }}
          caption="Written by your agent from your git history. It waits in the review queue until you approve it."
        />
      </div>
    );
  }

  return (
    <EmptyPanel title="No post detected yet">
      Run the weekly_update prompt in your agent and the post appears in your
      review queue — this wizard does not need to be open for that. Nothing is
      public until you approve it.
    </EmptyPanel>
  );
}
