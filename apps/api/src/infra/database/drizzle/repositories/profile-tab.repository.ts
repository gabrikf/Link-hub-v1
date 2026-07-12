import { and, asc, eq, inArray } from "drizzle-orm";
import { ProfileViewport } from "@repo/schemas";
import { ProfileTabEntity } from "../../../../core/entity/profile-tab/profile-tab-entity.js";
import { IProfileTabsRepository } from "../../../../core/repositories/profile-tab/profile-tabs-repository.js";
import { db } from "../index.js";
import { profileTabs } from "../schema.js";

type ProfileTabRow = typeof profileTabs.$inferSelect;

function toEntity(row: ProfileTabRow): ProfileTabEntity {
  return new ProfileTabEntity({
    id: row.id,
    userId: row.userId,
    viewport: row.viewport as ProfileViewport,
    title: row.title,
    order: row.order,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleProfileTabsRepository implements IProfileTabsRepository {
  async findByUserAndViewport(
    userId: string,
    viewport: ProfileViewport,
  ): Promise<ProfileTabEntity[]> {
    const rows = await db
      .select()
      .from(profileTabs)
      .where(
        and(
          eq(profileTabs.userId, userId),
          eq(profileTabs.viewport, viewport),
        ),
      )
      .orderBy(asc(profileTabs.order), asc(profileTabs.createdAt));

    return rows.map(toEntity);
  }

  async findById(id: string): Promise<ProfileTabEntity | null> {
    const [row] = await db
      .select()
      .from(profileTabs)
      .where(eq(profileTabs.id, id));

    return row ? toEntity(row) : null;
  }

  async create(tab: ProfileTabEntity): Promise<ProfileTabEntity> {
    const [created] = await db
      .insert(profileTabs)
      .values({
        id: tab.id,
        userId: tab.userId,
        viewport: tab.viewport,
        title: tab.title,
        order: tab.order,
        createdAt: tab.createdAt,
        updatedAt: tab.updatedAt,
      })
      .returning();

    return toEntity(created);
  }

  async rename(id: string, title: string): Promise<ProfileTabEntity> {
    const [updated] = await db
      .update(profileTabs)
      .set({ title, updatedAt: new Date() })
      .where(eq(profileTabs.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Profile tab with id '${id}' not found`);
    }

    return toEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await db.delete(profileTabs).where(eq(profileTabs.id, id));
  }

  async reorder(
    userId: string,
    viewport: ProfileViewport,
    tabIds: string[],
  ): Promise<void> {
    if (tabIds.length === 0) {
      return;
    }

    const rows = await db
      .select({ id: profileTabs.id })
      .from(profileTabs)
      .where(
        and(
          eq(profileTabs.userId, userId),
          eq(profileTabs.viewport, viewport),
          inArray(profileTabs.id, tabIds),
        ),
      );

    const foundIds = new Set(rows.map((row) => row.id));

    // Wrap all order updates in a transaction so a mid-flight failure can't
    // leave the user with a partially-reordered set of tabs.
    await db.transaction(async (tx) => {
      await Promise.all(
        tabIds
          .filter((tabId) => foundIds.has(tabId))
          .map((tabId, index) =>
            tx
              .update(profileTabs)
              .set({ order: index, updatedAt: new Date() })
              .where(
                and(
                  eq(profileTabs.userId, userId),
                  eq(profileTabs.viewport, viewport),
                  eq(profileTabs.id, tabId),
                ),
              ),
          ),
      );
    });
  }
}
