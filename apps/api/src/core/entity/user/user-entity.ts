import {
  DEFAULT_AGENT_DISCLOSURE_LEVEL,
  type AgentDisclosureLevel,
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
  location?: string | null; // Optional; normalized to null in ctor
  persona?: string | null; // Optional; normalized to null in ctor
  /**
   * How much an agent acting for this user may reveal about their employers.
   * Optional here (and normalized in the ctor) so every existing construction
   * site keeps compiling — the account default, not `undefined`, is the truth.
   */
  agentDisclosureLevel?: AgentDisclosureLevel; // Optional; normalized to the default in ctor
  agentBlockedTerms?: string[]; // Optional; normalized to [] in ctor
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
  location?: string | null; // Optional at creation, but will be normalized to null
  persona?: string | null; // Optional at creation, but will be normalized to null
  agentDisclosureLevel?: AgentDisclosureLevel; // Optional at creation; defaults to the strictest level
  agentBlockedTerms?: string[]; // Optional at creation, but will be normalized to []
  googleId?: string | null; // Optional at creation, but will be normalized to null
}

export interface UserEntityPublicDto
  extends Omit<UserEntityProps, "password"> {}

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
  public location: string | null; // Always null, never undefined
  public persona: string | null; // Always null, never undefined
  public agentDisclosureLevel: AgentDisclosureLevel; // Always a level, never undefined
  public agentBlockedTerms: string[]; // Always an array, never undefined
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
    this.location = props.location ?? null;
    this.persona = props.persona ?? null;
    // A user who never opens the settings screen must not leak an employer, so
    // an absent level resolves to the strictest one rather than "unset".
    this.agentDisclosureLevel =
      props.agentDisclosureLevel ?? DEFAULT_AGENT_DISCLOSURE_LEVEL;
    this.agentBlockedTerms = props.agentBlockedTerms ?? [];
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
      location: this.location,
      persona: this.persona,
      googleId: this.googleId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
