import type { AgentDisclosureLevel, AgentPolicy } from "@repo/schemas";
import { ResourceNotFoundError } from "../../../errors/index.js";
import type { IUsersRepository } from "../../../repositories/user/user-repository.js";
import type { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";
import { GetAgentPolicyUseCase } from "../get-agent-policy-use-case/get-agent-policy.use-case.js";

export interface IUpdateAgentPolicyInput {
  userId: string;
  disclosureLevel?: AgentDisclosureLevel;
  blockedTerms?: string[];
}

/**
 * Changes the account-level disclosure contract.
 *
 * Reachable only from a real session (see the route's `authGuard`): letting a
 * PAT widen its own policy would make the policy decorative. Both fields are
 * optional so the settings UI can save one control at a time.
 */
export class UpdateAgentPolicyUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private workExperienceRepository: IWorkExperienceRepository,
  ) {}

  async execute(input: IUpdateAgentPolicyInput): Promise<AgentPolicy> {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    user.updateAgentPolicy({
      disclosureLevel: input.disclosureLevel,
      // Normalized here rather than in the schema so a term the user typed with
      // stray whitespace can't become a rule that never matches anything.
      blockedTerms: input.blockedTerms
        ? normalizeBlockedTerms(input.blockedTerms)
        : undefined,
    });

    await this.usersRepository.update(user);

    return new GetAgentPolicyUseCase(
      this.usersRepository,
      this.workExperienceRepository,
    ).execute(input.userId);
  }
}

/** Trims, drops empties, and de-duplicates case-insensitively. */
function normalizeBlockedTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of terms) {
    const term = raw.trim();
    if (term.length < 2) continue;

    const key = term.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(term);
  }

  return result;
}
