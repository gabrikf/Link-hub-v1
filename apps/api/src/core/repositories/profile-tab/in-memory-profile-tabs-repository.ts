import { ProfileViewport } from "@repo/schemas";
import { ProfileTabEntity } from "../../entity/profile-tab/profile-tab-entity.js";
import { IProfileTabsRepository } from "./profile-tabs-repository.js";

export class InMemoryProfileTabsRepository implements IProfileTabsRepository {
  private tabs: ProfileTabEntity[] = [];

  async findByUserAndViewport(
    userId: string,
    viewport: ProfileViewport,
  ): Promise<ProfileTabEntity[]> {
    return this.tabs
      .filter(
        (candidate) =>
          candidate.userId === userId && candidate.viewport === viewport,
      )
      .sort((a, b) => a.order - b.order);
  }

  async findByGroupId(
    userId: string,
    groupId: string,
  ): Promise<ProfileTabEntity[]> {
    return this.tabs.filter(
      (candidate) =>
        candidate.userId === userId && candidate.groupId === groupId,
    );
  }

  async findById(id: string): Promise<ProfileTabEntity | null> {
    return this.tabs.find((candidate) => candidate.id === id) ?? null;
  }

  async create(tab: ProfileTabEntity): Promise<ProfileTabEntity> {
    this.tabs.push(tab);
    return tab;
  }

  async rename(id: string, title: string): Promise<ProfileTabEntity> {
    const tab = this.tabs.find((candidate) => candidate.id === id);

    if (!tab) {
      throw new Error(`Profile tab with id '${id}' not found`);
    }

    tab.rename(title);
    return tab;
  }

  async delete(id: string): Promise<void> {
    this.tabs = this.tabs.filter((candidate) => candidate.id !== id);
  }

  async deleteByGroupId(groupId: string): Promise<void> {
    this.tabs = this.tabs.filter((candidate) => candidate.groupId !== groupId);
  }

  async reorder(
    userId: string,
    viewport: ProfileViewport,
    tabIds: string[],
  ): Promise<void> {
    const positions = new Map<string, number>(
      tabIds.map((tabId, index) => [tabId, index]),
    );

    this.tabs = this.tabs.map((tab) => {
      if (tab.userId !== userId || tab.viewport !== viewport) {
        return tab;
      }

      const position = positions.get(tab.id);
      if (typeof position !== "number") {
        return tab;
      }

      tab.reorderTo(position);
      return tab;
    });
  }

  getAll() {
    return [...this.tabs];
  }

  clear() {
    this.tabs = [];
  }
}
