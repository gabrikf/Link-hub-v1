import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  integer,
} from "drizzle-orm/pg-core";

const vector = customType<{ data: number[]; config: { dimensions: number } }>({
  dataType(config) {
    const dimensions = config?.dimensions ?? 1536;
    return `vector(${dimensions})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown) {
    if (typeof value !== "string" || value.length < 2) {
      return [];
    }

    return value
      .slice(1, -1)
      .split(",")
      .filter((item) => item.length > 0)
      .map((item) => Number(item));
  },
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  login: text("login").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  backgroundImageUrl: text("background_image_url"),
  bannerImageUrl: text("banner_image_url"),
  themeAccent: text("theme_accent"),
  themePreset: text("theme_preset"),
  openToWork: boolean("open_to_work").notNull().default(false),
  /*
   * "Simple mode" switch for the public profile: false renders no tab strip,
   * only the first tab's blocks plus pinned ones.
   *
   * TWO columns, one per viewport, because `profile_tabs.viewport` already
   * makes tabs per-viewport and the real use case is asymmetric: tabs on a wide
   * desktop layout, one scrolling list on a phone. A single flag could not
   * express that, and flipping it in one viewport silently flipped the other.
   *
   * These live on `users` ON PURPOSE, unlike `user_preferences` below: the
   * public renderer cannot decide whether to draw the tab strip without them,
   * so they travel in the public payload (inside `layout.pc` / `layout.mobile`)
   * rather than staying private. Both default to true so every account that
   * existed before these columns keeps exactly the behaviour it had.
   */
  tabsEnabledPc: boolean("tabs_enabled_pc").notNull().default(true),
  tabsEnabledMobile: boolean("tabs_enabled_mobile").notNull().default(true),
  location: text("location"),
  persona: text("persona"),
  // How much an agent acting for this user may reveal about their work history.
  // See `agentDisclosureLevelSchema` in @repo/schemas. Defaults to the most
  // restrictive level so an untouched account never leaks an employer's name.
  agentDisclosureLevel: text("agent_disclosure_level")
    .notNull()
    .default("summary"),
  // string[] — terms the agent must never emit, whatever the disclosure level.
  agentBlockedTerms: jsonb("agent_blocked_terms")
    .$type<string[]>()
    .notNull()
    .default([]),
  password: text("password").notNull(),
  /*
   * When this address was proved, or NULL while it is still unproved.
   *
   * NOT derivable from `password`: that column is notNull and an OAuth signup
   * gets a random hash nobody knows, so "has a password" is true for every row
   * and says nothing about how the account was created. The OAuth signal is the
   * absence of a `google_id` and of any `oauth_accounts` row.
   *
   * Nullable with no default, and migration 0022 backfills every pre-existing
   * row to now(): a default of NULL alone would have locked ~301 seeded
   * accounts and every real dev account out of password login on deploy.
   */
  emailVerifiedAt: timestamp("email_verified_at"),
  googleId: text("google_id").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

/**
 * One row per verification link ever emailed.
 *
 * Only the sha256 of the token is stored (`token_hash`), so this table is worth
 * nothing to whoever reads it — the raw value lives in the user's inbox and
 * nowhere else. Rows are single-use: `consumed_at` is stamped on the token that
 * was spent AND on every other outstanding token for that user, so the older
 * links sitting in the same inbox stop working the moment one succeeds.
 */
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    // Both non-lookup reads are per user: the resend cooldown wants the newest
    // row for one user, and a successful verify invalidates that user's others.
    index("email_verification_tokens_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

/**
 * One row per password-reset link ever emailed.
 *
 * A SEPARATE table from `email_verification_tokens` rather than a `purpose`
 * column on it: the two have different lifetimes (20 minutes vs 24 hours) and
 * very different blast radii — a leaked reset token IS the account — so keeping
 * them apart means no query can ever accidentally accept one where the other
 * was meant.
 *
 * Same rules otherwise: only the sha256 is stored, and `consumed_at` is stamped
 * both when a link is issued (invalidating older ones) and when one is spent.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("password_reset_tokens_user_id_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    unique("oauth_accounts_provider_provider_account_id_unique").on(
      table.provider,
      table.providerAccountId,
    ),
    unique("oauth_accounts_user_id_provider_unique").on(
      table.userId,
      table.provider,
    ),
  ],
);

export const links = pgTable(
  "links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    icon: text("icon"),
    isPublic: boolean("is_public").notNull().default(true),
    order: integer("order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    // `links` had no index on user_id at all — every public profile view was a
    // seq scan of the whole table. Covers the two shapes the repository asks
    // for: the public-profile read (`findPublicByUserId`, the hot path, served
    // entirely by the partial index in its own sort order) and the owner's list
    // and last-order lookups, which use the leading user_id column.
    index("links_user_id_order_idx").on(
      table.userId,
      table.order,
      table.createdAt,
    ),
    index("links_public_user_id_order_idx")
      .on(table.userId, table.order, table.createdAt)
      .where(sql`${table.isPublic}`),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    coverImageUrl: text("cover_image_url"),
    images: jsonb("images"),
    tags: jsonb("tags"),
    status: text("status").notNull().default("published"),
    externalUrl: text("external_url"),
    metadata: jsonb("metadata"),
    // The role this post came out of, when the author (or the MCP) attributes
    // it to one. Drives per-employer disclosure: a post tied to a role inherits
    // that role's redaction level. `set null` because losing the role must not
    // delete the post — it only makes the post unattributed.
    workExperienceId: uuid("work_experience_id").references(
      () => workExperiences.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
    publishedAt: timestamp("published_at"),
  },
  (table) => [
    index("posts_user_id_idx").on(table.userId),
    // Recruiter search pulls the 6 most recent published posts per candidate,
    // for 50 candidates, in one correlated subquery. Without an index carrying
    // the sort key the LIMIT cannot push down: Postgres reads every published
    // post the user has and detoasts each `body` for `left(body, 400)` before
    // discarding all but six. Indexing the exact COALESCE expression the query
    // sorts on lets it stop after six rows.
    index("posts_user_published_sort_idx")
      .on(
        table.userId,
        sql`(COALESCE(${table.publishedAt}, ${table.createdAt})) DESC`,
      )
      .where(sql`${table.status} = 'published'`),
    index("posts_work_experience_id_idx").on(table.workExperienceId),
    // `tags` is jsonb, so a btree index can only answer whole-document
    // equality. GIN with the default jsonb_ops is what makes containment
    // (`tags @> '["typescript"]'`) an index scan instead of a seq scan over
    // every post.
    index("posts_tags_gin_idx").using("gin", table.tags),
  ],
);

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(),
    scopes: jsonb("scopes").notNull(),
    expiresAt: timestamp("expires_at"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [index("api_tokens_user_id_idx").on(table.userId)],
);

export const profileTabs = pgTable(
  "profile_tabs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Tabs are fully PER-VIEWPORT: a tab row belongs to exactly one viewport and
    // has no counterpart in the other. Creating/renaming/reordering/deleting a
    // tab in the mobile editor leaves the pc layout untouched, and vice versa —
    // which is what the editor promises ("Design independent layouts").
    viewport: text("viewport").notNull(),
    title: text("title").notNull(),
    order: integer("order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("profile_tabs_user_id_viewport_idx").on(table.userId, table.viewport),
  ],
);

export const profileBlocks = pgTable(
  "profile_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Shared logical identity that links the pc-row and mobile-row of the SAME
    // logical block. Kind/config/visibility mirror across viewports by groupId
    // so content is authored once. Everything else is PER-VIEWPORT: gridX/Y/W/H,
    // and — since tabs no longer correspond one-to-one across viewports —
    // `tabId` and `pinnedAllTabs` too. A block can sit in "Projects" on pc and
    // in the default tab on mobile.
    groupId: uuid("group_id").notNull(),
    viewport: text("viewport").notNull(),
    // Cascade is a backstop only: `DeleteTabUseCase` re-homes a deleted tab's
    // blocks onto the viewport's first remaining tab BEFORE dropping the tab
    // row, so no block is ever deleted by a tab deletion. Were the cascade to
    // fire (raw SQL, user deletion), it would only ever touch rows of the same
    // viewport as the tab — the other viewport's rows are unreachable from here.
    tabId: uuid("tab_id").references(() => profileTabs.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    gridX: integer("grid_x").notNull().default(0),
    gridY: integer("grid_y").notNull().default(0),
    gridW: integer("grid_w").notNull().default(1),
    gridH: integer("grid_h").notNull().default(1),
    isVisible: boolean("is_visible").notNull().default(true),
    pinnedAllTabs: boolean("pinned_all_tabs").notNull().default(false),
    config: jsonb("config"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("profile_blocks_user_id_viewport_idx").on(
      table.userId,
      table.viewport,
    ),
    index("profile_blocks_group_id_idx").on(table.groupId),
  ],
);

export const workExperiences = pgTable(
  "work_experiences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    companyName: text("company_name").notNull(),
    employmentType: text("employment_type"),
    workModel: text("work_model"),
    locationCity: text("location_city"),
    locationState: text("location_state"),
    locationCountry: text("location_country"),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    isCurrent: boolean("is_current").notNull().default(false),
    description: text("description"),
    mainStack: text("main_stack").array().notNull().default([]),
    // Per-employer override of `users.agent_disclosure_level`. NULL means the
    // role inherits the account default — the common case, and why this can't
    // be NOT NULL with a default.
    disclosureLevel: text("disclosure_level"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [index("work_experiences_user_id_idx").on(table.userId)],
);

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    headlineTitle: text("headline_title"),
    summary: text("summary"),
    totalYearsExperience: integer("total_years_experience"),
    location: text("location"),
    seniorityLevel: text("seniority_level"),
    workModel: text("work_model"),
    contractType: text("contract_type"),
    salaryExpectationMin: integer("salary_expectation_min"),
    salaryExpectationMax: integer("salary_expectation_max"),
    spokenLanguages: text("spoken_languages").array().notNull().default([]),
    noticePeriod: text("notice_period"),
    openToRelocation: boolean("open_to_relocation").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [unique("resumes_user_id_unique").on(table.userId)],
);

export const skillsCatalog = pgTable(
  "skills_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    unique("skills_catalog_name_unique").on(table.name),
    unique("skills_catalog_normalized_name_unique").on(table.normalizedName),
  ],
);

export const titlesCatalog = pgTable(
  "titles_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    unique("titles_catalog_name_unique").on(table.name),
    unique("titles_catalog_normalized_name_unique").on(table.normalizedName),
  ],
);

export const resumeSkills = pgTable(
  "resume_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resumeId: uuid("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skillsCatalog.id, { onDelete: "cascade" }),
    yearsExperience: integer("years_experience"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    unique("resume_skills_resume_id_skill_id_unique").on(
      table.resumeId,
      table.skillId,
    ),
  ],
);

export const resumeTitles = pgTable(
  "resume_titles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resumeId: uuid("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    titleId: uuid("title_id")
      .notNull()
      .references(() => titlesCatalog.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    unique("resume_titles_resume_id_title_id_unique").on(
      table.resumeId,
      table.titleId,
    ),
  ],
);

// The blended, all-sources vector: one row per resume, still what the plain
// (unscoped) recruiter search matches against. Per-source vectors live in
// `resume_section_embeddings` below.
export const resumeEmbeddings = pgTable(
  "resume_embeddings",
  {
    resumeId: uuid("resume_id")
      .primaryKey()
      .references(() => resumes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    contentHash: text("content_hash"),
    embeddingModel: text("embedding_model").notNull(),
    embeddingVersion: integer("embedding_version").notNull().default(1),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // HAZARD: this index was created by hand in 0006_resume_embeddings.sql and
    // was invisible to Drizzle, so every `drizzle-kit generate` was one snapshot
    // away from proposing a DROP for it. Declaring it here puts it in the
    // snapshot and ends that. The migration that first introduces this
    // declaration uses `CREATE INDEX IF NOT EXISTS`, because databases migrated
    // through 0006 already have the index.
    index("idx_resume_embeddings_vector")
      .using("ivfflat", table.embedding.op("vector_cosine_ops"))
      .with({ lists: 100 }),
  ],
);

// Per-source vectors, one row per (user, source), so a recruiter can scope the
// semantic search to what a candidate *wrote about shipping* (posts) rather than
// what their resume claims (profile). `source` holds a `searchSourceSchema`
// value from @repo/schemas: "profile" | "work" | "posts".
export const resumeSectionEmbeddings = pgTable(
  "resume_section_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    contentHash: text("content_hash").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    embeddingModel: text("embedding_model").notNull(),
    embeddingVersion: text("embedding_version").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    unique("resume_section_embeddings_user_id_source_unique").on(
      table.userId,
      table.source,
    ),
    index("resume_section_embeddings_source_idx").on(table.source),
    index("idx_resume_section_embeddings_vector")
      .using("ivfflat", table.embedding.op("vector_cosine_ops"))
      .with({ lists: 100 }),
  ],
);

export const candidateInteractions = pgTable(
  "candidate_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resumeId: uuid("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    recruiterId: uuid("recruiter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    interactionType: text("interaction_type").notNull(),
    queryText: text("query_text"),
    semanticSimilarity: real("semantic_similarity"),
    rankPosition: integer("rank_position"),
    metadata: jsonb("metadata"),
    candidateSnapshot: jsonb("candidate_snapshot"),
    querySnapshot: jsonb("query_snapshot"),
    // Exposure context, all nullable because rows written before this existed
    // simply have no exposure information. Together they let training correct
    // for position bias: a candidate ignored at rank 40 is not the same signal
    // as a candidate ignored at rank 1.
    displayedRank: integer("displayed_rank"),
    resultCount: integer("result_count"),
    searchSessionId: text("search_session_id"),
    propensity: real("propensity"),
    trainedAt: timestamp("trained_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("candidate_interactions_resume_id_idx").on(table.resumeId),
    index("candidate_interactions_recruiter_id_idx").on(table.recruiterId),
    index("candidate_interactions_created_at_idx").on(table.createdAt),
    index("candidate_interactions_trained_at_idx").on(table.trainedAt),
  ],
);

/**
 * A source of developer activity the user has connected: their personal GitHub,
 * their work GitLab, the Claude Code hook on their laptop, the local extractor.
 *
 * `kind` is the privacy switch. A "work" connection never contributes anything
 * identifying (see `activity_events` below) and its disclosure level is
 * INHERITED: `disclosure_level_override` when the user set one on this specific
 * connection, otherwise `work_experiences.disclosure_level` of the linked role,
 * otherwise the account-level `users.agent_disclosure_level`. The chain is
 * resolved in one place — `resolveConnectionDisclosure` in
 * core/use-case/activity/shared — so the ingestion path and the digest path can
 * never disagree about it.
 *
 * "mixed" is one machine holding personal AND work repositories, and it is held
 * to the WORK rules end to end (`GitConnectionEntity.isWork()`): once both kinds
 * of activity are aggregated into one digest, no number in it can be attributed
 * to the personal half, so the employer's rules have to govern all of it. It may
 * carry a `work_experience_id` and inherits that employer's level exactly as a
 * "work" row does.
 */
export const gitConnections = pgTable(
  "git_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // "github" | "gitlab" | "claude_code" | "extractor" — `gitConnectionProviderSchema`.
    provider: text("provider").notNull(),
    // "personal" | "work" | "mixed" — `gitConnectionKindSchema`. Plain text with
    // NO check constraint or pg enum on purpose: the values are validated by the
    // schema package at the edge, and a database-level enum would turn adding a
    // fourth kind into a migration that locks the table.
    kind: text("kind").notNull(),
    /** User-facing label, e.g. "Personal GitHub". Chosen by the user, never derived from a repo or org name. */
    displayName: text("display_name").notNull(),
    /**
     * The forge account id. Nullable because `claude_code` and `extractor` are
     * local tools with no remote account at all — see the two partial unique
     * indexes below for how that nullability is kept from defeating uniqueness.
     */
    externalAccountId: text("external_account_id"),
    /**
     * The role a WORK connection belongs to. `set null` because losing the role
     * must not delete the connection (and with it the activity history) — it
     * only makes the connection fall back to the account disclosure level.
     */
    workExperienceId: uuid("work_experience_id").references(
      () => workExperiences.id,
      { onDelete: "set null" },
    ),
    /** Per-connection override of the inherited level. NULL = inherit, the common case. */
    disclosureLevelOverride: text("disclosure_level_override"),
    /** Shared secret for verifying forge webhook signatures. Never leaves the API. */
    webhookSecret: text("webhook_secret"),
    autoPostEnabled: boolean("auto_post_enabled").notNull().default(false),
    // "weekly" | "biweekly" | "monthly" | "off" — `digestCadenceSchema`. Weekly
    // is the floor on purpose: daily digests were removed so a profile can
    // never become a commit firehose.
    cadence: text("cadence").notNull().default("weekly"),
    /**
     * Opt-in for including the coding agent's own task summary text in a digest.
     * Defaults to FALSE and must stay that way: that text is free-form prose
     * written by an agent about work that may be an employer's, and shipping it
     * by default would leak exactly what the disclosure policy exists to hold back.
     */
    includeAgentSummary: boolean("include_agent_summary")
      .notNull()
      .default(false),
    lastDigestAt: timestamp("last_digest_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("git_connections_user_id_idx").on(table.userId),
    index("git_connections_work_experience_id_idx").on(table.workExperienceId),
    /**
     * Reconnecting the same forge account must update the existing row, not
     * create a second one that then receives duplicate webhooks.
     *
     * This is a PARTIAL unique index on purpose. A plain
     * `UNIQUE (user_id, provider, external_account_id)` would be silently inert
     * for `claude_code`/`extractor`: NULLs compare as distinct in Postgres, so
     * a user could accumulate unlimited null-account rows for the same provider
     * and every one of them would look unique.
     */
    uniqueIndex("git_connections_user_provider_account_unique")
      .on(table.userId, table.provider, table.externalAccountId)
      .where(sql`${table.externalAccountId} is not null`),
    /**
     * The null-account half of the rule above: a local tool has no account id,
     * so identity falls back to (user, provider, kind). That still allows the
     * split that matters — a personal extractor AND a work extractor — while
     * making a re-run of the setup command idempotent.
     *
     * `kind` being part of the key means the arity follows
     * `gitConnectionKindSchema`: with "mixed" added, one user may now hold up to
     * THREE null-account rows for the same provider (personal + work + mixed).
     * That is intended — they are three different disclosure scopes, and the
     * index only exists to stop a re-run creating a second row in the SAME
     * scope. Nothing here assumes a kind is unique per user.
     */
    uniqueIndex("git_connections_user_provider_kind_unique")
      .on(table.userId, table.provider, table.kind)
      .where(sql`${table.externalAccountId} is null`),
  ],
);

/**
 * The raw ingestion log: one row per delivered activity, append-only.
 *
 * PRIVACY — the omissions here are the design, not an oversight. Do not "helpfully"
 * add any of the following back:
 *
 * - No repo name, branch name, file path or commit message. `repo_fingerprint`
 *   is a hash, so "you worked across 4 repos" stays computable while the repos
 *   stay unnamed.
 * - No third-party identities. Co-authors, reviewers and approvers never agreed
 *   to be in this product, so they are hashed at INGESTION time (never at render
 *   time, which would mean the clear value was stored) into
 *   `counterparty_fingerprints`. Distinct-count questions — "approved by 9
 *   distinct reviewers" — are answerable from hashes alone.
 * - No hour-of-day and no timezone offset. `occurred_on` is a DATE, the coarsest
 *   granularity that still supports the per-week and per-month aggregation the
 *   digests need. A timestamp here would publish the user's sleep schedule.
 * - `payload` holds ALREADY-REDACTED context only. Raw webhook bodies must never
 *   reach this column.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => gitConnections.id, { onDelete: "cascade" }),
    // "hook" | "github" | "gitlab" | "extractor" — `activitySourceSchema`.
    source: text("source").notNull(),
    /**
     * The delivering system's own id for this event: X-GitHub-Delivery, the
     * GitLab webhook id, `${sessionId}:${turn}` for the Claude Code hook, the
     * extractor's upload id. Paired with `source` it is the idempotency key.
     */
    externalDeliveryId: text("external_delivery_id").notNull(),
    // `activityEventKindSchema`.
    kind: text("kind").notNull(),
    /** DATE, deliberately — see the privacy note above. */
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    /** A hash. Never a repository name. */
    repoFingerprint: text("repo_fingerprint").notNull(),
    /** Normalized language/framework tags — the only free-text that survives ingestion. */
    technologies: text("technologies").array().notNull().default([]),
    /** False when the event is third-party warranting, e.g. a review the user GAVE. */
    actorIsOwner: boolean("actor_is_owner").notNull().default(true),
    /** HASHED distinct reviewer/approver ids. See the privacy note above. */
    counterpartyFingerprints: text("counterparty_fingerprints")
      .array()
      .notNull()
      .default([]),
    payload: jsonb("payload"),
    // No `updated_at`: this table is an append-only log. An event that was
    // delivered differently is a new delivery, not an edit of an old one.
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    /**
     * THE idempotency key. Webhook redelivery, a manual resend and a
     * double-firing Claude Code hook all collide here, which is what lets the
     * repository turn them into a no-op via `ON CONFLICT DO NOTHING` instead of
     * an error the caller has to interpret.
     */
    unique("activity_events_source_external_delivery_id_unique").on(
      table.source,
      table.externalDeliveryId,
    ),
    // Every digest reads one user's events over one date window.
    index("activity_events_user_id_occurred_on_idx").on(
      table.userId,
      table.occurredOn,
    ),
    index("activity_events_connection_id_idx").on(table.connectionId),
    // `technologies @> '{typescript}'` is a seq scan without this.
    index("activity_events_technologies_gin_idx").using(
      "gin",
      table.technologies,
    ),
  ],
);

/**
 * Private per-user interface preferences: rendering language and light/dark.
 *
 * WHY THIS IS A SEPARATE TABLE AND NOT TWO MORE COLUMNS ON `users`
 *
 * `profileSchema` in @repo/schemas is the response shape for BOTH `GET /me`
 * and the fully public `GET /profile/:username`, and it is fed straight from a
 * `users` row. Put `language` and `theme` on `users` and the natural next edit
 * — adding them beside `themePreset`, which is already in that schema —
 * silently publishes a person's UI language and dark-mode setting to every
 * anonymous visitor of their profile. A separate table makes that leak require
 * deliberate effort instead of being the path of least resistance, and gives
 * the preference set somewhere to grow (notifications, email cadence) without
 * widening the row that gets serialised publicly.
 *
 * `user_id` is the primary key AND the foreign key: 1:1 is enforced by the
 * schema rather than by convention, the index comes free, and ON DELETE
 * CASCADE means deleting a user cannot orphan a preference row.
 *
 * Both "follow the device" states are real stored values, not absences:
 * `language IS NULL` and `theme = 'system'`. The rejected alternative — freeze
 * the detected device value into the row on first login — reads as "saved" but
 * strands a user who later flips their OS to dark mode in permanent light.
 */
export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** NULL = follow the device. See `uiLanguageSchema` in @repo/schemas. */
    language: text("language"),
    /** See `themePreferenceSchema` in @repo/schemas. */
    theme: text("theme").notNull().default("system"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    /*
     * The zod schemas at the HTTP edge already reject these values, but a
     * migration, a seed script or a psql session does not go through zod. A
     * stored `theme = 'sepia'` would be read back as a valid `ThemePreference`
     * by every consumer and break at render time instead of at write time.
     *
     * Written as literal IN lists rather than a pg enum: adding a fourth locale
     * is then an ALTER on one constraint, not a type migration.
     */
    check(
      "user_preferences_language_check",
      sql`${table.language} IS NULL OR ${table.language} IN ('en-US', 'pt-BR', 'es-ES')`,
    ),
    check(
      "user_preferences_theme_check",
      sql`${table.theme} IN ('light', 'dark', 'system')`,
    ),
  ],
);

export const refreshTokenRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokenRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  }),
);

export const emailVerificationTokenRelations = relations(
  emailVerificationTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [emailVerificationTokens.userId],
      references: [users.id],
    }),
  }),
);

export const userRelations = relations(users, ({ one, many }) => ({
  preferences: one(userPreferences),
  refreshTokens: many(refreshTokens),
  emailVerificationTokens: many(emailVerificationTokens),
  passwordResetTokens: many(passwordResetTokens),
  oauthAccounts: many(oauthAccounts),
  links: many(links),
  posts: many(posts),
  apiTokens: many(apiTokens),
  profileTabs: many(profileTabs),
  profileBlocks: many(profileBlocks),
  workExperiences: many(workExperiences),
  resumes: many(resumes),
  resumeSectionEmbeddings: many(resumeSectionEmbeddings),
  candidateInteractions: many(candidateInteractions),
  createdSkills: many(skillsCatalog),
  createdTitles: many(titlesCatalog),
  gitConnections: many(gitConnections),
  activityEvents: many(activityEvents),
}));

export const oauthAccountRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, {
    fields: [oauthAccounts.userId],
    references: [users.id],
  }),
}));

export const linksRelations = relations(links, ({ one }) => ({
  user: one(users, {
    fields: [links.userId],
    references: [users.id],
  }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  user: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
  workExperience: one(workExperiences, {
    fields: [posts.workExperienceId],
    references: [workExperiences.id],
  }),
}));

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  user: one(users, {
    fields: [apiTokens.userId],
    references: [users.id],
  }),
}));

export const profileTabsRelations = relations(profileTabs, ({ one, many }) => ({
  user: one(users, {
    fields: [profileTabs.userId],
    references: [users.id],
  }),
  blocks: many(profileBlocks),
}));

export const profileBlocksRelations = relations(profileBlocks, ({ one }) => ({
  user: one(users, {
    fields: [profileBlocks.userId],
    references: [users.id],
  }),
  tab: one(profileTabs, {
    fields: [profileBlocks.tabId],
    references: [profileTabs.id],
  }),
}));

export const workExperiencesRelations = relations(
  workExperiences,
  ({ one, many }) => ({
    user: one(users, {
      fields: [workExperiences.userId],
      references: [users.id],
    }),
    gitConnections: many(gitConnections),
  }),
);

export const gitConnectionsRelations = relations(
  gitConnections,
  ({ one, many }) => ({
    user: one(users, {
      fields: [gitConnections.userId],
      references: [users.id],
    }),
    workExperience: one(workExperiences, {
      fields: [gitConnections.workExperienceId],
      references: [workExperiences.id],
    }),
    activityEvents: many(activityEvents),
  }),
);

export const activityEventsRelations = relations(activityEvents, ({ one }) => ({
  user: one(users, {
    fields: [activityEvents.userId],
    references: [users.id],
  }),
  connection: one(gitConnections, {
    fields: [activityEvents.connectionId],
    references: [gitConnections.id],
  }),
}));

export const resumesRelations = relations(resumes, ({ one, many }) => ({
  user: one(users, {
    fields: [resumes.userId],
    references: [users.id],
  }),
  skills: many(resumeSkills),
  titles: many(resumeTitles),
  embedding: one(resumeEmbeddings, {
    fields: [resumes.id],
    references: [resumeEmbeddings.resumeId],
  }),
  candidateInteractions: many(candidateInteractions),
}));

export const skillsCatalogRelations = relations(
  skillsCatalog,
  ({ one, many }) => ({
    createdBy: one(users, {
      fields: [skillsCatalog.createdByUserId],
      references: [users.id],
    }),
    resumeSkills: many(resumeSkills),
  }),
);

export const titlesCatalogRelations = relations(
  titlesCatalog,
  ({ one, many }) => ({
    createdBy: one(users, {
      fields: [titlesCatalog.createdByUserId],
      references: [users.id],
    }),
    resumeTitles: many(resumeTitles),
  }),
);

export const resumeSkillsRelations = relations(resumeSkills, ({ one }) => ({
  resume: one(resumes, {
    fields: [resumeSkills.resumeId],
    references: [resumes.id],
  }),
  skill: one(skillsCatalog, {
    fields: [resumeSkills.skillId],
    references: [skillsCatalog.id],
  }),
}));

export const resumeTitlesRelations = relations(resumeTitles, ({ one }) => ({
  resume: one(resumes, {
    fields: [resumeTitles.resumeId],
    references: [resumes.id],
  }),
  title: one(titlesCatalog, {
    fields: [resumeTitles.titleId],
    references: [titlesCatalog.id],
  }),
}));

export const resumeEmbeddingsRelations = relations(
  resumeEmbeddings,
  ({ one }) => ({
    resume: one(resumes, {
      fields: [resumeEmbeddings.resumeId],
      references: [resumes.id],
    }),
    user: one(users, {
      fields: [resumeEmbeddings.userId],
      references: [users.id],
    }),
  }),
);

export const candidateInteractionsRelations = relations(
  candidateInteractions,
  ({ one }) => ({
    resume: one(resumes, {
      fields: [candidateInteractions.resumeId],
      references: [resumes.id],
    }),
    recruiter: one(users, {
      fields: [candidateInteractions.recruiterId],
      references: [users.id],
    }),
  }),
);

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));
