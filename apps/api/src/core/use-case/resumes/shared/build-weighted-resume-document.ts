import { PostEntity } from "../../../entity/post/post-entity.js";
import { ResumeEntity } from "../../../entity/resume/resume-entity.js";
import { ResumeSkillEntity } from "../../../entity/resume-skill/resume-skill-entity.js";
import { ResumeTitleEntity } from "../../../entity/resume-title/resume-title-entity.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import {
  buildPostChunks,
  buildProfileHeadChunks,
  buildProfileTailChunks,
  buildWorkChunks,
  joinDocumentChunks,
} from "./build-resume-source-documents.js";

// Re-exported so existing importers keep working; the weights themselves now
// live with the chunk builders that apply them.
export { RESUME_DOCUMENT_WEIGHTS } from "./build-resume-source-documents.js";

export interface BuildWeightedResumeDocumentInput {
  resume: ResumeEntity;
  skills: ResumeSkillEntity[];
  titles: ResumeTitleEntity[];
  workExperiences?: WorkExperienceEntity[];
  /** Published posts. Drafts are filtered out by the post chunk builder. */
  posts?: PostEntity[];
}

/**
 * Builds the blended text document that gets embedded into `resume_embeddings`
 * — the single vector the unscoped recruiter search still matches against.
 *
 * It is assembled from exactly the same chunk builders that produce the
 * per-source documents in `resume_section_embeddings`, so the blended and the
 * scoped views of a candidate can never describe them differently. The section
 * order (skills/titles → job history → resume core → posts) is preserved from
 * the original implementation so an unchanged resume keeps its content hash and
 * costs no re-embedding when this refactor ships.
 */
export function buildWeightedResumeDocument(
  input: BuildWeightedResumeDocumentInput,
): string {
  return joinDocumentChunks([
    ...buildProfileHeadChunks(input),
    ...buildWorkChunks(input),
    ...buildProfileTailChunks(input),
    ...buildPostChunks(input),
  ]);
}
