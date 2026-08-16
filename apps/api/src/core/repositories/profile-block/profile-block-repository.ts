import { ProfileViewport } from "@repo/schemas";
import { ProfileBlockEntity } from "../../entity/profile-block/profile-block-entity.js";
import { TransactionContext } from "../../providers/unit-of-work/unit-of-work.js";

export interface BlockPositionUpdate {
  id: string;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
}

export interface IProfileBlocksRepository {
  findByUserAndViewport(
    userId: string,
    viewport: ProfileViewport,
    tx?: TransactionContext,
  ): Promise<ProfileBlockEntity[]>;
  /** All block rows (both viewports) sharing a logical identity. */
  findByGroupId(
    userId: string,
    groupId: string,
    tx?: TransactionContext,
  ): Promise<ProfileBlockEntity[]>;
  /**
   * Blocks anchored to one tab. Since a tab belongs to a single viewport, this
   * only ever returns rows of that viewport — used to re-home them when the tab
   * is deleted.
   */
  findByTabId(
    tabId: string,
    tx?: TransactionContext,
  ): Promise<ProfileBlockEntity[]>;
  findById(
    id: string,
    tx?: TransactionContext,
  ): Promise<ProfileBlockEntity | null>;
  create(
    block: ProfileBlockEntity,
    tx?: TransactionContext,
  ): Promise<ProfileBlockEntity>;
  update(
    block: ProfileBlockEntity,
    tx?: TransactionContext,
  ): Promise<ProfileBlockEntity>;
  delete(id: string): Promise<void>;
  /** Delete every block row (both viewports) sharing a logical identity. */
  deleteByGroupId(groupId: string, tx?: TransactionContext): Promise<void>;
  updatePositions(
    userId: string,
    viewport: ProfileViewport,
    positions: BlockPositionUpdate[],
  ): Promise<void>;
}
