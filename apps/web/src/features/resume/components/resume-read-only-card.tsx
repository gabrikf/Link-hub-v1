import type { ResumeResponse } from "@repo/schemas";
import { BADGE, FOCUS_RING, SURFACE } from "../../../shared-components/surface";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  FiAward,
  FiBriefcase,
  FiChevronDown,
  FiChevronUp,
  FiCompass,
  FiDollarSign,
  FiMapPin,
  FiMessageCircle,
  FiStar,
  FiUserCheck,
} from "react-icons/fi";
import { LoadingLabel, Skeleton } from "../../../shared-components/skeleton";
import { ResumeReadOnlyCardSkeleton } from "./resume-read-only-card-skeleton";

type ResumeView = Pick<
  ResumeResponse,
  | "headlineTitle"
  | "summary"
  | "totalYearsExperience"
  | "location"
  | "seniorityLevel"
  | "workModel"
  | "contractType"
  | "salaryExpectationMin"
  | "salaryExpectationMax"
  | "spokenLanguages"
  | "noticePeriod"
  | "openToRelocation"
  | "skills"
  | "titles"
>;

type ResumeReadOnlyCardProps = {
  resume: ResumeView | null;
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
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export function ResumeReadOnlyCard({
  resume,
  isLoading = false,
  title,
  subtitle,
  action,
  emptyMessage,
  surfaceClassName = SURFACE,
}: Readonly<ResumeReadOnlyCardProps>) {
  const { t } = useTranslation();

  const resolvedTitle = title ?? t("common.resume");
  const resolvedSubtitle = subtitle ?? t("resume.readOnlyOverview");
  const resolvedEmptyMessage = emptyMessage ?? t("resume.empty");

  return (
    <section className={`p-4 ${surfaceClassName}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {resolvedTitle}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {resolvedSubtitle}
          </p>
        </div>
        {/* The header stays put while loading; only the action (a control that
            would act on data that isn't here yet) is stubbed out. */}
        {isLoading ? (
          action ? (
            <Skeleton shape="circle" width={64} height={36} />
          ) : null
        ) : (
          action
        )}
      </div>

      {isLoading ? (
        <>
          <LoadingLabel>{t("resume.loading")}</LoadingLabel>
          <ResumeReadOnlyCardSkeleton />
        </>
      ) : !resume ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-400">
          {resolvedEmptyMessage}
        </div>
      ) : (
        <ResumeDetails resume={resume} />
      )}
    </section>
  );
}

/**
 * The filled state: the headline card, the two meta-pill grids and the
 * titles / skills / languages chip sections.
 *
 * Split out of `ResumeReadOnlyCard` so the card itself is only the shell and
 * its four states, and the enum label maps live next to the pills that read
 * them.
 */
function ResumeDetails({ resume }: Readonly<{ resume: ResumeView }>) {
  const { t } = useTranslation();

  const seniorityLabels: Record<string, string> = {
    intern: t("enum.seniority.intern"),
    junior: t("enum.seniority.junior"),
    mid: t("enum.seniority.mid"),
    senior: t("enum.seniority.senior"),
    staff: t("enum.seniority.staff"),
    principal: t("enum.seniority.principal"),
  };

  const workModelLabels: Record<string, string> = {
    remote: t("enum.workModel.remote"),
    hybrid: t("enum.workModel.hybrid"),
    "on-site": t("enum.workModel.on-site"),
  };

  const contractLabels: Record<string, string> = {
    clt: t("enum.contractType.clt"),
    pj: t("enum.contractType.pj"),
    freelance: t("enum.contractType.freelance"),
    contract: t("enum.contractType.contract"),
    "full-time": t("enum.contractType.full-time"),
    "part-time": t("enum.contractType.part-time"),
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {resume.headlineTitle || t("resume.headlineNotSet")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {resume.summary || t("resume.noSummary")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <MetaPill icon={<FiMapPin className="h-3.5 w-3.5" />}>
          {resume.location || t("resume.locationNotSet")}
        </MetaPill>
        <MetaPill icon={<FiAward className="h-3.5 w-3.5" />}>
          {resume.seniorityLevel
            ? seniorityLabels[resume.seniorityLevel] || resume.seniorityLevel
            : t("resume.seniorityNotSet")}
        </MetaPill>
        <MetaPill icon={<FiCompass className="h-3.5 w-3.5" />}>
          {resume.workModel
            ? workModelLabels[resume.workModel] || resume.workModel
            : t("resume.workModelNotSet")}
        </MetaPill>
        <MetaPill icon={<FiBriefcase className="h-3.5 w-3.5" />}>
          {resume.contractType
            ? contractLabels[resume.contractType] || resume.contractType
            : t("resume.contractTypeNotSet")}
        </MetaPill>
        <MetaPill icon={<FiStar className="h-3.5 w-3.5" />}>
          {resume.totalYearsExperience !== null
            ? t("resume.yearsExperience", {
                count: resume.totalYearsExperience,
              })
            : t("resume.experienceNotSet")}
        </MetaPill>
        <MetaPill icon={<FiUserCheck className="h-3.5 w-3.5" />}>
          {resume.openToRelocation
            ? t("common.openToRelocation")
            : t("resume.notOpenToRelocation")}
        </MetaPill>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <MetaPill icon={<FiDollarSign className="h-3.5 w-3.5" />}>
          {resume.salaryExpectationMin !== null &&
          resume.salaryExpectationMax !== null
            ? `${formatCurrency(resume.salaryExpectationMin)} - ${formatCurrency(resume.salaryExpectationMax)}`
            : t("resume.salaryNotSet")}
        </MetaPill>
        <MetaPill icon={<FiMessageCircle className="h-3.5 w-3.5" />}>
          {resume.noticePeriod || t("resume.noticePeriodNotSet")}
        </MetaPill>
      </div>

      <SectionLabel label={t("common.titles")} />
      {resume.titles.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {resume.titles.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-200"
            >
              {item.titleName}
              {item.isPrimary ? t("resume.primaryMarker") : ""}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t("resume.noTitlesAdded")}
        </p>
      )}

      <SectionLabel label={t("common.skills")} />
      {resume.skills.length > 0 ? (
        <SkillChips skills={resume.skills} />
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t("resume.noSkillsAdded")}
        </p>
      )}

      <SectionLabel label={t("common.languages")} />
      {resume.spokenLanguages.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {resume.spokenLanguages.map((language) => (
            <span
              key={language}
              className="rounded-full border border-zinc-300 bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {language}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t("resume.noLanguagesAdded")}
        </p>
      )}
    </div>
  );
}

/**
 * A real resume carries ~40 skills, and rendering all of them pushed every
 * block below Skills off the first screen — on mobile it buried the rest of the
 * profile entirely. Five is enough to read the shape of someone's stack; the
 * tail is one tap away.
 *
 * Only Skills is capped. Titles is a 1–3 item list of who the person *is*, so a
 * cap would never fire on real data and would hide identity behind a chip on
 * the rare profile where it did.
 */
const VISIBLE_SKILL_COUNT = 5;

type SkillChipsProps = {
  skills: ResumeView["skills"];
};

function SkillChips({ skills }: Readonly<SkillChipsProps>) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const hiddenCount = skills.length - VISIBLE_SKILL_COUNT;
  const visibleSkills =
    isExpanded || hiddenCount <= 0
      ? skills
      : skills.slice(0, VISIBLE_SKILL_COUNT);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visibleSkills.map((item) => (
        <span
          key={item.id}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
        >
          {item.skillName}
          {item.yearsExperience !== null
            ? t("resume.yearsShort", { count: item.yearsExperience })
            : ""}
        </span>
      ))}

      {/* A chip that acts: it keeps the badge shape of its siblings but reads
          as a control — pointer cursor, hover, chevron and the house focus
          ring. Neutral zinc on purpose: this block also renders inside
          `.profile-root`, where an accent-coloured chip would fight the
          owner's theme. */}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          aria-expanded={isExpanded}
          aria-label={
            isExpanded
              ? undefined
              : t("resume.showAllSkills", { count: hiddenCount })
          }
          className={`inline-flex cursor-pointer items-center gap-1 rounded-full border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-200 dark:border-zinc-600 dark:hover:bg-zinc-700 ${BADGE.neutral} ${FOCUS_RING}`}
        >
          {isExpanded ? (
            <>
              <FiChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              {t("common.showLess")}
            </>
          ) : (
            <>
              <FiChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              {t("resume.moreSkills", { count: hiddenCount })}
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

type MetaPillProps = {
  icon: ReactNode;
  children: ReactNode;
};

function MetaPill({ icon, children }: Readonly<MetaPillProps>) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
      <span className="text-zinc-500 dark:text-zinc-400">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function SectionLabel({ label }: Readonly<{ label: string }>) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {label}
    </p>
  );
}
