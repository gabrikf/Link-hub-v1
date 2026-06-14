import type { EmploymentType } from "@repo/schemas";

export const employmentTypeLabels: Record<EmploymentType, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  freelance: "Freelance",
  internship: "Internship",
  temporary: "Temporary",
};

export const workModelLabels: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  "on-site": "On-site",
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Formats an ISO "YYYY-MM-DD" date as "Mon YYYY" without timezone drift. */
export function formatWorkMonth(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) {
    return null;
  }

  const year = match[1];
  const monthIndex = Number(match[2]) - 1;
  const monthLabel = MONTH_LABELS[monthIndex];

  return monthLabel ? `${monthLabel} ${year}` : year;
}

export function formatWorkDateRange(
  startDate: string | null,
  endDate: string | null,
  isCurrent: boolean,
): string {
  const start = formatWorkMonth(startDate);
  const end = isCurrent ? "Present" : formatWorkMonth(endDate);

  if (start && end) {
    return `${start} — ${end}`;
  }

  if (start) {
    return `${start} — Present`;
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
