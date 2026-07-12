import { ProfileViewport } from "@repo/schemas";
import { ProfileBlockEntity } from "../../entity/profile-block/profile-block-entity.js";

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
  ): Promise<ProfileBlockEntity[]>;
  findById(id: string): Promise<ProfileBlockEntity | null>;
  create(block: ProfileBlockEntity): Promise<ProfileBlockEntity>;
  update(block: ProfileBlockEntity): Promise<ProfileBlockEntity>;
  delete(id: string): Promise<void>;
  updatePositions(
    userId: string,
    viewport: ProfileViewport,
    positions: BlockPositionUpdate[],
  ): Promise<void>;
  deleteByTabId(tabId: string): Promise<void>;
}
