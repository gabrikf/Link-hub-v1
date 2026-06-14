import { ResourceNotFoundError } from "../../../errors/index.js";
import { IResumeParsingProvider } from "../../../providers/resume-parsing/resume-parsing-provider.js";
import { ISkillCatalogRepository } from "../../../repositories/skill-catalog/skill-catalog-repository.js";
import { ITitleCatalogRepository } from "../../../repositories/title-catalog/title-catalog-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export interface IParseResumeInput {
  userId: string;
  resumeText: string;
}

export class ParseResumeUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private skillCatalogRepository: ISkillCatalogRepository,
    private titleCatalogRepository: ITitleCatalogRepository,
    private resumeParsingProvider: IResumeParsingProvider,
  ) {}

  async execute(input: IParseResumeInput) {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    const [skills, titles] = await Promise.all([
      this.skillCatalogRepository.listForUser(input.userId),
      this.titleCatalogRepository.listForUser(input.userId),
    ]);

    return this.resumeParsingProvider.parseResume({
      resumeText: input.resumeText,
      knownSkills: skills.map((skill) => skill.name),
      knownTitles: titles.map((title) => title.name),
    });
  }
}
