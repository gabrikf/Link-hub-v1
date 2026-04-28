import { ResourceNotFoundError } from "../../../errors/index.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { IResumeSkillRepository } from "../../../repositories/resume-skill/resume-skill-repository.js";
import { ISkillCatalogRepository } from "../../../repositories/skill-catalog/skill-catalog-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";

export interface ISaveResumeSkillsBulkInput {
  userId: string;
  items: Array<{
    skillId: string;
    yearsExperience?: number | null;
  }>;
}

export class SaveResumeSkillsBulkUseCase {
  constructor(
    private resumesRepository: IResumesRepository,
    private skillCatalogRepository: ISkillCatalogRepository,
    private resumeSkillRepository: IResumeSkillRepository,
    private enqueueResumeEmbeddingUseCase: EnqueueResumeEmbeddingUseCase,
  ) {}

  async execute(input: ISaveResumeSkillsBulkInput) {
    const resume = await this.resumesRepository.findByUserId(input.userId);

    if (!resume) {
      throw new ResourceNotFoundError("Resume", input.userId);
    }

    await Promise.all(
      input.items.map(async (item) => {
        const skill = await this.skillCatalogRepository.findById(item.skillId);

        if (!skill) {
          throw new ResourceNotFoundError("Skill", item.skillId);
        }
      }),
    );

    await this.resumeSkillRepository.replaceForResume(
      resume.id,
      input.items.map((item) => ({
        skillId: item.skillId,
        yearsExperience: item.yearsExperience ?? null,
      })),
    );

    try {
      await this.enqueueResumeEmbeddingUseCase.execute({
        resumeId: resume.id,
        userId: input.userId,
        reason: "resume-skills-replaced",
      });
    } catch (error) {
      console.error("Failed to enqueue resume embedding job", error);
    }

    return this.resumeSkillRepository.listByResumeId(resume.id);
  }
}
