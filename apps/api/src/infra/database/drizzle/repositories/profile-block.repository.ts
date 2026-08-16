import { and, asc, eq, inArray } from "drizzle-orm";
import { BlockKind, ProfileViewport } from "@repo/schemas";
import { ProfileBlockEntity } from "../../../../core/entity/profile-block/profile-block-entity.js";
import {
  BlockPositionUpdate,
  IProfileBlocksRepository,
} from "../../../../core/repositories/profile-block/profile-block-repository.js";
import { TransactionContext } from "../../../../core/providers/unit-of-work/unit-of-work.js";
import { db } from "../index.js";
import { resolveExecutor } from "../executor.js";
import { profileBlocks } from "../schema.js";

type ProfileBlockRow = typeof profileBlocks.$inferSelect;

function toEntity(row: ProfileBlockRow): ProfileBlockEntity {
  return new ProfileBlockEntity({
    id: row.id,
    userId: row.userId,
    groupId: row.groupId,
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
    tx?: TransactionContext,
  ): Promise<ProfileBlockEntity[]> {
    const rows = await resolveExecutor(tx)
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

  async findByGroupId(
    userId: string,
    groupId: string,
    tx?: TransactionContext,
  ): Promise<ProfileBlockEntity[]> {
    const rows = await resolveExecutor(tx)
      .select()
      .from(profileBlocks)
      .where(
        and(
          eq(profileBlocks.userId, userId),
          eq(profileBlocks.groupId, groupId),
        ),
      );

    return rows.map(toEntity);
  }

  async findById(
    id: string,
    tx?: TransactionContext,
  ): Promise<ProfileBlockEntity | null> {
    const [row] = await resolveExecutor(tx)
      .select()
      .from(profileBlocks)
      .where(eq(profileBlocks.id, id));

    return row ? toEntity(row) : null;
  }

  async create(
    block: ProfileBlockEntity,
    tx?: TransactionContext,
  ): Promise<ProfileBlockEntity> {
    const [created] = await resolveExecutor(tx)
      .insert(profileBlocks)
      .values({
        id: block.id,
        userId: block.userId,
        groupId: block.groupId,
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

  async update(
    block: ProfileBlockEntity,
    tx?: TransactionContext,
  ): Promise<ProfileBlockEntity> {
    const [updated] = await resolveExecutor(tx)
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

  async deleteByGroupId(
    groupId: string,
    tx?: TransactionContext,
  ): Promise<void> {
    await resolveExecutor(tx)
      .delete(profileBlocks)
      .where(eq(profileBlocks.groupId, groupId));
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

  async findByTabId(
    tabId: string,
    tx?: TransactionContext,
  ): Promise<ProfileBlockEntity[]> {
    const rows = await resolveExecutor(tx)
      .select()
      .from(profileBlocks)
      .where(eq(profileBlocks.tabId, tabId))
      .orderBy(asc(profileBlocks.gridY), asc(profileBlocks.gridX));

    return rows.map(toEntity);
  }
}
