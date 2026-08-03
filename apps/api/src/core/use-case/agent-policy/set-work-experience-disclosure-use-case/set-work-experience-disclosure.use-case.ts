import type { AgentDisclosureLevel } from "@repo/schemas";
import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import type { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";

export interface ISetWorkExperienceDisclosureInput {
  userId: string;
  workExperienceId: string;
  /** `null` clears the override so the role goes back to inheriting the account level. */
  disclosureLevel: AgentDisclosureLevel | null;
}

/**
 * Sets (or clears) one role's override of the account disclosure level.
 *
 * Kept out of `UpdateWorkExperienceUseCase` on purpose: editing a job title is
 * a content change, while changing what an agent may say about that job is a
 * privacy decision. Separating them means the settings screen can save the
 * privacy control without round-tripping — and accidentally overwriting — every
 * other field on the row.
 */
export class SetWorkExperienceDisclosureUseCase {
  constructor(private workExperienceRepository: IWorkExperienceRepository) {}

  async execute(input: ISetWorkExperienceDisclosureInput) {
    const workExperience = await this.workExperienceRepository.findById(
      input.workExperienceId,
    );

    if (!workExperience) {
      throw new ResourceNotFoundError(
        "Work experience",
        input.workExperienceId,
      );
    }

    if (workExperience.userId !== input.userId) {
      throw new ForbiddenError("You can only edit your own work experiences");
    }

    workExperience.updateContent({ disclosureLevel: input.disclosureLevel });

    return this.workExperienceRepository.update(workExperience);
  }
}
