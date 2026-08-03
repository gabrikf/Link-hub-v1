import type { RecruiterSearchInput } from "@repo/schemas";
import { BADGE, BADGE_STRONG } from "../../../shared-components/surface";
import type {
  AdvancedSearchFormValues,
  ContractType,
  SelectOption,
  SeniorityLevel,
  WorkModel,
} from "../types/advanced-search";
import {
  CONTRACT_TYPE_OPTIONS,
  SENIORITY_OPTIONS,
  WORK_MODEL_OPTIONS,
} from "../types/advanced-search";

export function toUniqueTrimmedValues(options: SelectOption[]): string[] {
  return Array.from(
    new Set(
      options
        .map((item) => item.value.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

export function parseOptionalNumber(input: string): number | undefined {
  if (!input.trim()) {
    return undefined;
  }

  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return Math.round(parsed);
}

/**
 * The one match signal a recruiter sees.
 *
 * The card used to show two numbers: an "AI Match %" and a raw cosine
 * `Similarity 0.412`. The second is meaningless outside of embedding space — a
 * 0.41 is a good hit, not a 41% fit — and putting it next to a percentage
 * invited exactly the wrong reading. Only the blended match score is surfaced
 * now, with a word attached so the number is interpretable at a glance.
 *
 * The score itself comes from the on-device reranker: roughly "how much of what
 * you asked for does this person actually have", weighting skills 4x, titles 2x
 * and real work history 2x.
 */
export type MatchStrength = {
  percent: string;
  label: string;
  description: string;
  className: string;
};

export function describeMatch(aiScore: number | null): MatchStrength {
  // No score at all: the reranker did not run. The results are still real and
  // still ordered by the API's similarity — we simply have nothing honest to
  // print as a percentage.
  if (aiScore === null) {
    return {
      percent: "—",
      label: "Match unavailable",
      description:
        "On-device ranking could not run for this search, so results are shown in the search engine's own order.",
      className: BADGE.neutral,
    };
  }

  const normalized = aiScore <= 1 ? aiScore * 100 : aiScore;
  const clamped = Math.max(0, Math.min(100, normalized));
  const percent = `${Math.round(clamped)}%`;
  const description = `Covers about ${percent} of what you searched for — skills, titles and real work history weigh heaviest.`;

  // Tones come from the shared badge maps. `BADGE_STRONG` for the three tones
  // it defines — this chip is the one place a badge is the primary signal
  // rather than a label — and `BADGE.accent` for the violet middle band, which
  // has no strong variant.
  if (clamped >= 75) {
    return {
      percent,
      label: "Strong match",
      description,
      className: BADGE_STRONG.success,
    };
  }

  if (clamped >= 50) {
    return {
      percent,
      label: "Good match",
      description,
      className: BADGE.accent,
    };
  }

  if (clamped >= 25) {
    return {
      percent,
      label: "Partial match",
      description,
      className: BADGE_STRONG.warning,
    };
  }

  return {
    percent,
    label: "Weak match",
    description,
    className: BADGE_STRONG.neutral,
  };
}

function parseWorkDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  // Stored as `YYYY-MM-DD`. Parsed as UTC deliberately: `new Date("2021-01-01")`
  // is midnight UTC, which in a negative-offset timezone renders as December of
  // the previous year. Formatting in UTC keeps the month the candidate typed.
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2 yrs 4 mos", "8 mos", or "" when the span is unknown. */
export function formatTenure(
  startDate: string | null,
  endDate: string | null,
  isCurrent: boolean,
): string {
  const start = parseWorkDate(startDate);
  if (!start) {
    return "";
  }

  const end = isCurrent ? new Date() : parseWorkDate(endDate);
  if (!end) {
    return "";
  }

  const totalMonths =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());

  if (totalMonths < 0) {
    return "";
  }

  // A role is at least one month long — a same-month start and end is not "0".
  const months = Math.max(1, totalMonths);
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  const parts: string[] = [];
  if (years > 0) {
    parts.push(`${years} yr${years === 1 ? "" : "s"}`);
  }
  if (remainingMonths > 0) {
    parts.push(`${remainingMonths} mo${remainingMonths === 1 ? "" : "s"}`);
  }

  return parts.join(" ");
}

/** "Jan 2021 — Present" / "Jan 2021 — Jun 2023" / "" when no dates are set. */
export function formatWorkPeriod(
  startDate: string | null,
  endDate: string | null,
  isCurrent: boolean,
): string {
  const start = parseWorkDate(startDate);
  const end = parseWorkDate(endDate);

  if (!start && !end) {
    return isCurrent ? "Present" : "";
  }

  const startLabel = start ? formatMonthYear(start) : "?";
  const endLabel = isCurrent ? "Present" : end ? formatMonthYear(end) : "?";

  return `${startLabel} — ${endLabel}`;
}

export type BuildSearchPayloadInput = {
  values: AdvancedSearchFormValues;
  attachmentFile: File | null;
  topK: number;
};

export function buildRecruiterSearchPayload({
  values,
  attachmentFile,
  topK,
}: BuildSearchPayloadInput): {
  payload: RecruiterSearchInput & { attachmentFile?: File };
  hasSemanticInput: boolean;
} {
  const backendContractTypes = values.contractTypes
    .map((item) => item.value)
    .filter((item): item is ContractType =>
      CONTRACT_TYPE_OPTIONS.includes(item as ContractType),
    );

  const backendSeniorityLevels = values.seniorityLevels
    .map((item) => item.value)
    .filter((item): item is SeniorityLevel =>
      SENIORITY_OPTIONS.includes(item as SeniorityLevel),
    );

  const backendWorkModels = values.workModels
    .map((item) => item.value)
    .filter((item): item is WorkModel =>
      WORK_MODEL_OPTIONS.includes(item as WorkModel),
    );

  const whereQuery: RecruiterSearchInput["whereQuery"] = {
    contractTypes:
      backendContractTypes.length > 0 ? backendContractTypes : undefined,
    seniorityLevels:
      backendSeniorityLevels.length > 0 ? backendSeniorityLevels : undefined,
    workModels: backendWorkModels.length > 0 ? backendWorkModels : undefined,
    openToRelocation:
      values.openToRelocation.value === "any"
        ? undefined
        : values.openToRelocation.value === "yes",
    minYearsExperience: parseOptionalNumber(values.minYearsExperience),
    maxYearsExperience: parseOptionalNumber(values.maxYearsExperience),
    locations: toUniqueTrimmedValues(values.locations),
    spokenLanguages: toUniqueTrimmedValues(values.spokenLanguages),
    noticePeriods: toUniqueTrimmedValues(values.noticePeriods),
    skills: toUniqueTrimmedValues(values.mandatorySkills),
    titles: toUniqueTrimmedValues(values.mandatoryTitles),
    minSalary: parseOptionalNumber(values.minSalary),
    maxSalary: parseOptionalNumber(values.maxSalary),
    nameContains: values.nameContains.trim() || undefined,
    usernameContains: values.usernameContains.trim() || undefined,
    profileTextContains: values.profileTextContains.trim() || undefined,
  };

  const semanticSkills = toUniqueTrimmedValues(values.semanticSkills);
  const semanticTitles = toUniqueTrimmedValues(values.semanticTitles);

  const chatPrompt = values.chatPrompt.trim();

  const hasAnyFilter =
    semanticSkills.length > 0 ||
    semanticTitles.length > 0 ||
    toUniqueTrimmedValues(values.mandatorySkills).length > 0 ||
    toUniqueTrimmedValues(values.mandatoryTitles).length > 0 ||
    backendContractTypes.length > 0 ||
    backendSeniorityLevels.length > 0 ||
    backendWorkModels.length > 0 ||
    toUniqueTrimmedValues(values.locations).length > 0 ||
    toUniqueTrimmedValues(values.spokenLanguages).length > 0 ||
    toUniqueTrimmedValues(values.noticePeriods).length > 0 ||
    parseOptionalNumber(values.minYearsExperience) !== undefined ||
    parseOptionalNumber(values.maxYearsExperience) !== undefined ||
    parseOptionalNumber(values.minSalary) !== undefined ||
    parseOptionalNumber(values.maxSalary) !== undefined ||
    values.nameContains.trim().length > 0 ||
    values.usernameContains.trim().length > 0 ||
    values.profileTextContains.trim().length > 0 ||
    values.openToRelocation.value !== "any";

  const hasSemanticInput =
    chatPrompt.length > 0 || Boolean(attachmentFile) || hasAnyFilter;

  return {
    hasSemanticInput,
    payload: {
      query: undefined,
      chatPrompt: chatPrompt || undefined,
      semanticSkills: semanticSkills.length > 0 ? semanticSkills : undefined,
      semanticTitles: semanticTitles.length > 0 ? semanticTitles : undefined,
      whereQuery,
      topK,
      attachmentFile: attachmentFile ?? undefined,
    },
  };
}
