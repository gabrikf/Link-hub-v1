import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SURFACE } from "../../../shared-components/surface";
import { FiBriefcase, FiCalendar, FiMapPin } from "react-icons/fi";
import { LoadingLabel } from "../../../shared-components/skeleton";
import { Markdown } from "../../posts/components/markdown";
import {
  formatWorkDateRange,
  formatWorkLocation,
  getEmploymentTypeLabels,
  getWorkModelLabels,
} from "../utils/work-experience-format";
import { WorkHistoryReadOnlySkeleton } from "./work-history-read-only-skeleton";

type WorkExperienceView = {
  id: string;
  title: string;
  companyName: string;
  employmentType: string | null;
  workModel: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  mainStack: string[];
};

type WorkHistoryReadOnlyProps = Readonly<{
  workExperiences: WorkExperienceView[];
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  emptyMessage?: string;
  /**
   * Card material. Defaults to the dashboard surface; the public profile passes
   * `SURFACE_PROFILE` so this block matches its siblings in that grid instead of
   * reading as a different material in dark mode.
   */
  surfaceClassName?: string;
}>;

export function WorkHistoryReadOnly({
  workExperiences,
  isLoading = false,
  title,
  subtitle,
  action,
  emptyMessage,
  surfaceClassName = SURFACE,
}: WorkHistoryReadOnlyProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t("common.workHistory");
  const resolvedSubtitle = subtitle ?? t("common.professionalExperience");
  const resolvedEmptyMessage = emptyMessage ?? t("work.emptyPublic");

  return (
    <section className={`p-4 ${surfaceClassName}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <FiBriefcase className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            {resolvedTitle}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {resolvedSubtitle}
          </p>
        </div>
        {action}
      </div>

      {isLoading ? (
        <>
          <LoadingLabel>{t("work.loading")}</LoadingLabel>
          <WorkHistoryReadOnlySkeleton />
        </>
      ) : workExperiences.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-400">
          {resolvedEmptyMessage}
        </div>
      ) : (
        <ol className="mt-4 space-y-3 border-l border-zinc-200 pl-4 dark:border-zinc-700">
          {workExperiences.map((item) => (
            <WorkHistoryItem key={item.id} item={item} />
          ))}
        </ol>
      )}
    </section>
  );
}

function WorkHistoryItem({ item }: Readonly<{ item: WorkExperienceView }>) {
  const { t } = useTranslation();
  const dateRange = formatWorkDateRange(
    item.startDate,
    item.endDate,
    item.isCurrent,
    t,
  );
  const location = formatWorkLocation(item);
  const employmentTypeLabels = getEmploymentTypeLabels(t);
  const workModelLabels = getWorkModelLabels(t);
  const employmentLabel = item.employmentType
    ? (employmentTypeLabels[
        item.employmentType as keyof typeof employmentTypeLabels
      ] ?? item.employmentType)
    : null;
  const workModelLabel = item.workModel
    ? (workModelLabels[item.workModel] ?? item.workModel)
    : null;

  return (
    <li className="relative rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
      <span
        className="absolute -left-[1.4rem] top-5 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-zinc-900"
        style={{ backgroundColor: "var(--profile-accent-solid, #7c3aed)" }}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {item.title}
        </p>
        {item.isCurrent ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            {t("common.current")}
          </span>
        ) : null}
      </div>

      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        {item.companyName}
        {employmentLabel ? (
          <span className="text-zinc-500 dark:text-zinc-400">
            {" "}
            · {employmentLabel}
          </span>
        ) : null}
        {workModelLabel ? (
          <span className="text-zinc-500 dark:text-zinc-400">
            {" "}
            · {workModelLabel}
          </span>
        ) : null}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        {dateRange ? (
          <span className="inline-flex items-center gap-1">
            <FiCalendar className="h-3 w-3" />
            {dateRange}
          </span>
        ) : null}
        {location ? (
          <span className="inline-flex items-center gap-1">
            <FiMapPin className="h-3 w-3" />
            {location}
          </span>
        ) : null}
      </div>

      {item.description ? (
        <Markdown className="work-history-md mt-2">{item.description}</Markdown>
      ) : null}

      {item.mainStack.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.mainStack.map((tech) => (
            <span
              key={tech}
              className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor:
                  "var(--profile-accent-weak, rgba(139,92,246,0.12))",
                color: "var(--profile-accent-fg, #7c3aed)",
                borderColor:
                  "var(--profile-accent-border, rgba(139,92,246,0.3))",
              }}
            >
              {tech}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}
