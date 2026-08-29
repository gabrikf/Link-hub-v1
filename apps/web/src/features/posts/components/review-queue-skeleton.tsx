import { useTranslation } from "react-i18next";
import {
  LoadingLabel,
  Skeleton,
  SkeletonText,
} from "../../../shared-components/skeleton";
import { SURFACE } from "../../../shared-components/surface";

/**
 * Stand-in for a review-queue card.
 *
 * Mirrors `ReviewQueueItem` box-for-box: same single-column `grid gap-4`
 * wrapper, same card chrome, same internal `gap-4 p-5` stack (badge row →
 * provenance line → title → body → metadata facts → action footer), so the
 * page does not reflow when the query resolves.
 *
 * The body is the one part that cannot be mirrored exactly — a generated post
 * runs anywhere from two lines to twenty — so it settles on five lines, which
 * is roughly the 80-200 word summary the MCP commit flow produces.
 */
function ReviewQueueCardSkeleton() {
  return (
    <li className={`flex flex-col ${SURFACE}`}>
      <div className="flex flex-col gap-4 p-5">
        {/* status pill + source pill + date */}
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton shape="circle" height={20} width={104} />
          <Skeleton shape="circle" height={20} width={62} />
          <Skeleton shape="text" height={12} width={88} className="ml-auto" />
        </div>

        {/* provenance line */}
        <Skeleton shape="text" height={12} width="45%" />

        {/* title — one 28px line */}
        <div className="flex h-7 items-center">
          <Skeleton shape="text" height={16} width="70%" />
        </div>

        {/* rendered body */}
        <SkeletonText lines={5} />

        {/* metadata facts */}
        <div className="flex flex-wrap gap-2">
          <Skeleton shape="circle" height={24} width={140} />
          <Skeleton shape="circle" height={24} width={96} />
          <Skeleton shape="circle" height={24} width={118} />
        </div>

        {/* Approve / Delete — both `size="sm"`, i.e. h-9 */}
        <div className="flex items-center gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <Skeleton height={36} width={152} className="rounded-md" />
          <Skeleton height={36} width={92} className="rounded-md" />
        </div>
      </div>
    </li>
  );
}

type ReviewQueueSkeletonProps = {
  /** How many placeholder cards to render. */
  count?: number;
};

export function ReviewQueueSkeleton({ count = 2 }: ReviewQueueSkeletonProps) {
  const { t } = useTranslation();
  return (
    <>
      <LoadingLabel>{t("posts.loadingWaitingForReview")}</LoadingLabel>
      <ul className="grid gap-4">
        {Array.from({ length: count }, (_, index) => (
          <ReviewQueueCardSkeleton key={index} />
        ))}
      </ul>
    </>
  );
}
