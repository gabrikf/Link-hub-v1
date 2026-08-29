import { useTranslation } from "react-i18next";
import { LoadingLabel, Skeleton } from "../../../shared-components/skeleton";

type LinkListSkeletonProps = {
  count?: number;
};

/**
 * Placeholder for the sortable link list.
 *
 * Mirrors `SortableLinkItem`: the same `<ul>`/`<li>` boxes, the drag grip, the
 * title + URL + visibility stack on the left, and the switch/edit/delete
 * control cluster on the right — so the list does not jump when links land.
 */
export function LinkListSkeleton({ count = 3 }: LinkListSkeletonProps) {
  const { t } = useTranslation();

  return (
    <>
      <LoadingLabel>{t("dashboard.loadingLinks")}</LoadingLabel>
      <ul className="space-y-2">
        {Array.from({ length: count }, (_, index) => (
          <li
            key={index}
            className="anim-fade-up flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="flex min-w-0 items-start gap-3">
              <Skeleton width={36} height={36} className="mt-0.5 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Skeleton shape="circle" width={20} height={20} />
                  <Skeleton shape="text" height={24} width={140} />
                </div>
                <Skeleton shape="text" height={20} width={220} className="mt-1" />
                <Skeleton shape="text" height={16} width={56} className="mt-1" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Skeleton shape="circle" width={96} height={30} />
              <Skeleton width={36} height={36} className="rounded-md" />
              <Skeleton width={36} height={36} className="rounded-md" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
