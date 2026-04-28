import { ResourceNotFoundError } from "../../../errors/index.js";
import { createHash } from "node:crypto";
import { IEmbeddingProvider } from "../../../providers/embedding/embedding-provider.js";
import { ResumeEmbeddingJobPayload } from "../../../providers/queue/resume-embedding-queue.js";
import { IResumeEmbeddingsRepository } from "../../../repositories/resume-embedding/resume-embedding-repository.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { IResumeSkillRepository } from "../../../repositories/resume-skill/resume-skill-repository.js";
import { IResumeTitleRepository } from "../../../repositories/resume-title/resume-title-repository.js";
import { buildWeightedResumeDocument } from "../shared/build-weighted-resume-document.js";

export class ProcessResumeEmbeddingJobUseCase {
  constructor(
    private resumesRepository: IResumesRepository,
    private resumeSkillRepository: IResumeSkillRepository,
    private resumeTitleRepository: IResumeTitleRepository,
    private resumeEmbeddingsRepository: IResumeEmbeddingsRepository,
    private embeddingProvider: IEmbeddingProvider,
  ) {}

  async execute(job: ResumeEmbeddingJobPayload): Promise<void> {
    const resume = await this.resumesRepository.findById(job.resumeId);

    if (!resume) {
      throw new ResourceNotFoundError("Resume", job.resumeId);
    }

    const [skills, titles] = await Promise.all([
      this.resumeSkillRepository.listByResumeId(resume.id),
      this.resumeTitleRepository.listByResumeId(resume.id),
    ]);

    const weightedDocument = buildWeightedResumeDocument({
      resume,
      skills,
      titles,
    });

    const currentContentHash = createHash("sha256")
      .update(weightedDocument)
      .digest("hex");
    const currentModel =
      process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
    const currentVersion = Number(process.env.EMBEDDING_VERSION ?? "1");

    const existingEmbedding =
      await this.resumeEmbeddingsRepository.findByResumeId(resume.id);

    if (
      existingEmbedding &&
      existingEmbedding.contentHash === currentContentHash &&
      existingEmbedding.embeddingModel === currentModel &&
      existingEmbedding.embeddingVersion === currentVersion
    ) {
      return;
    }

    const embedding =
      await this.embeddingProvider.createEmbedding(weightedDocument);

    await this.resumeEmbeddingsRepository.upsert({
      resumeId: resume.id,
      userId: resume.userId,
      embedding,
      contentHash: currentContentHash,
      embeddingModel: currentModel,
      embeddingVersion: currentVersion,
    });
  }
}
