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
 */
export const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), {
    message: "Only http(s) URLs are allowed",
  });

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
 * Canonical starting layout for a freshly-seeded viewport: header pinned across
 * all tabs, then links/resume/work stacked full-width in the default tab.
 * `gridW` is filled in by the seeder using GRID_COLUMNS[viewport].
 */
export const DEFAULT_BUILTIN_BLOCKS: {
  kind: BuiltinBlockKind;
  pinnedAllTabs: boolean;
  gridY: number;
  gridH: number;
}[] = [
  { kind: "header", pinnedAllTabs: true, gridY: 0, gridH: 4 },
  { kind: "links", pinnedAllTabs: false, gridY: 0, gridH: 4 },
  { kind: "resume", pinnedAllTabs: false, gridY: 4, gridH: 6 },
  { kind: "work_experiences", pinnedAllTabs: false, gridY: 10, gridH: 6 },
];
