import { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";

export class ListMyWorkExperiencesUseCase {
  constructor(
    private workExperienceRepository: IWorkExperienceRepository,
  ) {}

  async execute(userId: string) {
    return this.workExperienceRepository.findByUserId(userId);
  }
}
