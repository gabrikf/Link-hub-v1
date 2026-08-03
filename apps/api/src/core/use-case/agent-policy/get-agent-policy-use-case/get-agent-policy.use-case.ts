import type { AgentPolicy } from "@repo/schemas";
import { ResourceNotFoundError } from "../../../errors/index.js";
import type { IUsersRepository } from "../../../repositories/user/user-repository.js";
import type { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";

/**
 * Reads back the disclosure contract in force for a user.
 *
 * `perEmployer` is derived rather than stored as its own table: an override
 * lives on the work experience row, so the only roles that appear here are the
 * ones that actually deviate from the account default. A role missing from this
 * list inherits `disclosureLevel`.
 */
export class GetAgentPolicyUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private workExperienceRepository: IWorkExperienceRepository,
  ) {}

  async execute(userId: string): Promise<AgentPolicy> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new ResourceNotFoundError("User", userId);
    }

    const workExperiences =
      await this.workExperienceRepository.findByUserId(userId);

    return {
      disclosureLevel: user.agentDisclosureLevel,
      blockedTerms: user.agentBlockedTerms,
      perEmployer: workExperiences
        .filter((role) => role.disclosureLevel !== null)
        .map((role) => ({
          workExperienceId: role.id,
          companyName: role.companyName,
          disclosureLevel: role.disclosureLevel!,
        })),
    };
  }
}
