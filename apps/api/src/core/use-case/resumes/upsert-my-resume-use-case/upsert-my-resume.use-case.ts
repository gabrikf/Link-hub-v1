import { ResourceNotFoundError } from "../../../errors/index.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";

export interface IUpsertMyResumeInput {
  userId: string;
  headlineTitle?: string | null;
  summary?: string | null;
  totalYearsExperience?: number | null;
  location?: string | null;
  seniorityLevel?: string | null;
  workModel?: string | null;
  contractType?: string | null;
  salaryExpectationMin?: number | null;
  salaryExpectationMax?: number | null;
  spokenLanguages?: string[];
  noticePeriod?: string | null;
  openToRelocation?: boolean;
}

export class UpsertMyResumeUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private resumesRepository: IResumesRepository,
    private enqueueResumeEmbeddingUseCase: EnqueueResumeEmbeddingUseCase,
  ) {}

  async execute(input: IUpsertMyResumeInput) {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    const resume = await this.resumesRepository.upsertByUserId(input.userId, {
      headlineTitle: input.headlineTitle,
      summary: input.summary,
      totalYearsExperience: input.totalYearsExperience,
      location: input.location,
      seniorityLevel: input.seniorityLevel,
      workModel: input.workModel,
      contractType: input.contractType,
      salaryExpectationMin: input.salaryExpectationMin,
      salaryExpectationMax: input.salaryExpectationMax,
      spokenLanguages: input.spokenLanguages,
      noticePeriod: input.noticePeriod,
      openToRelocation: input.openToRelocation,
    });

    try {
      await this.enqueueResumeEmbeddingUseCase.execute({
        resumeId: resume.id,
        userId: input.userId,
        reason: "resume-upsert",
      });
    } catch (error) {
      console.error("Failed to enqueue resume embedding job", error);
    }

    return resume;
  }
}
