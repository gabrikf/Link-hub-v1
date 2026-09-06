import type { EmploymentType } from "@repo/schemas";
import type { TFunction } from "i18next";

export function getEmploymentTypeLabels(
  t: TFunction,
): Record<EmploymentType, string> {
  return {
    "full-time": t("enum.contractType.full-time"),
    "part-time": t("enum.contractType.part-time"),
    contract: t("enum.contractType.contract"),
    freelance: t("enum.contractType.freelance"),
    internship: t("enum.contractType.internship"),
    temporary: t("enum.contractType.temporary"),
  };
}

export function getWorkModelLabels(t: TFunction): Record<string, string> {
  return {
    remote: t("enum.workModel.remote"),
    hybrid: t("enum.workModel.hybrid"),
    "on-site": t("enum.workModel.on-site"),
  };
}

const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

/** Formats an ISO "YYYY-MM-DD" date as "Mon YYYY" without timezone drift. */
export function formatWorkMonth(
  value: string | null,
  t: TFunction,
): string | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) {
    return null;
  }

  const year = match[1];
  if (year === undefined) {
    return null;
  }
  const monthIndex = Number(match[2]) - 1;
  const monthKey = MONTH_KEYS[monthIndex];
  if (!monthKey) {
    return year;
  }

  const monthLabel = t(`enum.month.${monthKey}`);
  return `${monthLabel} ${year}`;
}

export function formatWorkDateRange(
  startDate: string | null,
  endDate: string | null,
  isCurrent: boolean,
  t: TFunction,
): string {
  const start = formatWorkMonth(startDate, t);
  const end = isCurrent ? t("common.present") : formatWorkMonth(endDate, t);

  if (start && end) {
    return isCurrent
      ? t("work.dateRangeCurrent", { start })
      : t("work.dateRange", { start, end });
  }

  if (start) {
    return t("work.dateRangeCurrent", { start });
  }

  return end ?? "";
}

export function formatWorkLocation(parts: {
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
}): string | null {
  const segments = [
    parts.locationCity,
    parts.locationState,
    parts.locationCountry,
  ].filter((segment): segment is string => Boolean(segment && segment.trim()));

  return segments.length > 0 ? segments.join(", ") : null;
}
