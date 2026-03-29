import { LinkEntity } from "../../entity/link/link-entity.js";
import { ILinksRepository } from "./link-repository.js";

export class InMemoryLinksRepository implements ILinksRepository {
  private links: LinkEntity[] = [];

  async findById(id: string): Promise<LinkEntity | null> {
    const link = this.links.find((candidate) => candidate.id === id);
    return link ?? null;
  }

  async findByUserId(userId: string): Promise<LinkEntity[]> {
    return this.links
      .filter((candidate) => candidate.userId === userId)
      .sort((a, b) => a.order - b.order);
  }

  async findPublicByUserId(userId: string): Promise<LinkEntity[]> {
    return this.links
      .filter((candidate) => candidate.userId === userId && candidate.isPublic)
      .sort((a, b) => a.order - b.order);
  }

  async findLastOrderByUserId(userId: string): Promise<number | null> {
    const userLinks = this.links.filter(
      (candidate) => candidate.userId === userId,
    );

    if (userLinks.length === 0) {
      return null;
    }

    return Math.max(...userLinks.map((link) => link.order));
  }

  async create(link: LinkEntity): Promise<LinkEntity> {
    this.links.push(link);
    return link;
  }

  async update(link: LinkEntity): Promise<LinkEntity> {
    const index = this.links.findIndex((candidate) => candidate.id === link.id);

    if (index === -1) {
      throw new Error(`Link with id '${link.id}' not found`);
    }

    this.links[index] = link;
    return link;
  }

  async delete(id: string): Promise<void> {
    this.links = this.links.filter((candidate) => candidate.id !== id);
  }

  async reorderByIds(userId: string, linkIds: string[]): Promise<void> {
    const positions = new Map<string, number>(
      linkIds.map((linkId, index) => [linkId, index]),
    );

    this.links = this.links.map((link) => {
      if (link.userId !== userId) {
        return link;
      }

      const position = positions.get(link.id);
      if (typeof position !== "number") {
        return link;
      }

      link.order = position;
      link.updateTimestamp();
      return link;
    });
  }

  getAll() {
    return [...this.links];
  }

  clear() {
    this.links = [];
  }
}
