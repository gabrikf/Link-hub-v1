import { ProfileViewport } from "@repo/schemas";
import { ProfileTabEntity } from "../../entity/profile-tab/profile-tab-entity.js";

export interface IProfileTabsRepository {
  findByUserAndViewport(
    userId: string,
    viewport: ProfileViewport,
  ): Promise<ProfileTabEntity[]>;
  findById(id: string): Promise<ProfileTabEntity | null>;
  create(tab: ProfileTabEntity): Promise<ProfileTabEntity>;
  rename(id: string, title: string): Promise<ProfileTabEntity>;
  delete(id: string): Promise<void>;
  reorder(
    userId: string,
    viewport: ProfileViewport,
    tabIds: string[],
  ): Promise<void>;
}
