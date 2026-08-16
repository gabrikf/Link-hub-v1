import { IGitConnectionRepository } from "../../../repositories/git-connection/git-connection-repository.js";

export class ListGitConnectionsUseCase {
  constructor(private gitConnectionRepository: IGitConnectionRepository) {}

  async execute(userId: string) {
    return this.gitConnectionRepository.findByUserId(userId);
  }
}
