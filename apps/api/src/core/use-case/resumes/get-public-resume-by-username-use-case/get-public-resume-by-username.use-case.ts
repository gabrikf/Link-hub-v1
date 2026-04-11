import { ResourceNotFoundError } from "../../../errors/index.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { IResumeSkillRepository } from "../../../repositories/resume-skill/resume-skill-repository.js";
import { IResumeTitleRepository } from "../../../repositories/resume-title/resume-title-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export class GetPublicResumeByUsernameUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private resumesRepository: IResumesRepository,
    private resumeSkillRepository: IResumeSkillRepository,
    private resumeTitleRepository: IResumeTitleRepository,
  ) {}

  async execute(username: string) {
    const user = await this.usersRepository.findByLogin(username);

    if (!user) {
      throw new ResourceNotFoundError("User", username);
    }

    const resume = await this.resumesRepository.findByUserId(user.id);

    if (!resume) {
      throw new ResourceNotFoundError("Resume", username);
    }

    const [skills, titles] = await Promise.all([
      this.resumeSkillRepository.listByResumeId(resume.id),
      this.resumeTitleRepository.listByResumeId(resume.id),
    ]);

    return {
      headlineTitle: resume.headlineTitle,
      summary: resume.summary,
      totalYearsExperience: resume.totalYearsExperience,
      location: resume.location,
      seniorityLevel: resume.seniorityLevel,
      workModel: resume.workModel,
      contractType: resume.contractType,
      salaryExpectationMin: resume.salaryExpectationMin,
      salaryExpectationMax: resume.salaryExpectationMax,
      spokenLanguages: resume.spokenLanguages,
      noticePeriod: resume.noticePeriod,
      openToRelocation: resume.openToRelocation,
      skills,
      titles,
    };
  }
}
