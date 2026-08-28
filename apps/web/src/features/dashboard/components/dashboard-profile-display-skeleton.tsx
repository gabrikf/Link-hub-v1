import { useTranslation } from "react-i18next";
import { LoadingLabel, Skeleton } from "../../../shared-components/skeleton";

/**
 * Placeholder for `DashboardProfileDisplay`.
 *
 * Same three stacked regions as the real panel: the avatar + name/handle +
 * "Edit profile" row, the description paragraph, and the Appearance card with
 * its two 64px image thumbs and the meta chip row.
 */
export function DashboardProfileDisplaySkeleton() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <LoadingLabel>{t("dashboard.loadingProfile")}</LoadingLabel>

      <div className="flex items-start gap-3">
        <Skeleton shape="circle" width={56} height={56} />
        <div className="min-w-0 flex-1">
          <Skeleton shape="text" height={24} width="60%" />
          <Skeleton shape="text" height={20} width="40%" className="mt-1" />
        </div>
        <Skeleton shape="circle" width={104} height={36} className="shrink-0" />
      </div>

      <div className="space-y-2">
        <Skeleton shape="text" height={20} width="100%" />
        <Skeleton shape="text" height={20} width="70%" />
      </div>

      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <Skeleton shape="text" height={20} width={92} />

        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="space-y-1">
              <Skeleton shape="text" height={16} width={64} />
              <Skeleton height={64} className="w-full rounded-lg" />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Skeleton shape="circle" width={84} height={26} />
          <Skeleton shape="circle" width={110} height={26} />
        </div>
      </div>
    </div>
  );
}
