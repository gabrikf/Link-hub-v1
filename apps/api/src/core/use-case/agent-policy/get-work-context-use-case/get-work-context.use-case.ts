import type { AgentDisclosureLevel } from "@repo/schemas";
import { ResourceNotFoundError } from "../../../errors/index.js";
import type { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import type { IUsersRepository } from "../../../repositories/user/user-repository.js";
import type { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";
import {
  buildBlockedTerms,
  redactText,
  resolveEffectiveLevel,
} from "../redact-work-disclosure.js";

export interface WorkContextRole {
  id: string;
  title: string;
  seniorityHint: string | null;
  employmentType: string | null;
  workModel: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  durationMonths: number | null;
  stack: string[];
  practices: string[];
  domain: string | null;
  /** Null whenever the effective level for this role is `summary`. */
  companyName: string | null;
  achievements: string[];
}

export interface WorkContext {
  disclosureLevel: AgentDisclosureLevel;
  roles: WorkContextRole[];
}

/**
 * Seniority words that appear in real job titles. Surfaced as a separate hint
 * so an agent writing a post doesn't have to parse the title itself and guess.
 */
const SENIORITY_HINTS = [
  "principal",
  "staff",
  "lead",
  "head",
  "director",
  "senior",
  "mid-level",
  "junior",
  "intern",
] as const;

/**
 * Engineering practices worth advertising. These are explicitly SAFE to share
 * at every level — they describe how the person works, not who they worked for,
 * which is exactly the trade the summary level is built around.
 */
const PRACTICE_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "TDD", pattern: /\b(tdd|test[- ]driven)\b/i },
  { label: "CI/CD", pattern: /\b(ci\/cd|cicd|continuous (integration|delivery|deployment))\b/i },
  { label: "trunk-based development", pattern: /\btrunk[- ]based\b/i },
  { label: "code review", pattern: /\bcode review(s)?\b/i },
  { label: "pair programming", pattern: /\bpair(ing| programming)\b/i },
  { label: "event-driven architecture", pattern: /\bevent[- ]driven\b/i },
  { label: "microservices", pattern: /\bmicro[- ]?services?\b/i },
  { label: "domain-driven design", pattern: /\b(ddd|domain[- ]driven)\b/i },
  { label: "clean architecture", pattern: /\bclean architecture\b/i },
  { label: "observability", pattern: /\b(observability|monitoring|telemetry)\b/i },
  { label: "infrastructure as code", pattern: /\b(terraform|infrastructure as code|iac)\b/i },
  { label: "agile/scrum", pattern: /\b(agile|scrum|kanban)\b/i },
  { label: "mentoring", pattern: /\bmentor(ing|ship|ed)?\b/i },
  { label: "accessibility", pattern: /\b(accessibility|a11y|wcag)\b/i },
];

/**
 * Problem domains, stated generically. "Payments" is a domain; "the Nubank PIX
 * pipeline" is an employer fingerprint, which is why only the generic label
 * ever leaves this use case.
 */
const DOMAIN_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "payments", pattern: /\b(payment|checkout|billing|pix|invoicing)\w*\b/i },
  { label: "fintech", pattern: /\b(fintech|banking|lending|credit|trading)\w*\b/i },
  { label: "e-commerce", pattern: /\b(e-?commerce|marketplace|retail|storefront)\w*\b/i },
  { label: "logistics", pattern: /\b(logistics|shipping|fleet|delivery|supply chain)\w*\b/i },
  { label: "healthcare", pattern: /\b(health|medical|clinical|patient)\w*\b/i },
  { label: "education", pattern: /\b(education|learning|e-?learning|course)\w*\b/i },
  { label: "developer tooling", pattern: /\b(developer tool|devtool|sdk|cli|platform engineering)\w*\b/i },
  { label: "data and analytics", pattern: /\b(analytics|data pipeline|etl|warehouse|reporting)\w*\b/i },
  { label: "security", pattern: /\b(security|authentication|authorization|identity|compliance)\w*\b/i },
  { label: "artificial intelligence", pattern: /\b(machine learning|\bml\b|artificial intelligence|\bai\b|llm|embedding)\w*\b/i },
];

/** First seniority word present in the title, in most-senior-first order. */
function extractSeniorityHint(title: string): string | null {
  const lower = title.toLowerCase();
  return SENIORITY_HINTS.find((hint) => lower.includes(hint)) ?? null;
}

/**
 * Whole months between start and end (or now, for a current role).
 *
 * Duration is allowed at every level — "three years on payments systems" says a
 * lot about capability and nothing about the employer.
 */
export function calculateDurationMonths(
  startDate: string | null,
  endDate: string | null,
  isCurrent: boolean,
  now: Date = new Date(),
): number | null {
  if (!startDate) return null;

  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;

  let end: Date;
  if (isCurrent || !endDate) {
    end = now;
  } else {
    end = new Date(`${endDate}T00:00:00Z`);
    if (Number.isNaN(end.getTime())) return null;
  }

  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());

  return months < 0 ? 0 : months;
}

function extractPractices(text: string): string[] {
  return PRACTICE_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ label }) => label,
  );
}

function extractDomain(text: string): string | null {
  return DOMAIN_PATTERNS.find(({ pattern }) => pattern.test(text))?.label ?? null;
}

/**
 * Splits a free-text role description into individual achievement lines.
 *
 * Users write these as bullet lists as often as as prose, so both shapes are
 * handled; anything shorter than a clause is dropped as noise.
 */
function splitAchievements(description: string | null): string[] {
  if (!description) return [];

  const lines = description
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*••]\s*/, "").trim())
    .filter((line) => line.length > 0);

  const source = lines.length > 1 ? lines : splitSentences(description);

  return source.map((line) => line.trim()).filter((line) => line.length >= 8);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Returns the user's work history ALREADY REDACTED to the effective level of
 * each role, so the MCP never has to decide what to hide.
 *
 * This is the only sanctioned source of employment detail for an agent. The
 * redaction happens here, server-side, precisely because the alternative —
 * shipping the raw history and asking the model nicely — is not enforcement.
 */
export class GetWorkContextUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private workExperienceRepository: IWorkExperienceRepository,
  ) {}

  async execute(userId: string): Promise<WorkContext> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new ResourceNotFoundError("User", userId);
    }

    const workExperiences =
      await this.workExperienceRepository.findByUserId(userId);

    const companyNames = workExperiences.map((role) => role.companyName);

    return {
      disclosureLevel: user.agentDisclosureLevel,
      roles: workExperiences.map((role) =>
        this.toRole(role, user.agentDisclosureLevel, user.agentBlockedTerms, companyNames),
      ),
    };
  }

  private toRole(
    role: WorkExperienceEntity,
    accountLevel: AgentDisclosureLevel,
    userBlockedTerms: string[],
    companyNames: string[],
  ): WorkContextRole {
    const level = resolveEffectiveLevel(accountLevel, role.disclosureLevel);

    // Every employer name is on the denylist at summary level, not just this
    // role's: a post about job A that name-drops job B leaks just as much.
    const blockedTerms = buildBlockedTerms({
      level,
      companyNames,
      userBlockedTerms,
    });

    const description = role.description ?? "";
    // Practices and domain are read from the ORIGINAL text — they are safe
    // categories, and reading them post-redaction would lose signal for no gain.
    const classifierText = `${role.title}\n${description}`;

    return {
      id: role.id,
      title: redactText(role.title, blockedTerms) || role.title,
      seniorityHint: extractSeniorityHint(role.title),
      employmentType: role.employmentType,
      workModel: role.workModel,
      startDate: role.startDate,
      endDate: role.endDate,
      isCurrent: role.isCurrent,
      durationMonths: calculateDurationMonths(
        role.startDate,
        role.endDate,
        role.isCurrent,
      ),
      stack: role.mainStack,
      practices: extractPractices(classifierText),
      domain: extractDomain(classifierText),
      companyName: level === "summary" ? null : role.companyName,
      achievements: splitAchievements(description).map((line) =>
        redactText(line, blockedTerms),
      ),
    };
  }
}
