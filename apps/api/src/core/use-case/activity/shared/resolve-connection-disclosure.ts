import type { AgentDisclosureLevel } from "@repo/schemas";
import type { GitConnectionEntity } from "../../../entity/git-connection/git-connection-entity.js";
import type { UserEntity } from "../../../entity/user/user-entity.js";
import type { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";
import {
  buildBlockedTerms,
  resolveEffectiveLevel,
} from "../../agent-policy/redact-work-disclosure.js";

export interface ConnectionDisclosure {
  user: UserEntity;
  workExperiences: WorkExperienceEntity[];
  workExperienceId: string | null;
  level: AgentDisclosureLevel;
  blockedTerms: string[];
}

/**
 * Resolves the disclosure level that applies to a connection's activity.
 *
 * Shared by the digest generator and the digest preview so the preview can
 * never show a post the real run would have redacted differently — one
 * resolution, two callers.
 *
 * Precedence follows `GitConnectionEntity.resolvesDisclosureVia()`: a WORK
 * connection attributed to a role inherits that role's level, otherwise the
 * connection's own override applies, otherwise the account default. A `mixed`
 * connection — one machine holding personal and employer repositories — takes
 * the identical path, because a digest that aggregates both cannot attribute
 * any of its numbers to the personal half. A personal connection returns no
 * role even if one was somehow set, so an employer's redaction rules can never
 * be applied to a user's side projects.
 */
export async function resolveConnectionDisclosure(
  connection: GitConnectionEntity,
  usersRepository: IUsersRepository,
  workExperienceRepository: IWorkExperienceRepository,
): Promise<ConnectionDisclosure> {
  const user = await usersRepository.findById(connection.userId);

  if (!user) {
    throw new ResourceNotFoundError("User", connection.userId);
  }

  const workExperiences = await workExperienceRepository.findByUserId(
    connection.userId,
  );

  const workExperienceId = connection.resolvesDisclosureVia();
  const role = workExperienceId
    ? workExperiences.find((item) => item.id === workExperienceId)
    : undefined;

  const level = resolveEffectiveLevel(
    user.agentDisclosureLevel,
    role?.disclosureLevel ?? connection.disclosureLevelOverride,
  );

  // Two rules, and the denylist obeys whichever is stricter.
  //
  // The resolved level speaks for the ATTRIBUTED role only — that is the role
  // the connection's override was set for. Every OTHER employer keeps the level
  // of its own role, so a connection at `full` cannot name the employer the
  // user deliberately left at `summary`. And a digest that is itself at
  // `summary` still blocks EVERY name on the history, not just its own
  // employer's: naming a different employer leaks just as much.
  const companies = workExperiences.map((item) => {
    if (item.id === workExperienceId) {
      return { name: item.companyName, level };
    }

    return {
      name: item.companyName,
      level:
        level === "summary"
          ? level
          : resolveEffectiveLevel(user.agentDisclosureLevel, item.disclosureLevel),
    };
  });

  return {
    user,
    workExperiences,
    workExperienceId,
    level,
    blockedTerms: buildBlockedTerms({
      companies,
      userBlockedTerms: user.agentBlockedTerms,
    }),
  };
}
