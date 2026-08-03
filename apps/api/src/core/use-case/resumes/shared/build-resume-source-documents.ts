import {
  RESUME_EMBEDDING_DOCUMENT_LIMITS,
  type SearchSource,
} from "@repo/schemas";
import { PostEntity } from "../../../entity/post/post-entity.js";
import { ResumeEntity } from "../../../entity/resume/resume-entity.js";
import { ResumeSkillEntity } from "../../../entity/resume-skill/resume-skill-entity.js";
import { ResumeTitleEntity } from "../../../entity/resume-title/resume-title-entity.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";

/**
 * Per-source chunk builders for the recruiter embedding documents.
 *
 * There are two consumers and they MUST NOT drift:
 *  - `buildWeightedResumeDocument` — the blended, all-sources vector stored in
 *    `resume_embeddings`, which the unscoped search still matches against.
 *  - `ProcessResumeEmbeddingJobUseCase` — the three per-source vectors in
 *    `resume_section_embeddings`, which a `sources`-scoped search matches.
 *
 * Both are assembled from the *same* chunk functions below, so a change to how
 * a skill or a post is rendered lands in both at once. That is the whole reason
 * this file exists: two independent copies of "what a resume looks like as text"
 * would quietly diverge and make scoped and unscoped search disagree.
 */

/**
 * Field weights for the recruiter-facing embedding document.
 *
 * Token repetition is a deliberate, well-understood technique for biasing a
 * single dense embedding toward the signals recruiters actually search on.
 * Skills are the strongest predictor of a good match, so they dominate; titles
 * and concrete job history are the next most discriminating signals; the rest
 * (summary, seniority, location, logistics) provide context at base weight.
 *
 * `post` sits at 2, level with job history and below skills. Rationale: a
 * published post is *evidence* rather than a claim, which is exactly why it
 * deserves more than base weight — but a candidate's post stream is far longer
 * and noisier than their skill list (release notes, opinions, conference
 * write-ups), so weighting it above skills would let a prolific blogger
 * outrank a better-matched candidate who simply writes less. Level with job
 * history is the honest reading: "here is work I did", same as a role entry.
 */
export const RESUME_DOCUMENT_WEIGHTS = {
  skill: 4,
  title: 2,
  jobHistory: 2,
  post: 2,
  base: 1,
} as const;

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Clips to a character budget on a word boundary when one is nearby. Every
 * unbounded free-text field goes through this before it reaches the embedding
 * provider — see `RESUME_EMBEDDING_DOCUMENT_LIMITS` for why (defect F27).
 */
function clip(value: string, maxChars: number): string {
  const normalized = normalize(value);

  if (normalized.length <= maxChars) {
    return normalized;
  }

  const clipped = normalized.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > maxChars * 0.6 ? clipped.slice(0, lastSpace) : clipped)
    .trimEnd()
    .concat("…");
}

function repeatWeighted(value: string, weight: number): string {
  const normalized = normalize(value);
  if (!normalized) {
    return "";
  }
  return Array.from({ length: Math.max(1, weight) }, () => normalized).join(
    " ",
  );
}

/**
 * Dedupes case-insensitively while preserving the first-seen casing and order.
 */
function dedupe(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value) {
      continue;
    }
    const normalized = normalize(value);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function formatWorkExperienceLocation(
  experience: WorkExperienceEntity,
): string | null {
  const parts = dedupe([
    experience.locationCity,
    experience.locationState,
    experience.locationCountry,
  ]);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Drops empties and joins. Shared so every document has the same shape. */
export function joinDocumentChunks(chunks: string[]): string {
  const document = chunks.filter((chunk) => chunk.length > 0).join("\n");

  // Backstop: even with every per-field cap applied, a pathological resume
  // (100 skills x 100 chars, 12 max-length roles, 20 posts) should never be the
  // thing that discovers the model's context limit in production.
  return document.length > RESUME_EMBEDDING_DOCUMENT_LIMITS.documentChars
    ? document.slice(0, RESUME_EMBEDDING_DOCUMENT_LIMITS.documentChars)
    : document;
}

export interface ResumeSourceDocumentInput {
  resume: ResumeEntity;
  skills: ResumeSkillEntity[];
  titles: ResumeTitleEntity[];
  workExperiences?: WorkExperienceEntity[];
  posts?: PostEntity[];
}

/**
 * Skills and titles — the strongest self-declared signals, emitted first so the
 * blended document keeps the ordering it has always had.
 */
export function buildProfileHeadChunks(
  input: Pick<ResumeSourceDocumentInput, "skills" | "titles">,
): string[] {
  const chunks: string[] = [];

  const skillNames = dedupe(input.skills.map((skill) => skill.skillName));
  for (const skillName of skillNames) {
    chunks.push(
      repeatWeighted(`skill: ${skillName}`, RESUME_DOCUMENT_WEIGHTS.skill),
    );
  }

  // Years of experience per skill add depth, but at base weight so they don't
  // drown out the skill names themselves.
  for (const skill of input.skills) {
    if (skill.yearsExperience !== null && skill.skillName) {
      chunks.push(
        `skill_experience: ${normalize(skill.skillName)} ${skill.yearsExperience}y`,
      );
    }
  }

  const titleNames = dedupe(input.titles.map((title) => title.titleName));
  for (const titleName of titleNames) {
    chunks.push(
      repeatWeighted(`title: ${titleName}`, RESUME_DOCUMENT_WEIGHTS.title),
    );
  }

  return chunks;
}

/**
 * Headline, summary and the logistics a recruiter filters on. Base weight —
 * context, not the decisive signal.
 */
export function buildProfileTailChunks(
  input: Pick<ResumeSourceDocumentInput, "resume">,
): string[] {
  const chunks: string[] = [];
  const { resume } = input;

  if (resume.headlineTitle) {
    chunks.push(`headline: ${normalize(resume.headlineTitle)}`);
  }

  if (resume.summary) {
    chunks.push(`summary: ${normalize(resume.summary)}`);
  }

  if (resume.totalYearsExperience !== null) {
    chunks.push(`experience_years: ${resume.totalYearsExperience}`);
  }

  if (resume.location) {
    chunks.push(`location: ${normalize(resume.location)}`);
  }

  if (resume.seniorityLevel) {
    chunks.push(`seniority: ${normalize(resume.seniorityLevel)}`);
  }

  if (resume.workModel) {
    chunks.push(`work_model: ${normalize(resume.workModel)}`);
  }

  if (resume.contractType) {
    chunks.push(`contract_type: ${normalize(resume.contractType)}`);
  }

  if (resume.salaryExpectationMin !== null) {
    chunks.push(`salary_min: ${resume.salaryExpectationMin}`);
  }

  if (resume.salaryExpectationMax !== null) {
    chunks.push(`salary_max: ${resume.salaryExpectationMax}`);
  }

  const languages = dedupe(resume.spokenLanguages);
  if (languages.length > 0) {
    chunks.push(`languages: ${languages.join(", ")}`);
  }

  if (resume.noticePeriod) {
    chunks.push(`notice_period: ${normalize(resume.noticePeriod)}`);
  }

  chunks.push(`open_to_relocation: ${resume.openToRelocation}`);

  return chunks;
}

/**
 * Job history: the roles a candidate actually held, the companies, the stack
 * they used, and what they did. Weighted x2 because real experience is a strong
 * signal of fit beyond self-declared skills/titles.
 *
 * Bounded at `maxWorkExperiences` roles with each description clipped: a
 * 15-role history with 4 000-char descriptions is ~15k tokens, which the
 * embedding API rejects outright (defect F27).
 */
export function buildWorkChunks(
  input: Pick<ResumeSourceDocumentInput, "workExperiences">,
): string[] {
  const chunks: string[] = [];

  const workExperiences = [...(input.workExperiences ?? [])]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .slice(0, RESUME_EMBEDDING_DOCUMENT_LIMITS.maxWorkExperiences);

  for (const experience of workExperiences) {
    const headline = normalize(
      `${experience.title} at ${experience.companyName}`,
    );
    if (headline) {
      chunks.push(
        repeatWeighted(
          `experience: ${headline}`,
          RESUME_DOCUMENT_WEIGHTS.jobHistory,
        ),
      );
    }

    const stack = dedupe(experience.mainStack);
    if (stack.length > 0) {
      chunks.push(
        repeatWeighted(
          `experience_stack: ${stack.join(", ")}`,
          RESUME_DOCUMENT_WEIGHTS.jobHistory,
        ),
      );
    }

    if (experience.description) {
      chunks.push(
        `experience_detail: ${clip(
          experience.description,
          RESUME_EMBEDDING_DOCUMENT_LIMITS.workDescriptionChars,
        )}`,
      );
    }

    const where = formatWorkExperienceLocation(experience);
    if (where) {
      chunks.push(`experience_location: ${where}`);
    }
  }

  return chunks;
}

/**
 * Published posts — what the candidate says they actually shipped. Only
 * published posts are ever embedded: a draft is not evidence, and indexing it
 * would leak unpublished work into search ranking.
 *
 * Same bounding discipline as work history: at most `maxPosts` posts, each body
 * clipped to `postBodyChars`. A candidate with 500 posts must not be the reason
 * an embedding request 400s and their whole row disappears from search.
 */
export function buildPostChunks(
  input: Pick<ResumeSourceDocumentInput, "posts">,
): string[] {
  const chunks: string[] = [];

  const published = (input.posts ?? []).filter(
    (post) => post.status === "published",
  );

  // Most recent first, so the cap keeps what the candidate is working on now
  // rather than whatever they happened to write in 2019.
  const ordered = [...published]
    .sort((a, b) => {
      const left = (a.publishedAt ?? a.createdAt)?.getTime() ?? 0;
      const right = (b.publishedAt ?? b.createdAt)?.getTime() ?? 0;
      return right - left;
    })
    .slice(0, RESUME_EMBEDDING_DOCUMENT_LIMITS.maxPosts);

  for (const post of ordered) {
    if (post.title) {
      chunks.push(
        repeatWeighted(
          `post: ${normalize(post.title)}`,
          RESUME_DOCUMENT_WEIGHTS.post,
        ),
      );
    }

    const tags = dedupe(post.tags ?? []);
    if (tags.length > 0) {
      chunks.push(
        repeatWeighted(
          `post_tags: ${tags.join(", ")}`,
          RESUME_DOCUMENT_WEIGHTS.post,
        ),
      );
    }

    const body = clip(
      post.body,
      RESUME_EMBEDDING_DOCUMENT_LIMITS.postBodyChars,
    );
    if (body) {
      chunks.push(`post_detail: ${body}`);
    }
  }

  return chunks;
}

/**
 * The `profile` per-source document: everything the resume itself claims —
 * headline, summary, skills, titles, seniority and logistics. No job history,
 * no posts; those are their own sources.
 */
export function buildProfileSourceDocument(
  input: ResumeSourceDocumentInput,
): string {
  return joinDocumentChunks([
    ...buildProfileHeadChunks(input),
    ...buildProfileTailChunks(input),
  ]);
}

/** The `work` per-source document: the work-experience history, nothing else. */
export function buildWorkSourceDocument(
  input: ResumeSourceDocumentInput,
): string {
  return joinDocumentChunks(buildWorkChunks(input));
}

/** The `posts` per-source document: published posts, nothing else. */
export function buildPostsSourceDocument(
  input: ResumeSourceDocumentInput,
): string {
  return joinDocumentChunks(buildPostChunks(input));
}

/**
 * Every per-source document keyed by source, with empty sources omitted.
 *
 * An empty string means "this candidate has nothing here" — a candidate with no
 * posts must not get a posts vector, because embedding the empty document would
 * give every post-less candidate the *same* vector and they would all match any
 * posts-scoped query equally.
 */
export function buildResumeSourceDocuments(
  input: ResumeSourceDocumentInput,
): Partial<Record<SearchSource, string>> {
  const documents: Partial<Record<SearchSource, string>> = {};

  const profile = buildProfileSourceDocument(input);
  if (profile) {
    documents.profile = profile;
  }

  const work = buildWorkSourceDocument(input);
  if (work) {
    documents.work = work;
  }

  const posts = buildPostsSourceDocument(input);
  if (posts) {
    documents.posts = posts;
  }

  return documents;
}
