import { eq, or, sql } from "drizzle-orm";
import type { AgentDisclosureLevel } from "@repo/schemas";
import { UserEntity } from "../../../../core/entity/user/user-entity.js";
import { normalizeEmail } from "../../../../core/entity/user/normalize-email.js";
import { selectMatchingAccount } from "../../../../core/entity/user/select-matching-account.js";
import { IUsersRepository } from "../../../../core/repositories/user/user-repository.js";
import { db } from "../index.js";
import { users } from "../schema.js";
import { requireReturnedRow } from "../returned-row.js";

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
      appearance: user.profileAppearance,
      openToWork: user.openToWork,
      tabsEnabledPc: user.tabsEnabledPc,
      tabsEnabledMobile: user.tabsEnabledMobile,
      location: user.location,
      persona: user.persona,
      personaOther: user.personaOther,
      agentDisclosureLevel: user.agentDisclosureLevel as AgentDisclosureLevel,
      agentBlockedTerms: user.agentBlockedTerms,
      emailVerifiedAt: user.emailVerifiedAt,
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
      appearance: user.profileAppearance,
      openToWork: user.openToWork,
      tabsEnabledPc: user.tabsEnabledPc,
      tabsEnabledMobile: user.tabsEnabledMobile,
      location: user.location,
      persona: user.persona,
      personaOther: user.personaOther,
      agentDisclosureLevel: user.agentDisclosureLevel as AgentDisclosureLevel,
      agentBlockedTerms: user.agentBlockedTerms,
      emailVerifiedAt: user.emailVerifiedAt,
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
      appearance: user.profileAppearance,
      openToWork: user.openToWork,
      tabsEnabledPc: user.tabsEnabledPc,
      tabsEnabledMobile: user.tabsEnabledMobile,
      location: user.location,
      persona: user.persona,
      personaOther: user.personaOther,
      agentDisclosureLevel: user.agentDisclosureLevel as AgentDisclosureLevel,
      agentBlockedTerms: user.agentBlockedTerms,
      emailVerifiedAt: user.emailVerifiedAt,
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
      appearance: user.profileAppearance,
      openToWork: user.openToWork,
      tabsEnabledPc: user.tabsEnabledPc,
      tabsEnabledMobile: user.tabsEnabledMobile,
      location: user.location,
      persona: user.persona,
      personaOther: user.personaOther,
      agentDisclosureLevel: user.agentDisclosureLevel as AgentDisclosureLevel,
      agentBlockedTerms: user.agentBlockedTerms,
      emailVerifiedAt: user.emailVerifiedAt,
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
      appearance: user.profileAppearance,
      openToWork: user.openToWork,
      tabsEnabledPc: user.tabsEnabledPc,
      tabsEnabledMobile: user.tabsEnabledMobile,
      location: user.location,
      persona: user.persona,
      personaOther: user.personaOther,
      agentDisclosureLevel: user.agentDisclosureLevel as AgentDisclosureLevel,
      agentBlockedTerms: user.agentBlockedTerms,
      emailVerifiedAt: user.emailVerifiedAt,
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
        profileAppearance: user.appearance,
        openToWork: user.openToWork,
        tabsEnabledPc: user.tabsEnabledPc,
        tabsEnabledMobile: user.tabsEnabledMobile,
        location: user.location,
        persona: user.persona,
        personaOther: user.personaOther,
        agentDisclosureLevel: user.agentDisclosureLevel,
        agentBlockedTerms: user.agentBlockedTerms,
        password: user.password,
        emailVerifiedAt: user.emailVerifiedAt,
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
      appearance: updatedUser.profileAppearance,
      openToWork: updatedUser.openToWork,
      tabsEnabledPc: updatedUser.tabsEnabledPc,
      tabsEnabledMobile: updatedUser.tabsEnabledMobile,
      location: updatedUser.location,
      persona: updatedUser.persona,
      personaOther: updatedUser.personaOther,
      agentDisclosureLevel:
        updatedUser.agentDisclosureLevel as AgentDisclosureLevel,
      agentBlockedTerms: updatedUser.agentBlockedTerms,
      emailVerifiedAt: updatedUser.emailVerifiedAt,
      googleId: updatedUser.googleId,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    });
  }

  async create(user: UserEntity): Promise<UserEntity> {
    // Map entity fields (camelCase) to database fields (snake_case)
    const insertedRows = await db
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
        /**
         * Written explicitly, from the entity.
         *
         * The column carries a default, but a column default is only reached by
         * an insert that OMITS the column — and an omission is invisible, so it
         * silently disagreed with `UserEntity.openToWork` for the lifetime of
         * the returned object. Sending the entity's value makes the entity the
         * single source of truth for a new account's discoverability, and makes
         * "a new signup is findable" hold on its own rather than depending on a
         * migration having been applied.
         */
        openToWork: user.openToWork,
        tabsEnabledPc: user.tabsEnabledPc,
        tabsEnabledMobile: user.tabsEnabledMobile,
        persona: user.persona,
        personaOther: user.personaOther,
        emailVerifiedAt: user.emailVerifiedAt,
        googleId: user.googleId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .returning();

    const createdUser = requireReturnedRow(insertedRows, "insert into users");

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
      appearance: createdUser.profileAppearance,
      openToWork: createdUser.openToWork,
      tabsEnabledPc: createdUser.tabsEnabledPc,
      tabsEnabledMobile: createdUser.tabsEnabledMobile,
      location: createdUser.location,
      persona: createdUser.persona,
      personaOther: createdUser.personaOther,
      agentDisclosureLevel:
        createdUser.agentDisclosureLevel as AgentDisclosureLevel,
      agentBlockedTerms: createdUser.agentBlockedTerms,
      emailVerifiedAt: createdUser.emailVerifiedAt,
      googleId: createdUser.googleId,
      createdAt: createdUser.createdAt,
      updatedAt: createdUser.updatedAt,
    });
  }
}
