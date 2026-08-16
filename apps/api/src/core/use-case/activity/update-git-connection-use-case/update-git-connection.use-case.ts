import type {
  AgentDisclosureLevel,
  DigestCadence,
  GitConnectionKind,
} from "@repo/schemas";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { IGitConnectionRepository } from "../../../repositories/git-connection/git-connection-repository.js";

/**
 * Note what is absent: `provider`, `externalAccountId` and `webhookSecret`.
 *
 * Those three are the identity a delivery is routed and authenticated by, so
 * repointing them is not an edit of a connection — it is replacing which forge
 * account may write into this user's activity log while every token and webhook
 * URL that references it keeps working. That is a create/delete decision, not a
 * PATCH, and it is why the update input schema does not expose them either.
 */
export interface IUpdateGitConnectionInput {
  userId: string;
  connectionId: string;
  displayName?: string;
  kind?: GitConnectionKind;
  workExperienceId?: string | null;
  disclosureLevelOverride?: AgentDisclosureLevel | null;
  autoPostEnabled?: boolean;
  cadence?: DigestCadence;
  includeAgentSummary?: boolean;
}

export class UpdateGitConnectionUseCase {
  constructor(private gitConnectionRepository: IGitConnectionRepository) {}

  async execute(input: IUpdateGitConnectionInput) {
    const connection = await this.gitConnectionRepository.findById(
      input.connectionId,
    );

    // Missing and not-yours are the SAME answer on purpose, matching health /
    // preview / ingest: answering them differently would be an oracle telling
    // any authenticated user which connection ids exist.
    if (!connection || connection.userId !== input.userId) {
      throw new ResourceNotFoundError("Git connection", input.connectionId);
    }

    connection.updateSettings({
      displayName: input.displayName,
      kind: input.kind,
      workExperienceId: input.workExperienceId,
      disclosureLevelOverride: input.disclosureLevelOverride,
      autoPostEnabled: input.autoPostEnabled,
      cadence: input.cadence,
      includeAgentSummary: input.includeAgentSummary,
    });

    return this.gitConnectionRepository.update(connection);
  }
}
