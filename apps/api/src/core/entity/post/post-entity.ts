import { BaseEntity, type BaseEntityProps } from "../index.js";

export type PostSource = "manual" | "mcp" | "agent" | "commit";
export type PostStatus = "draft" | "published";

export interface PostEntityProps extends BaseEntityProps {
  userId: string;
  source: PostSource;
  title: string | null;
  body: string;
  coverImageUrl: string | null;
  images: string[] | null;
  tags: string[] | null;
  status: PostStatus;
  externalUrl: string | null;
  metadata: Record<string, unknown> | null;
  /**
   * The role this post came out of, when the author (or the MCP) attributes it
   * to one. `null` means unattributed, so the post falls back to the account
   * disclosure level instead of a per-employer override.
   */
  workExperienceId?: string | null;
  publishedAt: Date | null;
}

export interface CreatePostEntityProps {
  userId: string;
  source?: PostSource;
  title?: string | null;
  body: string;
  coverImageUrl?: string | null;
  images?: string[] | null;
  tags?: string[] | null;
  status?: PostStatus;
  externalUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  workExperienceId?: string | null;
  publishedAt?: Date | null;
}

export interface UpdatePostEntityProps {
  source?: PostSource;
  title?: string | null;
  body?: string;
  coverImageUrl?: string | null;
  images?: string[] | null;
  tags?: string[] | null;
  status?: PostStatus;
  externalUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  workExperienceId?: string | null;
  publishedAt?: Date | null;
}

export class PostEntity extends BaseEntity<PostEntityProps> {
  public userId: string;
  public source: PostSource;
  public title: string | null;
  public body: string;
  public coverImageUrl: string | null;
  public images: string[] | null;
  public tags: string[] | null;
  public status: PostStatus;
  public externalUrl: string | null;
  public metadata: Record<string, unknown> | null;
  public workExperienceId: string | null;
  public publishedAt: Date | null;

  constructor(props: PostEntityProps) {
    super(props);
    this.userId = props.userId;
    this.source = props.source;
    this.title = props.title ?? null;
    this.body = props.body;
    this.coverImageUrl = props.coverImageUrl ?? null;
    this.images = props.images ?? null;
    this.tags = props.tags ?? null;
    this.status = props.status;
    this.externalUrl = props.externalUrl ?? null;
    this.metadata = props.metadata ?? null;
    this.workExperienceId = props.workExperienceId ?? null;
    this.publishedAt = props.publishedAt ?? null;
  }

  updateContent(data: UpdatePostEntityProps) {
    if (typeof data.source !== "undefined") {
      this.source = data.source;
    }
    if (typeof data.title !== "undefined") {
      this.title = data.title ?? null;
    }
    if (typeof data.body !== "undefined") {
      this.body = data.body;
    }
    if (typeof data.coverImageUrl !== "undefined") {
      this.coverImageUrl = data.coverImageUrl ?? null;
    }
    if (typeof data.images !== "undefined") {
      this.images = data.images ?? null;
    }
    if (typeof data.tags !== "undefined") {
      this.tags = data.tags ?? null;
    }
    if (typeof data.status !== "undefined") {
      this.status = data.status;
    }
    if (typeof data.externalUrl !== "undefined") {
      this.externalUrl = data.externalUrl ?? null;
    }
    if (typeof data.metadata !== "undefined") {
      this.metadata = data.metadata ?? null;
    }
    if (typeof data.workExperienceId !== "undefined") {
      this.workExperienceId = data.workExperienceId ?? null;
    }
    if (typeof data.publishedAt !== "undefined") {
      this.publishedAt = data.publishedAt ?? null;
    }
    this.updateTimestamp();
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      source: this.source,
      title: this.title,
      body: this.body,
      coverImageUrl: this.coverImageUrl,
      images: this.images,
      tags: this.tags,
      status: this.status,
      externalUrl: this.externalUrl,
      metadata: this.metadata,
      workExperienceId: this.workExperienceId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      publishedAt: this.publishedAt,
    };
  }
}
