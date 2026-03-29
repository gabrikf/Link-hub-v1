import { ILinksRepository } from "../../../repositories/link/link-repository.js";

export class ListUserLinksUseCase {
  constructor(private linksRepository: ILinksRepository) {}

  async execute(userId: string) {
    return this.linksRepository.findByUserId(userId);
  }
}
