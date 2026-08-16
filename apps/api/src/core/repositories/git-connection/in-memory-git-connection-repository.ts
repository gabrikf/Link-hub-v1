import type { GitConnectionProvider } from "@repo/schemas";
import { GitConnectionEntity } from "../../entity/git-connection/git-connection-entity.js";
import { IGitConnectionRepository } from "./git-connection-repository.js";

export class InMemoryGitConnectionRepository
  implements IGitConnectionRepository
{
  public items: GitConnectionEntity[] = [];

  seed(connection: GitConnectionEntity): GitConnectionEntity {
    this.items.push(connection);
    return connection;
  }

  async create(connection: GitConnectionEntity): Promise<GitConnectionEntity> {
    this.items.push(connection);
    return connection;
  }

  async findById(id: string): Promise<GitConnectionEntity | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async findByUserId(userId: string): Promise<GitConnectionEntity[]> {
    return this.items
      .filter((item) => item.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findByExternalAccount(
    provider: GitConnectionProvider,
    externalAccountId: string,
  ): Promise<GitConnectionEntity | null> {
    return (
      this.items.find(
        (item) =>
          item.provider === provider &&
          // Mirrors the partial unique index: a null account id is not an
          // identity, so it must never be matched by a webhook lookup.
          item.externalAccountId !== null &&
          item.externalAccountId === externalAccountId,
      ) ?? null
    );
  }

  async listAutoPostEnabled(): Promise<GitConnectionEntity[]> {
    return this.items.filter((item) => item.autoPostEnabled);
  }

  async update(connection: GitConnectionEntity): Promise<GitConnectionEntity> {
    const index = this.items.findIndex((item) => item.id === connection.id);

    if (index === -1) {
      throw new Error(`Git connection with id '${connection.id}' not found`);
    }

    this.items[index] = connection;
    return connection;
  }

  async delete(id: string): Promise<void> {
    this.items = this.items.filter((item) => item.id !== id);
  }

  clear() {
    this.items = [];
  }
}
