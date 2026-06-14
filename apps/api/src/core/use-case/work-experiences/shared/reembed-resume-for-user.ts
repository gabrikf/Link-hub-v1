import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";

/**
 * Job history feeds the recruiter search embedding, so any change to a user's
 * work experiences must refresh their resume vector. The user may not have a
 * resume yet (work history is independent), in which case there is nothing to
 * re-embed. Embedding refresh must never break the primary mutation, so this is
 * always best-effort.
 */
export async function reembedResumeForUser(
  userId: string,
  resumesRepository: IResumesRepository,
  enqueueResumeEmbeddingUseCase: EnqueueResumeEmbeddingUseCase,
): Promise<void> {
  try {
    const resume = await resumesRepository.findByUserId(userId);

    if (!resume) {
      return;
    }

    await enqueueResumeEmbeddingUseCase.execute({
      resumeId: resume.id,
      userId,
      reason: "work-experience-changed",
    });
  } catch (error) {
    console.error(
      "Failed to enqueue resume embedding after work experience change",
      error,
    );
  }
}
