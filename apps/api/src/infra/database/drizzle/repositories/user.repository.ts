import { eq, or, sql } from "drizzle-orm";
import type { AgentDisclosureLevel } from "@repo/schemas";
import { UserEntity } from "../../../../core/entity/user/user-entity.js";
import { normalizeEmail } from "../../../../core/entity/user/normalize-email.js";
import { selectMatchingAccount } from "../../../../core/entity/user/select-matching-account.js";
import { IUsersRepository } from "../../../../core/repositories/user/user-repository.js";
import { db } from "../index.js";
import { users } from "../schema.js";

/**
 * The email half of a lookup, matched the way `normalizeEmail` defines it: one
 * mailbox is one account whatever case it was typed in, including for the rows
 * that were already stored with capitals.
 */
function emailMatches(email: string) {
  return sql`lower(${users.email}) = ${normalizeEmail(email)}`;
}

export class DrizzleUserRepository implements IUsersRepository {
  async findByEmailOrLogin(login: string): Promise<UserEntity | null> {
    const matches = await db
      .select()
      .from(users)
      .where(or(...[emailMatches(login), eq(users.login, login)]))
      .orderBy(users.createdAt, users.id);

    const user = selectMatchingAccount(matches, login);

    if (!user) return null;

    // Map database fields (snake_case) to entity fields (camelCase)
    return new UserEntity({
      id: user.id,
      email: user.email,
      login: user.login,
      name: user.name,
      password: user.password,
      description: user.description,
      avatarUrl: user.avatarUrl,
      backgroundImageUrl: user.backgroundImageUrl,
      bannerImageUrl: user.bannerImageUrl,
      themeAccent: user.themeAccent,
      themePreset: user.themePreset,
      openToWork: user.openToWork,
      tabsEnabled: user.tabsEnabled,
      location: user.location,
      persona: user.persona,
      agentDisclosureLevel: user.agentDisclosureLevel as AgentDisclosureLevel,
      agentBlockedTerms: user.agentBlockedTerms,
      googleId: user.googleId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const matches = await db
      .select()
      .from(users)
      .where(emailMatches(email))
      .orderBy(users.createdAt, users.id);

    const user = selectMatchingAccount(matches, email);

    if (!user) return null;

    return new UserEntity({
      id: user.id,
      email: user.email,
      login: user.login,
      name: user.name,
      password: user.password,
      description: user.description,
      avatarUrl: user.avatarUrl,
      backgroundImageUrl: user.backgroundImageUrl,
      bannerImageUrl: user.bannerImageUrl,
      themeAccent: user.themeAccent,
      themePreset: user.themePreset,
      openToWork: user.openToWork,
      tabsEnabled: user.tabsEnabled,
      location: user.location,
      persona: user.persona,
      agentDisclosureLevel: user.agentDisclosureLevel as AgentDisclosureLevel,
      agentBlockedTerms: user.agentBlockedTerms,
      googleId: user.googleId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  async findById(id: string): Promise<UserEntity | null> {
    const [user] = await db.select().from(users).where(eq(users.id, id));

    if (!user) return null;

    return new UserEntity({
      id: user.id,
      email: user.email,
      login: user.login,
      name: user.name,
      password: user.password,
      description: user.description,
      avatarUrl: user.avatarUrl,
      backgroundImageUrl: user.backgroundImageUrl,
      bannerImageUrl: user.bannerImageUrl,
      themeAccent: user.themeAccent,
      themePreset: user.themePreset,
      openToWork: user.openToWork,
      tabsEnabled: user.tabsEnabled,
      location: user.location,
      persona: user.persona,
      agentDisclosureLevel: user.agentDisclosureLevel as AgentDisclosureLevel,
      agentBlockedTerms: user.agentBlockedTerms,
      googleId: user.googleId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  async findByLogin(login: string): Promise<UserEntity | null> {
    const [user] = await db.select().from(users).where(eq(users.login, login));

    if (!user) return null;

    return new UserEntity({
      id: user.id,
      email: user.email,
      login: user.login,
      name: user.name,
      password: user.password,
      description: user.description,
      avatarUrl: user.avatarUrl,
      backgroundImageUrl: user.backgroundImageUrl,
      bannerImageUrl: user.bannerImageUrl,
      themeAccent: user.themeAccent,
      themePreset: user.themePreset,
      openToWork: user.openToWork,
      tabsEnabled: user.tabsEnabled,
      location: user.location,
      persona: user.persona,
      agentDisclosureLevel: user.agentDisclosureLevel as AgentDisclosureLevel,
      agentBlockedTerms: user.agentBlockedTerms,
      googleId: user.googleId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  async findByGoogleId(googleId: string): Promise<UserEntity | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.googleId, googleId));

    if (!user) return null;

    return new UserEntity({
      id: user.id,
      email: user.email,
      login: user.login,
      name: user.name,
      password: user.password,
      description: user.description,
      avatarUrl: user.avatarUrl,
      backgroundImageUrl: user.backgroundImageUrl,
      bannerImageUrl: user.bannerImageUrl,
      themeAccent: user.themeAccent,
      themePreset: user.themePreset,
      openToWork: user.openToWork,
      tabsEnabled: user.tabsEnabled,
      location: user.location,
      persona: user.persona,
      agentDisclosureLevel: user.agentDisclosureLevel as AgentDisclosureLevel,
      agentBlockedTerms: user.agentBlockedTerms,
      googleId: user.googleId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  async update(user: UserEntity): Promise<UserEntity> {
    const [updatedUser] = await db
      .update(users)
      .set({
        email: user.email,
        login: user.login,
        name: user.name,
        description: user.description,
        avatarUrl: user.avatarUrl,
        backgroundImageUrl: user.backgroundImageUrl,
        bannerImageUrl: user.bannerImageUrl,
        themeAccent: user.themeAccent,
        themePreset: user.themePreset,
        openToWork: user.openToWork,
        tabsEnabled: user.tabsEnabled,
        location: user.location,
        persona: user.persona,
        agentDisclosureLevel: user.agentDisclosureLevel,
        agentBlockedTerms: user.agentBlockedTerms,
        password: user.password,
        googleId: user.googleId,
        updatedAt: user.updatedAt,
      })
      .where(eq(users.id, user.id))
      .returning();

    if (!updatedUser) {
      throw new Error(`User with id '${user.id}' not found`);
    }

    return new UserEntity({
      id: updatedUser.id,
      email: updatedUser.email,
      login: updatedUser.login,
      name: updatedUser.name,
      password: updatedUser.password,
      description: updatedUser.description,
      avatarUrl: updatedUser.avatarUrl,
      backgroundImageUrl: updatedUser.backgroundImageUrl,
      bannerImageUrl: updatedUser.bannerImageUrl,
      themeAccent: updatedUser.themeAccent,
      themePreset: updatedUser.themePreset,
      openToWork: updatedUser.openToWork,
      tabsEnabled: updatedUser.tabsEnabled,
      location: updatedUser.location,
      persona: updatedUser.persona,
      agentDisclosureLevel:
        updatedUser.agentDisclosureLevel as AgentDisclosureLevel,
      agentBlockedTerms: updatedUser.agentBlockedTerms,
      googleId: updatedUser.googleId,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    });
  }

  async create(user: UserEntity): Promise<UserEntity> {
    // Map entity fields (camelCase) to database fields (snake_case)
    const [createdUser] = await db
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        login: user.login,
        name: user.name,
        password: user.password,
        description: user.description,
        avatarUrl: user.avatarUrl,
        backgroundImageUrl: user.backgroundImageUrl,
        tabsEnabled: user.tabsEnabled,
        persona: user.persona,
        googleId: user.googleId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .returning();

    // Map database fields back to entity fields
    return new UserEntity({
      id: createdUser.id,
      email: createdUser.email,
      login: createdUser.login,
      name: createdUser.name,
      password: createdUser.password,
      description: createdUser.description,
      avatarUrl: createdUser.avatarUrl,
      backgroundImageUrl: createdUser.backgroundImageUrl,
      bannerImageUrl: createdUser.bannerImageUrl,
      themeAccent: createdUser.themeAccent,
      themePreset: createdUser.themePreset,
      openToWork: createdUser.openToWork,
      tabsEnabled: createdUser.tabsEnabled,
      location: createdUser.location,
      persona: createdUser.persona,
      agentDisclosureLevel:
        createdUser.agentDisclosureLevel as AgentDisclosureLevel,
      agentBlockedTerms: createdUser.agentBlockedTerms,
      googleId: createdUser.googleId,
      createdAt: createdUser.createdAt,
      updatedAt: createdUser.updatedAt,
    });
  }
}
