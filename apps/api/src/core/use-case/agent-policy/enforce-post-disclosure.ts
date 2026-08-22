import type { AgentDisclosureLevel } from "@repo/schemas";
import { BadRequestError } from "../../errors/index.js";
import type { UserEntity } from "../../entity/user/user-entity.js";
import type { WorkExperienceEntity } from "../../entity/work-experience/work-experience-entity.js";
import type { IUsersRepository } from "../../repositories/user/user-repository.js";
import type { IWorkExperienceRepository } from "../../repositories/work-experience/work-experience-repository.js";
import {
  buildBlockedTerms,
  findDisclosureViolations,
  resolveEffectiveLevel,
} from "./redact-work-disclosure.js";

/**
 * The fields of a post that a reader (and therefore a recruiter) sees.
 *
 * The URLs are here for the same reason the prose is: they are SERVED to
 * anonymous readers. `externalUrl` is rendered as the post's `<a href>` on the
 * public profile and `coverImageUrl`/`images` as its `<img src>`, so
 * "github.com/acme-internal/..." publishes the employer just as plainly as
 * writing the name in the body — and an agent attaching the PR link it just
 * read is the ordinary case, not an attack.
 *
 * `metadata` is deliberately absent: it is stripped from the public projection
 * (`publicPostResponseSchema` omits it) so it reaches no one but its owner. The
 * digest path, which is the only writer that fills it, scans it separately in
 * `assertTemplateIsClean`. If metadata ever starts being served, it belongs
 * here.
 */
export interface PostDisclosureContent {
  title?: string | null;
  body?: string | null;
  tags?: string[] | null;
  externalUrl?: string | null;
  coverImageUrl?: string | null;
  images?: string[] | null;
}

export interface EnforcePostDisclosureInput extends PostDisclosureContent {
  user: UserEntity;
  workExperiences: readonly WorkExperienceEntity[];
  /** The role this post is attributed to, if any — its override wins. */
  workExperienceId?: string | null;
}

/**
 * Builds the error an agent gets when it names something it may not name.
 *
 * The message is written FOR the agent, not for a log: it names the offending
 * terms and says what to do instead, because an agent that only sees "403
 * forbidden" retries the same text.
 */
function buildViolationMessage(
  violations: string[],
  level: AgentDisclosureLevel,
): string {
  const quoted = violations.map((term) => `"${term}"`).join(", ");

  return (
    `Post mentions ${quoted}, which your disclosure level (${level}) does not allow. ` +
    `Describe the capability without naming the employer or client — what you built, ` +
    `the stack, the practices and the outcome are all still allowed — or raise your ` +
    `disclosure level in LinkHub settings under "What your agent may share".`
  );
}

/**
 * Throws when post content violates the caller's effective disclosure level.
 *
 * Only PAT (agent) callers are checked. A human writing in the web app is
 * writing about their own career and may say whatever they like; the policy
 * exists to constrain software acting on their behalf, not to censor them.
 *
 * Note this runs in the use case rather than the HTTP guard on purpose: the
 * guard lets real JWT sessions bypass scopes entirely, so any check placed
 * there would be trivially skipped by the very callers it must not skip.
 */
export function assertPostRespectsDisclosure(
  input: EnforcePostDisclosureInput,
): void {
  const role = input.workExperienceId
    ? input.workExperiences.find((item) => item.id === input.workExperienceId)
    : undefined;

  const level = resolveEffectiveLevel(
    input.user.agentDisclosureLevel,
    role?.disclosureLevel,
  );

  const blockedTerms = buildBlockedTerms({
    level,
    companyNames: input.workExperiences.map((item) => item.companyName),
    userBlockedTerms: input.user.agentBlockedTerms,
  });

  if (blockedTerms.length === 0) return;

  // Every field is joined with a separator that can't create an accidental
  // match across two of them, then scanned as one string. A newline is not a
  // letter/digit/underscore, so it reads as a word boundary to the matcher.
  const haystack = [
    input.title ?? "",
    input.body ?? "",
    ...(input.tags ?? []),
    input.externalUrl ?? "",
    input.coverImageUrl ?? "",
    ...(input.images ?? []),
  ].join("\n");

  const violations = findDisclosureViolations(haystack, blockedTerms);

  if (violations.length > 0) {
    throw new BadRequestError(buildViolationMessage(violations, level));
  }
}

export interface LoadDisclosureContextInput {
  userId: string;
  usersRepository: IUsersRepository;
  workExperienceRepository: IWorkExperienceRepository;
}

/**
 * Loads the user + work history the check needs. Returns `null` when either
 * collaborator is unavailable so a caller wired without them (older tests, the
 * DI-free unit setup) degrades to "no enforcement" rather than crashing.
 */
export async function loadDisclosureContext(input: {
  userId: string;
  usersRepository?: IUsersRepository;
  workExperienceRepository?: IWorkExperienceRepository;
}): Promise<{
  user: UserEntity;
  workExperiences: WorkExperienceEntity[];
} | null> {
  if (!input.usersRepository || !input.workExperienceRepository) return null;

  const user = await input.usersRepository.findById(input.userId);
  if (!user) return null;

  const workExperiences = await input.workExperienceRepository.findByUserId(
    input.userId,
  );

  return { user, workExperiences };
}
