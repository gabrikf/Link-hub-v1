import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { LinkEntity } from "../../../../core/entity/link/link-entity.js";
import { ILinksRepository } from "../../../../core/repositories/link/link-repository.js";
import { db } from "../index.js";
import { links } from "../schema.js";

export class DrizzleLinksRepository implements ILinksRepository {
  async findById(id: string): Promise<LinkEntity | null> {
    const [link] = await db.select().from(links).where(eq(links.id, id));

    if (!link) {
      return null;
    }

    return new LinkEntity({
      id: link.id,
      userId: link.userId,
      title: link.title,
      url: link.url,
      icon: link.icon,
      isPublic: link.isPublic,
      order: link.order,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
    });
  }

  async findByUserId(userId: string): Promise<LinkEntity[]> {
    const rows = await db
      .select()
      .from(links)
      .where(eq(links.userId, userId))
      .orderBy(asc(links.order), asc(links.createdAt));

    return rows.map(
      (link) =>
        new LinkEntity({
          id: link.id,
          userId: link.userId,
          title: link.title,
          url: link.url,
          icon: link.icon,
          isPublic: link.isPublic,
          order: link.order,
          createdAt: link.createdAt,
          updatedAt: link.updatedAt,
        }),
    );
  }

  async findPublicByUserId(userId: string): Promise<LinkEntity[]> {
    const rows = await db
      .select()
      .from(links)
      .where(and(eq(links.userId, userId), eq(links.isPublic, true)))
      .orderBy(asc(links.order), asc(links.createdAt));

    return rows.map(
      (link) =>
        new LinkEntity({
          id: link.id,
          userId: link.userId,
          title: link.title,
          url: link.url,
          icon: link.icon,
          isPublic: link.isPublic,
          order: link.order,
          createdAt: link.createdAt,
          updatedAt: link.updatedAt,
        }),
    );
  }

  async findLastOrderByUserId(userId: string): Promise<number | null> {
    const [row] = await db
      .select({ order: links.order })
      .from(links)
      .where(eq(links.userId, userId))
      .orderBy(desc(links.order))
      .limit(1);

    return row?.order ?? null;
  }

  async create(link: LinkEntity): Promise<LinkEntity> {
    const [created] = await db
      .insert(links)
      .values({
        id: link.id,
        userId: link.userId,
        title: link.title,
        url: link.url,
        icon: link.icon,
        isPublic: link.isPublic,
        order: link.order,
        createdAt: link.createdAt,
        updatedAt: link.updatedAt,
      })
      .returning();

    return new LinkEntity({
      id: created.id,
      userId: created.userId,
      title: created.title,
      url: created.url,
      icon: created.icon,
      isPublic: created.isPublic,
      order: created.order,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  }

  async update(link: LinkEntity): Promise<LinkEntity> {
    const [updated] = await db
      .update(links)
      .set({
        title: link.title,
        url: link.url,
        icon: link.icon,
        isPublic: link.isPublic,
        order: link.order,
        updatedAt: link.updatedAt,
      })
      .where(eq(links.id, link.id))
      .returning();

    if (!updated) {
      throw new Error(`Link with id '${link.id}' not found`);
    }

    return new LinkEntity({
      id: updated.id,
      userId: updated.userId,
      title: updated.title,
      url: updated.url,
      icon: updated.icon,
      isPublic: updated.isPublic,
      order: updated.order,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  }

  async delete(id: string): Promise<void> {
    await db.delete(links).where(eq(links.id, id));
  }

  async reorderByIds(userId: string, linkIds: string[]): Promise<void> {
    if (linkIds.length === 0) {
      return;
    }

    const rows = await db
      .select({ id: links.id })
      .from(links)
      .where(and(eq(links.userId, userId), inArray(links.id, linkIds)));

    const foundIds = new Set(rows.map((row) => row.id));

    await Promise.all(
      linkIds
        .filter((linkId) => foundIds.has(linkId))
        .map((linkId, index) =>
          db
            .update(links)
            .set({
              order: index,
              updatedAt: new Date(),
            })
            .where(and(eq(links.userId, userId), eq(links.id, linkId))),
        ),
    );
  }
}
