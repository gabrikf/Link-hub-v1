import {
  Skeleton,
  SkeletonChips,
  SkeletonText,
} from "../../../shared-components/skeleton";

type WorkHistoryReadOnlySkeletonProps = Readonly<{
  /** How many entry placeholders to render. */
  count?: number;
}>;

/**
 * Entry-list placeholder for `WorkHistoryReadOnly`.
 *
 * Same `<ol>` (timeline rule + `space-y-3`) and the same entry card box as a
 * real experience: title line, company line, the date/location meta row, a
 * two-line description and a stack chip row.
 */
export function WorkHistoryReadOnlySkeleton({
  count = 2,
}: WorkHistoryReadOnlySkeletonProps) {
  return (
    <ol className="mt-4 space-y-3 border-l border-zinc-200 pl-4 dark:border-zinc-700">
      {Array.from({ length: count }, (_, index) => (
        <li
          key={index}
          className="relative rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40"
        >
          <span
            aria-hidden="true"
            className="anim-sheen absolute -left-[1.4rem] top-5 h-2.5 w-2.5 rounded-full bg-zinc-300 ring-4 ring-white dark:bg-zinc-700 dark:ring-zinc-900"
          />
          <Skeleton shape="text" height={20} width="55%" />
          <Skeleton shape="text" height={20} width="40%" className="mt-1" />
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Skeleton shape="text" height={16} width={104} />
            <Skeleton shape="text" height={16} width={80} />
          </div>
          <SkeletonText lines={2} className="mt-2" />
          <SkeletonChips count={3} className="mt-3" />
        </li>
      ))}
    </ol>
  );
}
