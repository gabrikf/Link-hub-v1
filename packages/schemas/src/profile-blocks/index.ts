import { z } from "zod/v4";

/* ------------------------------------------------------------------ *
 * Viewport + grid model
 * ------------------------------------------------------------------ */

export const profileViewportSchema = z.enum(["pc", "mobile"]);
export type ProfileViewport = z.infer<typeof profileViewportSchema>;

/** Grid column count per viewport (react-grid-layout on the editor, CSS grid on public). */
export const GRID_COLUMNS: Record<ProfileViewport, number> = {
  pc: 12,
  mobile: 4,
};

/* ------------------------------------------------------------------ *
 * Block kinds
 * ------------------------------------------------------------------ */

export const builtinBlockKindSchema = z.enum([
  "header",
  "links",
  "resume",
  "work_experiences",
]);
export const customBlockKindSchema = z.enum([
  "text",
  "video",
  "image",
  "button",
  "posts",
]);
export const blockKindSchema = z.enum([
  "header",
  "links",
  "resume",
  "work_experiences",
  "text",
  "video",
  "image",
  "button",
  "posts",
]);

export type BuiltinBlockKind = z.infer<typeof builtinBlockKindSchema>;
export type CustomBlockKind = z.infer<typeof customBlockKindSchema>;
export type BlockKind = z.infer<typeof blockKindSchema>;

export const BUILTIN_BLOCK_KINDS = builtinBlockKindSchema.options;
export const CUSTOM_BLOCK_KINDS = customBlockKindSchema.options;

/* ------------------------------------------------------------------ *
 * Custom block config (validated per-kind)
 * ------------------------------------------------------------------ */

/**
 * Strict http(s)-only URL. `z.string().url()` alone accepts `javascript:`,
 * `data:`, `vbscript:` schemes — which become stored-XSS when rendered into an
 * `<a href>` on the PUBLIC profile. Every user-supplied URL that reaches an href
 * or media src must use this.
 *
 * `httpUrlSchema` is the default. Pass `invalidUrlMessage` when the field is
 * bound to a form whose "this is not a URL" wording is already user-visible —
 * the scheme rejection keeps its own message either way.
 */
export const httpUrlSchemaWith = (invalidUrlMessage?: string) =>
  z
    .string()
    .trim()
    .url(invalidUrlMessage)
    .refine((u) => /^https?:\/\//i.test(u), {
      message: "Only http(s) URLs are allowed",
    });

export const httpUrlSchema = httpUrlSchemaWith();

export const textBlockConfigSchema = z.object({
  title: z.string().max(120).optional(),
  body: z.string().min(1).max(4000),
});

export const videoBlockConfigSchema = z.object({
  title: z.string().max(120).optional(),
  provider: z.enum(["youtube", "vimeo"]),
  url: httpUrlSchema,
});

export const imageItemSchema = z.object({
  url: httpUrlSchema,
  alt: z.string().max(200).optional(),
});
export const imageBlockConfigSchema = z.object({
  title: z.string().max(120).optional(),
  layout: z.enum(["single", "gallery"]).default("single"),
  images: z.array(imageItemSchema).min(1).max(12),
});

export const buttonBlockConfigSchema = z.object({
  label: z.string().min(1).max(80),
  url: httpUrlSchema,
  /** tailwind token or hex, e.g. "violet" | "#8b5cf6" */
  accent: z.string().max(20).optional(),
  /** react-icons/fi name, e.g. "FiDownload" */
  icon: z.string().max(40).optional(),
});

/**
 * Feed of the profile owner's published posts. The block config holds only
 * display options — the actual post content is fetched separately on the public
 * profile (published-only) so authoring stays in the Posts surface.
 */
export const postsBlockConfigSchema = z.object({
  title: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(20).default(5),
  layout: z.enum(["list", "grid"]).default("list"),
  tag: z.string().trim().max(60).optional(),
});

export type TextBlockConfig = z.infer<typeof textBlockConfigSchema>;
export type VideoBlockConfig = z.infer<typeof videoBlockConfigSchema>;
export type ImageBlockConfig = z.infer<typeof imageBlockConfigSchema>;
export type ButtonBlockConfig = z.infer<typeof buttonBlockConfigSchema>;
export type PostsBlockConfig = z.infer<typeof postsBlockConfigSchema>;
export type CustomBlockConfig =
  | TextBlockConfig
  | VideoBlockConfig
  | ImageBlockConfig
  | ButtonBlockConfig
  | PostsBlockConfig;

/** Kind → config schema. Use in the API use-cases to validate `config` against a block's kind. */
export const customBlockConfigSchemaByKind = {
  text: textBlockConfigSchema,
  video: videoBlockConfigSchema,
  image: imageBlockConfigSchema,
  button: buttonBlockConfigSchema,
  posts: postsBlockConfigSchema,
} as const;

/* ------------------------------------------------------------------ *
 * Response schemas: tab, block, layout
 * ------------------------------------------------------------------ */

export const profileTabSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number().int(),
});
export type ProfileTab = z.infer<typeof profileTabSchema>;

export const profileBlockSchema = z.object({
  id: z.string(),
  /**
   * Shared logical identity linking this block's pc-row and mobile-row. Same
   * groupId across viewports; only gridX/Y/W/H differ. The editor can use it to
   * correlate the two viewport rows of a single logical block.
   */
  groupId: z.string(),
  kind: blockKindSchema,
  /** null when the block is pinned (lives in the shared "all tabs" grid). */
  tabId: z.string().nullable(),
  gridX: z.number().int().min(0),
  gridY: z.number().int().min(0),
  gridW: z.number().int().min(1),
  gridH: z.number().int().min(1),
  isVisible: z.boolean(),
  pinnedAllTabs: z.boolean(),
  /** null for built-ins; a CustomBlockConfig for custom kinds. Narrow by `kind`. */
  config: z.unknown().nullable(),
});
export type ProfileBlock = z.infer<typeof profileBlockSchema>;

/** One viewport's layout: its content tabs plus every block (pinned blocks have tabId=null). */
export const layoutSchema = z.object({
  tabs: z.array(profileTabSchema),
  blocks: z.array(profileBlockSchema),
  /*
   * "Simple mode", PER VIEWPORT. False means this viewport renders no tab strip
   * and only the first tab's blocks, plus the always-visible zone.
   *
   * It lives here rather than on the profile because tabs themselves are
   * per-viewport (`profile_tabs.viewport`), and the real use case is asymmetric:
   * tabs on a wide desktop layout, a single scrolling list on a phone. One
   * profile-level flag cannot express that, and forcing both viewports to agree
   * made switching one silently switch the other.
   */
  tabsEnabled: z.boolean(),
});
export type ProfileLayout = z.infer<typeof layoutSchema>;

export const fullLayoutSchema = z.object({
  pc: layoutSchema,
  mobile: layoutSchema,
});
export type FullProfileLayout = z.infer<typeof fullLayoutSchema>;

/* ------------------------------------------------------------------ *
 * Inputs — tabs
 * ------------------------------------------------------------------ */

export const layoutViewportQuerySchema = z.object({
  viewport: profileViewportSchema.optional(),
});

/**
 * Flips the tab strip for ONE viewport. Deliberately its own endpoint input
 * rather than a field on `updateProfileSchemaInput`: this is per-viewport
 * layout state, and routing it through the profile update would have required
 * every caller to also send `username` just to toggle a switch.
 */
export const setTabsEnabledSchemaInput = z.object({
  viewport: profileViewportSchema,
  tabsEnabled: z.boolean(),
});
export type SetTabsEnabledInput = z.infer<typeof setTabsEnabledSchemaInput>;

export const createTabSchemaInput = z.object({
  viewport: profileViewportSchema,
  title: z.string().trim().min(1, "Tab title is required").max(40),
});
export const renameTabSchemaInput = z.object({
  title: z.string().trim().min(1, "Tab title is required").max(40),
});
export const reorderTabsSchemaInput = z.object({
  viewport: profileViewportSchema,
  tabIds: z.array(z.string()).min(1, "At least one tab id is required"),
});
export const tabIdParamsSchema = z.object({ id: z.string() });

/* ------------------------------------------------------------------ *
 * Inputs — blocks
 * ------------------------------------------------------------------ */

export const blockIdParamsSchema = z.object({ id: z.string() });

const gridPlacement = z.object({
  gridX: z.number().int().min(0).optional(),
  gridY: z.number().int().min(0).optional(),
  gridW: z.number().int().min(1).optional(),
  gridH: z.number().int().min(1).optional(),
});

/** Create a custom block (built-ins are seeded, never created). Config validated by kind. */
export const createBlockSchemaInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    viewport: profileViewportSchema,
    tabId: z.string().nullable().optional(),
    config: textBlockConfigSchema,
    placement: gridPlacement.optional(),
  }),
  z.object({
    kind: z.literal("video"),
    viewport: profileViewportSchema,
    tabId: z.string().nullable().optional(),
    config: videoBlockConfigSchema,
    placement: gridPlacement.optional(),
  }),
  z.object({
    kind: z.literal("image"),
    viewport: profileViewportSchema,
    tabId: z.string().nullable().optional(),
    config: imageBlockConfigSchema,
    placement: gridPlacement.optional(),
  }),
  z.object({
    kind: z.literal("button"),
    viewport: profileViewportSchema,
    tabId: z.string().nullable().optional(),
    config: buttonBlockConfigSchema,
    placement: gridPlacement.optional(),
  }),
  z.object({
    kind: z.literal("posts"),
    viewport: profileViewportSchema,
    tabId: z.string().nullable().optional(),
    config: postsBlockConfigSchema,
    placement: gridPlacement.optional(),
  }),
]);

/**
 * Partial update of a single block. `config` is validated against the block's
 * stored kind inside the use-case (controller can't know the kind up front).
 */
export const updateBlockSchemaInput = z.object({
  config: z.unknown().optional(),
  isVisible: z.boolean().optional(),
  pinnedAllTabs: z.boolean().optional(),
  tabId: z.string().nullable().optional(),
});

/** Batch position/size persistence after drag/resize in the grid. */
export const blockPositionSchema = z.object({
  id: z.string(),
  gridX: z.number().int().min(0),
  gridY: z.number().int().min(0),
  gridW: z.number().int().min(1),
  gridH: z.number().int().min(1),
});
export const updateBlockPositionsSchemaInput = z.object({
  viewport: profileViewportSchema,
  positions: z.array(blockPositionSchema).min(1),
});

export type CreateBlockInput = z.infer<typeof createBlockSchemaInput>;
export type UpdateBlockInput = z.infer<typeof updateBlockSchemaInput>;
export type UpdateBlockPositionsInput = z.infer<
  typeof updateBlockPositionsSchemaInput
>;
export type CreateTabInput = z.infer<typeof createTabSchemaInput>;
export type RenameTabInput = z.infer<typeof renameTabSchemaInput>;
export type ReorderTabsInput = z.infer<typeof reorderTabsSchemaInput>;
export type BlockPosition = z.infer<typeof blockPositionSchema>;

/* ------------------------------------------------------------------ *
 * Defaults (used by the API to seed a viewport on first access)
 * ------------------------------------------------------------------ */

export const DEFAULT_TAB_TITLE = "Main";

/**
 * Whether a BRAND-NEW account starts with its tab strip on, per viewport.
 *
 * `false`: a new profile publishes only its always-visible zone — the photo,
 * the name and the links — and nothing else. The resume, work history and posts
 * blocks are still seeded into the default tab (see
 * {@link DEFAULT_BUILTIN_BLOCKS}), fully arranged and ready; they simply are not
 * on the public page until the owner flips "Show tabs" on, at which point they
 * appear with no further setup.
 *
 * This is the NEW-ACCOUNT default only. It is deliberately NOT the value an
 * absent flag resolves to on an existing row: accounts that predate the columns
 * had a tab strip, and reading `false` for them would take content off profiles
 * their owners never touched.
 */
export const DEFAULT_TABS_ENABLED = false;

/**
 * Canonical starting layout for a freshly-seeded viewport.
 *
 * A new profile starts MINIMAL: the always-visible zone holds the header (photo
 * + name) and the links, and that is the whole published page, because
 * {@link DEFAULT_TABS_ENABLED} is false. Resume, work history and posts are
 * pre-placed in the default tab so that flipping "Show tabs" on reveals a
 * finished profile rather than an empty grid — nothing to arrange, nothing to
 * add.
 *
 * `gridW` is filled in by the seeder using GRID_COLUMNS[viewport].
 *
 * The two zones have INDEPENDENT y-coordinates — they are rendered as separate
 * grids — so the pinned pair stacks 0/4 and the tab trio re-bases from 0.
 *
 * `posts` is the one non-builtin kind here. It is seeded by default because a
 * candidate's published posts — especially the commit summaries written by the
 * MCP server — are the only place a visitor can see what they actually shipped,
 * and a block nobody knows to add is a block nobody has. It carries a starting
 * `config` (built-ins have none) so the feed renders without an editor visit.
 */
export const DEFAULT_BUILTIN_BLOCKS: {
  kind: BlockKind;
  pinnedAllTabs: boolean;
  gridY: number;
  gridH: number;
  /** Seeded block config; `null` for built-ins, which take no config. */
  config?: CustomBlockConfig | null;
}[] = [
  // Always-visible zone — the entire published profile of a new account.
  { kind: "header", pinnedAllTabs: true, gridY: 0, gridH: 4 },
  { kind: "links", pinnedAllTabs: true, gridY: 4, gridH: 4 },
  // Default tab — pre-arranged, revealed by the "Show tabs" switch.
  { kind: "resume", pinnedAllTabs: false, gridY: 0, gridH: 6 },
  { kind: "work_experiences", pinnedAllTabs: false, gridY: 6, gridH: 6 },
  {
    kind: "posts",
    pinnedAllTabs: false,
    gridY: 12,
    gridH: 6,
    config: { title: "Posts", limit: 5, layout: "list" },
  },
];
