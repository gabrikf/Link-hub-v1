import { and, asc, eq } from "drizzle-orm";
import type {
  AgentDisclosureLevel,
  DigestCadence,
  GitConnectionKind,
  GitConnectionProvider,
} from "@repo/schemas";
import { GitConnectionEntity } from "../../../../core/entity/git-connection/git-connection-entity.js";
import { IGitConnectionRepository } from "../../../../core/repositories/git-connection/git-connection-repository.js";
import { db } from "../index.js";
import { gitConnections } from "../schema.js";
import { requireReturnedRow } from "../returned-row.js";

type GitConnectionRow = typeof gitConnections.$inferSelect;

function toEntity(row: GitConnectionRow): GitConnectionEntity {
  return new GitConnectionEntity({
    id: row.id,
    userId: row.userId,
    provider: row.provider as GitConnectionProvider,
    kind: row.kind as GitConnectionKind,
    displayName: row.displayName,
    externalAccountId: row.externalAccountId,
    workExperienceId: row.workExperienceId,
    disclosureLevelOverride:
      row.disclosureLevelOverride as AgentDisclosureLevel | null,
    webhookSecret: row.webhookSecret,
    autoPostEnabled: row.autoPostEnabled,
    cadence: row.cadence as DigestCadence,
    includeAgentSummary: row.includeAgentSummary,
    lastDigestAt: row.lastDigestAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleGitConnectionRepository
  implements IGitConnectionRepository
{
  async create(connection: GitConnectionEntity): Promise<GitConnectionEntity> {
    const insertedRows = await db
      .insert(gitConnections)
      .values({
        id: connection.id,
        userId: connection.userId,
        provider: connection.provider,
        kind: connection.kind,
        displayName: connection.displayName,
        externalAccountId: connection.externalAccountId,
        workExperienceId: connection.workExperienceId,
        disclosureLevelOverride: connection.disclosureLevelOverride,
        webhookSecret: connection.webhookSecret,
        autoPostEnabled: connection.autoPostEnabled,
        cadence: connection.cadence,
        includeAgentSummary: connection.includeAgentSummary,
        lastDigestAt: connection.lastDigestAt,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      })
      .returning();

    return toEntity(
      requireReturnedRow(insertedRows, "insert into gitConnections"),
    );
  }

  async findById(id: string): Promise<GitConnectionEntity | null> {
    const [row] = await db
      .select()
      .from(gitConnections)
      .where(eq(gitConnections.id, id));

    return row ? toEntity(row) : null;
  }

  async findByUserId(userId: string): Promise<GitConnectionEntity[]> {
    const rows = await db
      .select()
      .from(gitConnections)
      .where(eq(gitConnections.userId, userId))
      .orderBy(asc(gitConnections.createdAt));

    return rows.map(toEntity);
  }

  async findByExternalAccount(
    provider: GitConnectionProvider,
    externalAccountId: string,
  ): Promise<GitConnectionEntity | null> {
    const [row] = await db
      .select()
      .from(gitConnections)
      .where(
        and(
          eq(gitConnections.provider, provider),
          eq(gitConnections.externalAccountId, externalAccountId),
        ),
      );

    return row ? toEntity(row) : null;
  }

  async listAutoPostEnabled(): Promise<GitConnectionEntity[]> {
    const rows = await db
      .select()
      .from(gitConnections)
      .where(eq(gitConnections.autoPostEnabled, true))
      .orderBy(asc(gitConnections.createdAt));

    return rows.map(toEntity);
  }

  async update(connection: GitConnectionEntity): Promise<GitConnectionEntity> {
    const [updated] = await db
      .update(gitConnections)
      .set({
        kind: connection.kind,
        displayName: connection.displayName,
        externalAccountId: connection.externalAccountId,
        workExperienceId: connection.workExperienceId,
        disclosureLevelOverride: connection.disclosureLevelOverride,
        webhookSecret: connection.webhookSecret,
        autoPostEnabled: connection.autoPostEnabled,
        cadence: connection.cadence,
        includeAgentSummary: connection.includeAgentSummary,
        lastDigestAt: connection.lastDigestAt,
        updatedAt: connection.updatedAt,
      })
      .where(eq(gitConnections.id, connection.id))
      .returning();

    if (!updated) {
      throw new Error(`Git connection with id '${connection.id}' not found`);
    }

    return toEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await db.delete(gitConnections).where(eq(gitConnections.id, id));
  }
}
