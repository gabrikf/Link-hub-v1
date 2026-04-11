import { ResourceNotFoundError } from "../../../errors/index.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { IResumeSkillRepository } from "../../../repositories/resume-skill/resume-skill-repository.js";
import { IResumeTitleRepository } from "../../../repositories/resume-title/resume-title-repository.js";

export class GetMyResumeUseCase {
  constructor(
    private resumesRepository: IResumesRepository,
    private resumeSkillRepository: IResumeSkillRepository,
    private resumeTitleRepository: IResumeTitleRepository,
  ) {}

  async execute(userId: string) {
    const resume = await this.resumesRepository.findByUserId(userId);

    if (!resume) {
      throw new ResourceNotFoundError("Resume", userId);
    }

    const [skills, titles] = await Promise.all([
      this.resumeSkillRepository.listByResumeId(resume.id),
      this.resumeTitleRepository.listByResumeId(resume.id),
    ]);

    return {
      ...resume,
      skills,
      titles,
    };
  }
}
