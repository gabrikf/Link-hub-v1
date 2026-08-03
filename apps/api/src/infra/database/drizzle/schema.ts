import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
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
  googleId: text("google_id").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

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
    // Shared logical identity that links the pc-row and mobile-row of the SAME
    // logical tab. Structure (title/order/existence) mirrors across viewports by
    // groupId; only block positions differ per viewport.
    groupId: uuid("group_id").notNull(),
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
    index("profile_tabs_group_id_idx").on(table.groupId),
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
    // logical block. Kind/config/visibility/pin/tab-association mirror across
    // viewports by groupId; only gridX/Y/W/H differ per viewport.
    groupId: uuid("group_id").notNull(),
    viewport: text("viewport").notNull(),
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

export const refreshTokenRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const userRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
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
  ({ one }) => ({
    user: one(users, {
      fields: [workExperiences.userId],
      references: [users.id],
    }),
  }),
);

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
