import type { ResumeResponse } from "@repo/schemas";
import type { ReactNode } from "react";
import {
  FiAward,
  FiBriefcase,
  FiCompass,
  FiDollarSign,
  FiMapPin,
  FiMessageCircle,
  FiStar,
  FiUserCheck,
} from "react-icons/fi";

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
};

const seniorityLabels: Record<string, string> = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal",
};

const workModelLabels: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  "on-site": "On-site",
};

const contractLabels: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  freelance: "Freelance",
  contract: "Contract",
  "full-time": "Full-time",
  "part-time": "Part-time",
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
  title = "Resume",
  subtitle = "Read-only overview",
  action,
  emptyMessage = "No resume yet. Click edit to create your profile.",
}: ResumeReadOnlyCardProps) {
  if (isLoading) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Loading resume...
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
        </div>
        {action}
      </div>

      {!resume ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {resume.headlineTitle || "Professional headline not set"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {resume.summary || "No summary yet."}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <MetaPill icon={<FiMapPin className="h-3.5 w-3.5" />}>
              {resume.location || "Location not set"}
            </MetaPill>
            <MetaPill icon={<FiAward className="h-3.5 w-3.5" />}>
              {resume.seniorityLevel
                ? seniorityLabels[resume.seniorityLevel] ||
                  resume.seniorityLevel
                : "Seniority not set"}
            </MetaPill>
            <MetaPill icon={<FiCompass className="h-3.5 w-3.5" />}>
              {resume.workModel
                ? workModelLabels[resume.workModel] || resume.workModel
                : "Work model not set"}
            </MetaPill>
            <MetaPill icon={<FiBriefcase className="h-3.5 w-3.5" />}>
              {resume.contractType
                ? contractLabels[resume.contractType] || resume.contractType
                : "Contract type not set"}
            </MetaPill>
            <MetaPill icon={<FiStar className="h-3.5 w-3.5" />}>
              {resume.totalYearsExperience !== null
                ? `${resume.totalYearsExperience} year(s) experience`
                : "Experience not set"}
            </MetaPill>
            <MetaPill icon={<FiUserCheck className="h-3.5 w-3.5" />}>
              {resume.openToRelocation
                ? "Open to relocation"
                : "Not open to relocation"}
            </MetaPill>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <MetaPill icon={<FiDollarSign className="h-3.5 w-3.5" />}>
              {resume.salaryExpectationMin !== null &&
              resume.salaryExpectationMax !== null
                ? `${formatCurrency(resume.salaryExpectationMin)} - ${formatCurrency(resume.salaryExpectationMax)}`
                : "Salary expectation not set"}
            </MetaPill>
            <MetaPill icon={<FiMessageCircle className="h-3.5 w-3.5" />}>
              {resume.noticePeriod || "Notice period not set"}
            </MetaPill>
          </div>

          <SectionLabel label="Titles" />
          {resume.titles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {resume.titles.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-200"
                >
                  {item.titleName}
                  {item.isPrimary ? "(primary)" : ""}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No titles added yet.
            </p>
          )}

          <SectionLabel label="Skills" />
          {resume.skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {resume.skills.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                >
                  {item.skillName}
                  {item.yearsExperience !== null
                    ? `(${item.yearsExperience}y)`
                    : ""}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No skills added yet.
            </p>
          )}

          <SectionLabel label="Languages" />
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
              No spoken languages added yet.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

type MetaPillProps = {
  icon: ReactNode;
  children: ReactNode;
};

function MetaPill({ icon, children }: MetaPillProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
      <span className="text-zinc-500 dark:text-zinc-400">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {label}
    </p>
  );
}
