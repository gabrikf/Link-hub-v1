import { ProfileViewport } from "@repo/schemas";
import { ProfileTabEntity } from "../../entity/profile-tab/profile-tab-entity.js";
import { TransactionContext } from "../../providers/unit-of-work/unit-of-work.js";

export interface IProfileTabsRepository {
  findByUserAndViewport(
    userId: string,
    viewport: ProfileViewport,
    tx?: TransactionContext,
  ): Promise<ProfileTabEntity[]>;
  /** All tab rows (both viewports) sharing a logical identity. */
  findByGroupId(
    userId: string,
    groupId: string,
    tx?: TransactionContext,
  ): Promise<ProfileTabEntity[]>;
  findById(
    id: string,
    tx?: TransactionContext,
  ): Promise<ProfileTabEntity | null>;
  create(
    tab: ProfileTabEntity,
    tx?: TransactionContext,
  ): Promise<ProfileTabEntity>;
  rename(id: string, title: string): Promise<ProfileTabEntity>;
  delete(id: string): Promise<void>;
  /** Delete every tab row (both viewports) sharing a logical identity. */
  deleteByGroupId(groupId: string, tx?: TransactionContext): Promise<void>;
  reorder(
    userId: string,
    viewport: ProfileViewport,
    tabIds: string[],
  ): Promise<void>;
}
