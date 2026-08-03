import { ResourceNotFoundError } from "../../../errors/index.js";
import { ICandidateInteractionRepository } from "../../../repositories/candidate-interaction/candidate-interaction-repository.js";
import {
  CandidateContactRecord,
  IResumeSearchRepository,
} from "../../../repositories/resume-search/resume-search-repository.js";

export interface RevealCandidateContactInput {
  resumeId: string;
  recruiterId: string;
  queryText?: string | null;
  semanticSimilarity?: number | null;
  rankPosition?: number | null;
  searchSessionId?: string | null;
}

/**
 * The single path that hands a candidate's email address to a recruiter.
 *
 * The search listing used to include it, which meant any signed-up account
 * could page every candidate's contact details out of the product in bulk
 * (defect F3). Reveal is deliberately the opposite shape: one candidate, one
 * explicit request, and an audit row per access.
 *
 * The `CONTACT_CLICK` interaction is not a nice-to-have — it is what makes the
 * access reviewable, and it doubles as the strongest positive relevance signal
 * the ranking model has, since a recruiter only asks for contact details for
 * someone they actually want.
 */
export class RevealCandidateContactUseCase {
  constructor(
    private resumeSearchRepository: IResumeSearchRepository,
    private candidateInteractionRepository: ICandidateInteractionRepository,
  ) {}

  async execute(input: RevealCandidateContactInput): Promise<CandidateContactRecord> {
    const contact = await this.resumeSearchRepository.findCandidateContact(
      input.resumeId,
    );

    // A candidate who is not open to work is indistinguishable from one who
    // does not exist. Anything else turns this endpoint into an oracle for
    // "does this resume id exist".
    if (!contact) {
      throw new ResourceNotFoundError("Resume", input.resumeId);
    }

    await this.candidateInteractionRepository.create({
      resumeId: contact.resumeId,
      recruiterId: input.recruiterId,
      interactionType: "CONTACT_CLICK",
      queryText: input.queryText ?? null,
      semanticSimilarity: input.semanticSimilarity ?? null,
      rankPosition: input.rankPosition ?? null,
      metadata: input.searchSessionId
        ? { searchSessionId: input.searchSessionId }
        : null,
    });

    return contact;
  }
}
