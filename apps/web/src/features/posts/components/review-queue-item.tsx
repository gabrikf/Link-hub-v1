import type { Post } from "@repo/schemas";
import { useTranslation } from "react-i18next";
import { FiCheck, FiExternalLink, FiLock, FiTrash2 } from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import { SURFACE, SURFACE_INSET } from "../../../shared-components/surface";
import { Markdown } from "../lib/markdown";
import {
  describePostProvenance,
  formatPostDate,
  isMachineAuthored,
  postMetadataFacts,
  SOURCE_META,
  STATUS_META,
} from "../lib/post-format";
import { AttachLinkControl } from "./attach-link-control";

type ReviewQueueItemProps = {
  post: Post;
  isApproving?: boolean;
  isDeleting?: boolean;
  onApprove: (postId: string) => void;
  onDelete: (postId: string) => void;
};

/**
 * One post awaiting the author's decision.
 *
 * Deliberately renders the FULL body rather than an excerpt: approving is
 * consent to the exact text, and the content is frozen from then on, so there
 * is no "publish now, fix the wording later". There is no Edit control here by
 * design — see `posts.lockedBody`, surfaced once at the top of the queue.
 */
export function ReviewQueueItem({
  post,
  isApproving = false,
  isDeleting = false,
  onApprove,
  onDelete,
}: ReviewQueueItemProps) {
  const { t } = useTranslation();
  const status = STATUS_META[post.status];
  const source = SOURCE_META[post.source];
  const facts = postMetadataFacts(post.metadata);

  return (
    <li className={`anim-fade-up flex flex-col ${SURFACE}`}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${status.className}`}
          >
            {status.label}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${source.className}`}
          >
            {source.label}
          </span>
          <span className="ml-auto text-xs text-zinc-400">
            {t("posts.createdOn", { date: formatPostDate(post.createdAt) })}
          </span>
        </div>

        <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <FiLock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {describePostProvenance(post)}
        </p>

        {post.title ? (
          <h2 className="text-lg font-semibold leading-7 text-zinc-900 dark:text-zinc-100">
            {post.title}
          </h2>
        ) : null}

        <Markdown>{post.body}</Markdown>

        {facts.length > 0 ? (
          <dl className={`flex flex-wrap gap-x-6 gap-y-2 px-3 py-2 ${SURFACE_INSET}`}>
            {facts.map((fact) => (
              <div key={fact.key} className="flex items-baseline gap-1.5">
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  {fact.label}
                </dt>
                <dd className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {post.tags && post.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
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

        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <Button
            type="button"
            size="sm"
            fullWidth={false}
            isLoading={isApproving}
            loadingLabel={t("common.publishing")}
            onClick={() => onApprove(post.id)}
          >
            <FiCheck className="h-4 w-4" aria-hidden="true" />
            {t("posts.approveAndPublish")}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            fullWidth={false}
            isLoading={isDeleting}
            loadingLabel={t("common.deleting")}
            shouldHaveConfirmation
            confirmationTitle={t("posts.deleteThisPost")}
            confirmationDescription={t("posts.deleteMachineWritten")}
            onClick={() => onDelete(post.id)}
          >
            <FiTrash2 className="h-4 w-4" aria-hidden="true" />
            {t("common.delete")}
          </Button>
          {post.externalUrl ? (
            <a
              href={post.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-violet-600 dark:hover:text-violet-300"
            >
              <FiExternalLink className="h-4 w-4" aria-hidden="true" />
              {t("common.link")}
            </a>
          ) : isMachineAuthored(post.source) ? (
            // The single mutable field on a generated post: the body stays
            // frozen, but a link to the PR/release it describes may be
            // attached before (or after) approval.
            <div className="ml-auto">
              <AttachLinkControl post={post} />
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
