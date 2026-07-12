import { and, asc, eq, inArray } from "drizzle-orm";
import { BlockKind, ProfileViewport } from "@repo/schemas";
import { ProfileBlockEntity } from "../../../../core/entity/profile-block/profile-block-entity.js";
import {
  BlockPositionUpdate,
  IProfileBlocksRepository,
} from "../../../../core/repositories/profile-block/profile-block-repository.js";
import { db } from "../index.js";
import { profileBlocks } from "../schema.js";

type ProfileBlockRow = typeof profileBlocks.$inferSelect;

function toEntity(row: ProfileBlockRow): ProfileBlockEntity {
  return new ProfileBlockEntity({
    id: row.id,
    userId: row.userId,
    viewport: row.viewport as ProfileViewport,
    tabId: row.tabId,
    kind: row.kind as BlockKind,
    gridX: row.gridX,
    gridY: row.gridY,
    gridW: row.gridW,
    gridH: row.gridH,
    isVisible: row.isVisible,
    pinnedAllTabs: row.pinnedAllTabs,
    config: row.config ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleProfileBlocksRepository
  implements IProfileBlocksRepository
{
  async findByUserAndViewport(
    userId: string,
    viewport: ProfileViewport,
  ): Promise<ProfileBlockEntity[]> {
    const rows = await db
      .select()
      .from(profileBlocks)
      .where(
        and(
          eq(profileBlocks.userId, userId),
          eq(profileBlocks.viewport, viewport),
        ),
      )
      .orderBy(
        asc(profileBlocks.gridY),
        asc(profileBlocks.gridX),
        asc(profileBlocks.createdAt),
      );

    return rows.map(toEntity);
  }

  async findById(id: string): Promise<ProfileBlockEntity | null> {
    const [row] = await db
      .select()
      .from(profileBlocks)
      .where(eq(profileBlocks.id, id));

    return row ? toEntity(row) : null;
  }

  async create(block: ProfileBlockEntity): Promise<ProfileBlockEntity> {
    const [created] = await db
      .insert(profileBlocks)
      .values({
        id: block.id,
        userId: block.userId,
        viewport: block.viewport,
        tabId: block.tabId,
        kind: block.kind,
        gridX: block.gridX,
        gridY: block.gridY,
        gridW: block.gridW,
        gridH: block.gridH,
        isVisible: block.isVisible,
        pinnedAllTabs: block.pinnedAllTabs,
        config: block.config ?? null,
        createdAt: block.createdAt,
        updatedAt: block.updatedAt,
      })
      .returning();

    return toEntity(created);
  }

  async update(block: ProfileBlockEntity): Promise<ProfileBlockEntity> {
    const [updated] = await db
      .update(profileBlocks)
      .set({
        tabId: block.tabId,
        kind: block.kind,
        gridX: block.gridX,
        gridY: block.gridY,
        gridW: block.gridW,
        gridH: block.gridH,
        isVisible: block.isVisible,
        pinnedAllTabs: block.pinnedAllTabs,
        config: block.config ?? null,
        updatedAt: block.updatedAt,
      })
      .where(eq(profileBlocks.id, block.id))
      .returning();

    if (!updated) {
      throw new Error(`Profile block with id '${block.id}' not found`);
    }

    return toEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await db.delete(profileBlocks).where(eq(profileBlocks.id, id));
  }

  async updatePositions(
    userId: string,
    viewport: ProfileViewport,
    positions: BlockPositionUpdate[],
  ): Promise<void> {
    if (positions.length === 0) {
      return;
    }

    const ids = positions.map((position) => position.id);

    const rows = await db
      .select({ id: profileBlocks.id })
      .from(profileBlocks)
      .where(
        and(
          eq(profileBlocks.userId, userId),
          eq(profileBlocks.viewport, viewport),
          inArray(profileBlocks.id, ids),
        ),
      );

    const foundIds = new Set(rows.map((row) => row.id));

    // Persist every drag/resize in one transaction so the grid can't end up
    // half-committed if one update fails.
    await db.transaction(async (tx) => {
      await Promise.all(
        positions
          .filter((position) => foundIds.has(position.id))
          .map((position) =>
            tx
              .update(profileBlocks)
              .set({
                gridX: position.gridX,
                gridY: position.gridY,
                gridW: position.gridW,
                gridH: position.gridH,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(profileBlocks.userId, userId),
                  eq(profileBlocks.viewport, viewport),
                  eq(profileBlocks.id, position.id),
                ),
              ),
          ),
      );
    });
  }

  async deleteByTabId(tabId: string): Promise<void> {
    await db.delete(profileBlocks).where(eq(profileBlocks.tabId, tabId));
  }
}
