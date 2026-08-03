import type { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import type { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";

/**
 * Posts are part of what recruiter search matches on, so publishing, editing or
 * deleting one has to refresh the user's resume vector — otherwise the work an
 * agent just published stays invisible to search.
 *
 * Mirrors `reembedResumeForUser` in the work-experiences domain: the user may
 * have no resume row yet (posts are independent of the resume), which is a
 * no-op rather than an error, and a failure here must never fail the mutation
 * the user actually asked for.
 */
export async function reembedResumeAfterPost(
  userId: string,
  resumesRepository?: IResumesRepository,
  enqueueResumeEmbeddingUseCase?: EnqueueResumeEmbeddingUseCase,
): Promise<void> {
  if (!resumesRepository || !enqueueResumeEmbeddingUseCase) return;

  try {
    const resume = await resumesRepository.findByUserId(userId);

    if (!resume) {
      return;
    }

    await enqueueResumeEmbeddingUseCase.execute({
      resumeId: resume.id,
      userId,
      // No dedicated reason exists for posts yet and adding one would mean
      // touching the shared queue contract another agent owns; the job only
      // uses it for logging, and the payload is otherwise identical.
      reason: "work-experience-changed",
    });
  } catch (error) {
    console.error("Failed to enqueue resume embedding after post change", error);
  }
}
