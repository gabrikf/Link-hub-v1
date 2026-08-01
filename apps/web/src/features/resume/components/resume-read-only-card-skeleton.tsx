import {
  Skeleton,
  SkeletonChips,
  SkeletonText,
} from "../../../shared-components/skeleton";

/**
 * Body placeholder for `ResumeReadOnlyCard`.
 *
 * It mirrors the populated card one-for-one: the headline/summary panel, the
 * 6 + 2 meta-pill grids, then the Titles / Skills / Languages label + chip-row
 * pairs. The card header (title, subtitle, action) is NOT part of this — the
 * card keeps rendering it while loading, so it never moves.
 */
export function ResumeReadOnlyCardSkeleton() {
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
        <Skeleton shape="text" height={16} width="45%" />
        <SkeletonText lines={2} className="mt-2" />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <MetaPillSkeleton key={index} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <MetaPillSkeleton key={index} />
        ))}
      </div>

      <SectionLabelSkeleton />
      <SkeletonChips count={2} />

      <SectionLabelSkeleton />
      <SkeletonChips count={5} />

      <SectionLabelSkeleton />
      <SkeletonChips count={3} />
    </div>
  );
}

/** Same 38px box as `MetaPill` (border + py-2 + text-sm line box). */
function MetaPillSkeleton() {
  return <Skeleton height={38} className="rounded-lg" />;
}

/** Same 16px line box as `SectionLabel` (text-xs). */
function SectionLabelSkeleton() {
  return <Skeleton shape="text" height={16} width={64} />;
}
