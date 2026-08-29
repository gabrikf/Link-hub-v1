import {
  DEFAULT_AGENT_DISCLOSURE_LEVEL,
  type AgentDisclosureLevel,
  type ProfileViewport,
} from "@repo/schemas";
import { BaseEntity, BaseEntityProps } from "../index.js";

export interface UserEntityProps extends BaseEntityProps {
  email: string;
  login: string;
  name: string;
  password: string;
  description: string | null; // Explicit null, not optional
  avatarUrl: string | null; // Explicit null, not optional
  backgroundImageUrl?: string | null; // Optional; normalized to null in ctor
  bannerImageUrl?: string | null; // Optional; normalized to null in ctor
  themeAccent?: string | null; // Optional; normalized to null in ctor
  themePreset?: string | null; // Optional; normalized to null in ctor
  openToWork?: boolean; // Optional; normalized to false in ctor
  /**
   * Public "simple mode" switch, one per viewport: false means that viewport
   * renders no tab strip. Two fields rather than one because tabs themselves
   * are per-viewport, and a single flag made switching one viewport silently
   * switch the other.
   *
   * Optional here and normalized to TRUE in the ctor — the opposite of the
   * usual `?? false`, because every account that predates the columns had tabs
   * and must keep them.
   */
  tabsEnabledPc?: boolean; // Optional; normalized to true in ctor
  tabsEnabledMobile?: boolean; // Optional; normalized to true in ctor
  location?: string | null; // Optional; normalized to null in ctor
  persona?: string | null; // Optional; normalized to null in ctor
  /**
   * How much an agent acting for this user may reveal about their employers.
   * Optional here (and normalized in the ctor) so every existing construction
   * site keeps compiling — the account default, not `undefined`, is the truth.
   */
  agentDisclosureLevel?: AgentDisclosureLevel; // Optional; normalized to the default in ctor
  agentBlockedTerms?: string[]; // Optional; normalized to [] in ctor
  /**
   * When this address was proved, or null while it is still unproved.
   *
   * A nullable TIMESTAMP rather than a boolean because "when" is the question
   * support actually asks, and because it makes the backfill honest: every row
   * that existed before verification shipped is stamped with the migration's
   * `now()` rather than pretending it was verified at signup.
   *
   * Optional here and normalized to null in the ctor, so the ~30 existing
   * construction sites keep compiling. Read it through `isEmailVerified()`,
   * never directly — that method also honours the OAuth rule below.
   */
  emailVerifiedAt?: Date | null; // Optional; normalized to null in ctor
  googleId: string | null; // Explicit null, not optional
}

export interface CreateUserEntityProps {
  email: string;
  login: string;
  name: string;
  password: string;
  description?: string | null; // Optional at creation, but will be normalized to null
  avatarUrl?: string | null; // Optional at creation, but will be normalized to null
  backgroundImageUrl?: string | null; // Optional at creation, but will be normalized to null
  bannerImageUrl?: string | null; // Optional at creation, but will be normalized to null
  themeAccent?: string | null; // Optional at creation, but will be normalized to null
  themePreset?: string | null; // Optional at creation, but will be normalized to null
  openToWork?: boolean; // Optional at creation, but will be normalized to false
  tabsEnabledPc?: boolean; // Optional at creation, but will be normalized to true
  tabsEnabledMobile?: boolean; // Optional at creation, but will be normalized to true
  location?: string | null; // Optional at creation, but will be normalized to null
  persona?: string | null; // Optional at creation, but will be normalized to null
  agentDisclosureLevel?: AgentDisclosureLevel; // Optional at creation; defaults to the strictest level
  agentBlockedTerms?: string[]; // Optional at creation, but will be normalized to []
  emailVerifiedAt?: Date | null; // Optional at creation, but will be normalized to null
  googleId?: string | null; // Optional at creation, but will be normalized to null
}

/**
 * `emailVerifiedAt` is swapped for the boolean the API publishes. Clients get
 * "is it verified", not the timestamp — see `userResponseSchema`.
 */
export interface UserEntityPublicDto
  extends Omit<UserEntityProps, "password" | "emailVerifiedAt"> {
  emailVerified: boolean;
}

export class UserEntity extends BaseEntity<UserEntityProps> {
  public email: string;
  public login: string;
  public name: string;
  public password: string;
  public description: string | null; // Always null, never undefined
  public avatarUrl: string | null; // Always null, never undefined
  public backgroundImageUrl: string | null; // Always null, never undefined
  public bannerImageUrl: string | null; // Always null, never undefined
  public themeAccent: string | null; // Always null, never undefined
  public themePreset: string | null; // Always null, never undefined
  public openToWork: boolean; // Always boolean, never undefined
  public tabsEnabledPc: boolean; // Always boolean, never undefined
  public tabsEnabledMobile: boolean; // Always boolean, never undefined
  public location: string | null; // Always null, never undefined
  public persona: string | null; // Always null, never undefined
  public agentDisclosureLevel: AgentDisclosureLevel; // Always a level, never undefined
  public agentBlockedTerms: string[]; // Always an array, never undefined
  public emailVerifiedAt: Date | null; // Always null, never undefined
  public googleId: string | null; // Always null, never undefined

  constructor(props: UserEntityProps) {
    super(props);
    this.email = props.email;
    this.login = props.login;
    this.name = props.name;
    this.password = props.password;
    // Normalize undefined to null for database consistency
    this.description = props.description ?? null;
    this.avatarUrl = props.avatarUrl ?? null;
    this.backgroundImageUrl = props.backgroundImageUrl ?? null;
    this.bannerImageUrl = props.bannerImageUrl ?? null;
    this.themeAccent = props.themeAccent ?? null;
    this.themePreset = props.themePreset ?? null;
    this.openToWork = props.openToWork ?? false;
    // Defaults to true, not false: an absent value means "this account was made
    // before the columns existed", and those profiles had a tab strip.
    this.tabsEnabledPc = props.tabsEnabledPc ?? true;
    this.tabsEnabledMobile = props.tabsEnabledMobile ?? true;
    this.location = props.location ?? null;
    this.persona = props.persona ?? null;
    // A user who never opens the settings screen must not leak an employer, so
    // an absent level resolves to the strictest one rather than "unset".
    this.agentDisclosureLevel =
      props.agentDisclosureLevel ?? DEFAULT_AGENT_DISCLOSURE_LEVEL;
    this.agentBlockedTerms = props.agentBlockedTerms ?? [];
    this.emailVerifiedAt = props.emailVerifiedAt ?? null;
    this.googleId = props.googleId ?? null;
  }

  /**
   * Only the human owner may change this — an agent widening its own disclosure
   * would defeat the point — so there is no PAT-reachable path to this method.
   */
  updateAgentPolicy(policy: {
    disclosureLevel?: AgentDisclosureLevel;
    blockedTerms?: string[];
  }) {
    if (policy.disclosureLevel !== undefined) {
      this.agentDisclosureLevel = policy.disclosureLevel;
    }
    if (policy.blockedTerms !== undefined) {
      this.agentBlockedTerms = policy.blockedTerms;
    }
    this.updateTimestamp();
  }

  updateAvatarUrl(avatarUrl: string | null) {
    this.avatarUrl = avatarUrl;
    this.updateTimestamp();
  }

  updateBackgroundImageUrl(backgroundImageUrl: string | null) {
    this.backgroundImageUrl = backgroundImageUrl;
    this.updateTimestamp();
  }

  updateBannerImageUrl(bannerImageUrl: string | null) {
    this.bannerImageUrl = bannerImageUrl;
    this.updateTimestamp();
  }

  updateThemeAccent(themeAccent: string | null) {
    this.themeAccent = themeAccent;
    this.updateTimestamp();
  }

  updateThemePreset(themePreset: string | null) {
    this.themePreset = themePreset;
    this.updateTimestamp();
  }

  updateOpenToWork(openToWork: boolean) {
    this.openToWork = openToWork;
    this.updateTimestamp();
  }

  /** This viewport's tab-strip switch. The read-side pair of `updateTabsEnabled`. */
  tabsEnabledFor(viewport: ProfileViewport): boolean {
    return viewport === "pc" ? this.tabsEnabledPc : this.tabsEnabledMobile;
  }

  /**
   * Flips the tab strip on the public profile for ONE viewport. It only changes
   * what is RENDERED: tabs and their block assignments are untouched, so
   * turning this off and back on restores the exact layout the user had.
   *
   * The other viewport is deliberately left alone — that coupling was the bug.
   */
  updateTabsEnabled(viewport: ProfileViewport, tabsEnabled: boolean) {
    if (viewport === "pc") {
      this.tabsEnabledPc = tabsEnabled;
    } else {
      this.tabsEnabledMobile = tabsEnabled;
    }
    this.updateTimestamp();
  }

  updateLocation(location: string | null) {
    this.location = location;
    this.updateTimestamp();
  }

  updatePersona(persona: string | null) {
    this.persona = persona;
    this.updateTimestamp();
  }

  updateDescription(description: string | null) {
    this.description = description;
    this.updateTimestamp();
  }

  /**
   * Whether this account may sign in with a password.
   *
   * `googleId` counts on its own: Google already proved control of the mailbox,
   * so an account linked to it can never be locked out by a verification flag
   * that predates the link. The caller checks for a row in `oauth_accounts`
   * separately — that covers LinkedIn, which has no column here.
   */
  isEmailVerified(): boolean {
    return this.emailVerifiedAt !== null || this.googleId !== null;
  }

  /**
   * Idempotent on purpose: an OAuth sign-in calls this on every login, and
   * re-stamping the date each time would turn "when was this proved" into
   * "when did they last sign in".
   */
  markEmailVerified(verifiedAt: Date = new Date()) {
    if (this.emailVerifiedAt !== null) {
      return;
    }
    this.emailVerifiedAt = verifiedAt;
    this.updateTimestamp();
  }

  /**
   * Replace the stored password hash. Takes a HASH, never a plaintext — the
   * caller owns the hashing so this entity never needs to know about argon2.
   */
  updatePassword(passwordHash: string) {
    this.password = passwordHash;
    this.updateTimestamp();
  }

  updateGoogleId(googleId: string | null) {
    this.googleId = googleId;
    this.updateTimestamp();
  }

  toPublic(): UserEntityPublicDto {
    return {
      id: this.id,
      email: this.email,
      login: this.login,
      name: this.name,
      description: this.description,
      avatarUrl: this.avatarUrl,
      backgroundImageUrl: this.backgroundImageUrl,
      bannerImageUrl: this.bannerImageUrl,
      themeAccent: this.themeAccent,
      themePreset: this.themePreset,
      openToWork: this.openToWork,
      tabsEnabledPc: this.tabsEnabledPc,
      tabsEnabledMobile: this.tabsEnabledMobile,
      location: this.location,
      persona: this.persona,
      googleId: this.googleId,
      emailVerified: this.isEmailVerified(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
