import {
  DEFAULT_AGENT_DISCLOSURE_LEVEL,
  DEFAULT_TABS_ENABLED,
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
  /**
   * Whether recruiters may find this candidate. See the ctor for why an absent
   * value resolves to TRUE.
   */
  openToWork?: boolean; // Optional; normalized to true in ctor
  /**
   * Public "simple mode" switch, one per viewport: false means that viewport
   * renders no tab strip. Two fields rather than one because tabs themselves
   * are per-viewport, and a single flag made switching one viewport silently
   * switch the other.
   *
   * Optional here and normalized to {@link DEFAULT_TABS_ENABLED} in the ctor.
   */
  tabsEnabledPc?: boolean; // Optional; normalized to DEFAULT_TABS_ENABLED in ctor
  tabsEnabledMobile?: boolean; // Optional; normalized to DEFAULT_TABS_ENABLED in ctor
  location?: string | null; // Optional; normalized to null in ctor
  persona?: string | null; // Optional; normalized to null in ctor
  /**
   * The user's own words for their role. Only meaningful while `persona` is
   * `"other"` — every other persona has a translated label of its own, so a
   * label left over from a previous "other" would render instead of it. The
   * invariant is enforced in one place, `UpdateProfileUseCase`, which clears
   * this whenever persona leaves "other".
   */
  personaOther?: string | null; // Optional; normalized to null in ctor
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
  openToWork?: boolean; // Optional at creation, but will be normalized to true
  tabsEnabledPc?: boolean; // Optional at creation, but will be normalized to DEFAULT_TABS_ENABLED
  tabsEnabledMobile?: boolean; // Optional at creation, but will be normalized to DEFAULT_TABS_ENABLED
  location?: string | null; // Optional at creation, but will be normalized to null
  persona?: string | null; // Optional at creation, but will be normalized to null
  personaOther?: string | null; // Optional at creation, but will be normalized to null
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
  public personaOther: string | null; // Always null, never undefined
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
    /**
     * Defaults to TRUE, not false.
     *
     * `/resumes/search` gates every result on `users.open_to_work` — it is the
     * authorization boundary for candidate discovery. While this normalised to
     * `false`, a developer who signed up and built a complete resume was
     * invisible to every recruiter search until they happened to find the
     * "Open to work" toggle, and the failure was silent: the API answered 200
     * with an empty `candidates` array, indistinguishable from "no matches".
     *
     * So a NEW account is discoverable by default and opts out deliberately.
     * Existing rows are NOT affected: every repository maps `open_to_work` from
     * the database explicitly, so an account that turned the switch off keeps
     * it off — this branch is only reached when nobody stated a value at all.
     */
    this.openToWork = props.openToWork ?? true;
    // A NEW account starts minimal — photo, name and links only — so an absent
    // flag resolves to `DEFAULT_TABS_ENABLED` (false). This does NOT reach
    // existing accounts: `tabs_enabled_pc` / `tabs_enabled_mobile` are NOT NULL
    // and every repository read passes the stored column straight through, so
    // the value is never absent for a row that already exists. The only callers
    // that omit it are the ones minting a brand-new user.
    this.tabsEnabledPc = props.tabsEnabledPc ?? DEFAULT_TABS_ENABLED;
    this.tabsEnabledMobile = props.tabsEnabledMobile ?? DEFAULT_TABS_ENABLED;
    this.location = props.location ?? null;
    this.persona = props.persona ?? null;
    this.personaOther = props.personaOther ?? null;
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

  /**
   * The user's own words for their role. Only meaningful while `persona` is
   * `"other"` — every other persona has a translated label of its own, so a
   * label left over from a previous "other" would render instead of it. The
   * invariant is enforced in one place, `UpdateProfileUseCase`, which clears
   * this whenever persona leaves "other".
   */
  updatePersonaOther(personaOther: string | null) {
    this.personaOther = personaOther;
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
      personaOther: this.personaOther,
      googleId: this.googleId,
      emailVerified: this.isEmailVerified(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
