import { createHash } from "node:crypto";
import { DEFAULT_SEARCH_SOURCES, type SearchSource } from "@repo/schemas";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { PostEntity } from "../../../entity/post/post-entity.js";
import { IEmbeddingProvider } from "../../../providers/embedding/embedding-provider.js";
import { ResumeEmbeddingJobPayload } from "../../../providers/queue/resume-embedding-queue.js";
import { IPostRepository } from "../../../repositories/post/post-repository.js";
import { IResumeEmbeddingsRepository } from "../../../repositories/resume-embedding/resume-embedding-repository.js";
import { IResumeSectionEmbeddingsRepository } from "../../../repositories/resume-section-embedding/resume-section-embedding-repository.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { IResumeSkillRepository } from "../../../repositories/resume-skill/resume-skill-repository.js";
import { IResumeTitleRepository } from "../../../repositories/resume-title/resume-title-repository.js";
import { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";
import { buildResumeSourceDocuments } from "../shared/build-resume-source-documents.js";
import { buildWeightedResumeDocument } from "../shared/build-weighted-resume-document.js";
import {
  resolveEmbeddingModel,
  resolveEmbeddingVersion,
  resolveEmbeddingVersionText,
} from "../shared/embedding-config.js";

/**
 * How many published posts are pulled in to build the `posts` source document.
 * Wider than `RESUME_EMBEDDING_DOCUMENT_LIMITS.maxPosts` so the builder gets to
 * choose the most recent ones rather than whatever page 1 happened to hold.
 */
const POSTS_FETCH_LIMIT = 100;

function hashDocument(document: string): string {
  return createHash("sha256").update(document).digest("hex");
}

export class ProcessResumeEmbeddingJobUseCase {
  constructor(
    private resumesRepository: IResumesRepository,
    private resumeSkillRepository: IResumeSkillRepository,
    private resumeTitleRepository: IResumeTitleRepository,
    private workExperienceRepository: IWorkExperienceRepository,
    private resumeEmbeddingsRepository: IResumeEmbeddingsRepository,
    private embeddingProvider: IEmbeddingProvider,
    /**
     * Optional so the blended vector keeps being produced even in a wiring that
     * predates per-source search (and so existing call sites stay valid). When
     * both are present the job also maintains `resume_section_embeddings`.
     */
    private postRepository?: IPostRepository,
    private resumeSectionEmbeddingsRepository?: IResumeSectionEmbeddingsRepository,
  ) {}

  async execute(job: ResumeEmbeddingJobPayload): Promise<void> {
    const resume = await this.resumesRepository.findById(job.resumeId);

    if (!resume) {
      throw new ResourceNotFoundError("Resume", job.resumeId);
    }

    const [skills, titles, workExperiences, posts] = await Promise.all([
      this.resumeSkillRepository.listByResumeId(resume.id),
      this.resumeTitleRepository.listByResumeId(resume.id),
      this.workExperienceRepository.findByUserId(resume.userId),
      this.loadPublishedPosts(resume.userId),
    ]);

    const documentInput = {
      resume,
      skills,
      titles,
      workExperiences,
      posts,
    };

    const currentModel = resolveEmbeddingModel();
    const currentVersion = resolveEmbeddingVersion();

    await this.upsertBlendedEmbedding(
      documentInput,
      currentModel,
      currentVersion,
    );

    await this.upsertSectionEmbeddings(
      documentInput,
      currentModel,
      resolveEmbeddingVersionText(),
    );
  }

  private async loadPublishedPosts(userId: string): Promise<PostEntity[]> {
    if (!this.postRepository) {
      return [];
    }

    return this.postRepository.listPublishedByUserId(userId, {
      limit: POSTS_FETCH_LIMIT,
      offset: 0,
    });
  }

  /**
   * The blended, all-sources vector — still what an unscoped recruiter search
   * matches against, so it is maintained exactly as before.
   */
  private async upsertBlendedEmbedding(
    input: Parameters<typeof buildWeightedResumeDocument>[0],
    model: string,
    version: number,
  ): Promise<void> {
    const weightedDocument = buildWeightedResumeDocument(input);
    const currentContentHash = hashDocument(weightedDocument);

    const existingEmbedding =
      await this.resumeEmbeddingsRepository.findByResumeId(input.resume.id);

    if (
      existingEmbedding &&
      existingEmbedding.contentHash === currentContentHash &&
      existingEmbedding.embeddingModel === model &&
      existingEmbedding.embeddingVersion === version
    ) {
      return;
    }

    const embedding =
      await this.embeddingProvider.createEmbedding(weightedDocument);

    await this.resumeEmbeddingsRepository.upsert({
      resumeId: input.resume.id,
      userId: input.resume.userId,
      embedding,
      contentHash: currentContentHash,
      embeddingModel: model,
      embeddingVersion: version,
    });
  }

  /**
   * The three per-source vectors.
   *
   * Each source is hashed independently: editing a job description must not
   * cost an embedding call for the untouched `profile` and `posts` documents.
   * A source the candidate has no content for is skipped, and any vector left
   * over from when they *did* have content is deleted — a stale `posts` vector
   * would keep answering posts-scoped searches for posts that no longer exist.
   */
  private async upsertSectionEmbeddings(
    input: Parameters<typeof buildResumeSourceDocuments>[0],
    model: string,
    version: string,
  ): Promise<void> {
    const repository = this.resumeSectionEmbeddingsRepository;

    if (!repository) {
      return;
    }

    const documents = buildResumeSourceDocuments(input);
    const existing = await repository.findByUserId(input.resume.userId);
    const existingBySource = new Map(
      existing.map((record) => [record.source, record]),
    );

    for (const source of DEFAULT_SEARCH_SOURCES as readonly SearchSource[]) {
      const document = documents[source];

      if (!document) {
        if (existingBySource.has(source)) {
          await repository.deleteByUserIdAndSource(input.resume.userId, source);
        }
        continue;
      }

      const contentHash = hashDocument(document);
      const current = existingBySource.get(source);

      if (
        current &&
        current.contentHash === contentHash &&
        current.embeddingModel === model &&
        current.embeddingVersion === version
      ) {
        continue;
      }

      const embedding = await this.embeddingProvider.createEmbedding(document);

      await repository.upsert({
        userId: input.resume.userId,
        source,
        embedding,
        contentHash,
        embeddingModel: model,
        embeddingVersion: version,
      });
    }
  }
}
