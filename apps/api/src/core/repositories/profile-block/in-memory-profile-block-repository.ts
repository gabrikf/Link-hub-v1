import { ProfileViewport } from "@repo/schemas";
import { ProfileBlockEntity } from "../../entity/profile-block/profile-block-entity.js";
import {
  BlockPositionUpdate,
  IProfileBlocksRepository,
} from "./profile-block-repository.js";

export class InMemoryProfileBlocksRepository
  implements IProfileBlocksRepository
{
  private blocks: ProfileBlockEntity[] = [];

  async findByUserAndViewport(
    userId: string,
    viewport: ProfileViewport,
  ): Promise<ProfileBlockEntity[]> {
    return this.blocks
      .filter(
        (candidate) =>
          candidate.userId === userId && candidate.viewport === viewport,
      )
      .sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX);
  }

  async findByGroupId(
    userId: string,
    groupId: string,
  ): Promise<ProfileBlockEntity[]> {
    return this.blocks.filter(
      (candidate) =>
        candidate.userId === userId && candidate.groupId === groupId,
    );
  }

  async findById(id: string): Promise<ProfileBlockEntity | null> {
    return this.blocks.find((candidate) => candidate.id === id) ?? null;
  }

  async create(block: ProfileBlockEntity): Promise<ProfileBlockEntity> {
    this.blocks.push(block);
    return block;
  }

  async update(block: ProfileBlockEntity): Promise<ProfileBlockEntity> {
    const index = this.blocks.findIndex(
      (candidate) => candidate.id === block.id,
    );

    if (index === -1) {
      throw new Error(`Profile block with id '${block.id}' not found`);
    }

    this.blocks[index] = block;
    return block;
  }

  async delete(id: string): Promise<void> {
    this.blocks = this.blocks.filter((candidate) => candidate.id !== id);
  }

  async deleteByGroupId(groupId: string): Promise<void> {
    this.blocks = this.blocks.filter(
      (candidate) => candidate.groupId !== groupId,
    );
  }

  async updatePositions(
    userId: string,
    viewport: ProfileViewport,
    positions: BlockPositionUpdate[],
  ): Promise<void> {
    const byId = new Map<string, BlockPositionUpdate>(
      positions.map((position) => [position.id, position]),
    );

    this.blocks = this.blocks.map((block) => {
      if (block.userId !== userId || block.viewport !== viewport) {
        return block;
      }

      const position = byId.get(block.id);
      if (!position) {
        return block;
      }

      block.setPosition({
        gridX: position.gridX,
        gridY: position.gridY,
        gridW: position.gridW,
        gridH: position.gridH,
      });
      return block;
    });
  }

  async deleteByTabId(tabId: string): Promise<void> {
    this.blocks = this.blocks.filter((candidate) => candidate.tabId !== tabId);
  }

  getAll() {
    return [...this.blocks];
  }

  clear() {
    this.blocks = [];
  }
}
