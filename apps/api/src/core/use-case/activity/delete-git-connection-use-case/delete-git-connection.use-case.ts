import { ResourceNotFoundError } from "../../../errors/index.js";
import { IGitConnectionRepository } from "../../../repositories/git-connection/git-connection-repository.js";

export class DeleteGitConnectionUseCase {
  constructor(private gitConnectionRepository: IGitConnectionRepository) {}

  async execute(userId: string, connectionId: string) {
    const connection =
      await this.gitConnectionRepository.findById(connectionId);

    // Missing and not-yours are the SAME answer on purpose, matching health /
    // preview / ingest: answering them differently would be an oracle telling
    // any authenticated user which connection ids exist.
    if (!connection || connection.userId !== userId) {
      throw new ResourceNotFoundError("Git connection", connectionId);
    }

    // `activity_events.connection_id` cascades, so this also drops the history
    // this connection produced — deliberately: disconnecting a source the user
    // no longer wants published must not leave its events behind for a digest
    // to pick up later.
    await this.gitConnectionRepository.delete(connectionId);

    return { success: true };
  }
}
