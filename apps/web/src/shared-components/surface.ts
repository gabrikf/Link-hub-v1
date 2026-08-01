/**
 * Surface and badge tokens.
 *
 * These are class-string constants, not components — the elements that need
 * them vary too much (`section`, `aside`, `li`, `article`, `a`, `div`) for a
 * `<Card>` wrapper to be worth it. Padding stays at the call site; only the
 * material (radius, border, background, shadow) lives here.
 *
 * Before this existed the surface literal had drifted into ~10 forks that
 * differed only in dark-mode border (`zinc-700` vs `zinc-800`), background
 * opacity (`/30` `/40` `/60` `/70`) and padding — visible as sibling blocks on
 * the public profile reading as different materials.
 */

/** Default elevated card: dashboard, settings, editor panels. */
export const SURFACE =
  "rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

/**
 * Public-profile block surface. Lighter border and a translucent background so
 * the user's accent theme and cover image read through it.
 */
export const SURFACE_PROFILE =
  "rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70";

/** Frosted panel over a background image or gradient. */
export const SURFACE_GLASS =
  "rounded-2xl border border-zinc-200 bg-white/70 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/50";

/** Recessed panel nested inside a card — form groups, detail rows. */
export const SURFACE_INSET =
  "rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/40";

/** Dashed placeholder for empty lists. */
export const SURFACE_EMPTY =
  "rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40";

/**
 * Semantic badge tokens.
 *
 * Previously "success" had three competing definitions (`emerald-200` vs
 * `emerald-300` vs an `emerald-800` foreground), so "Current" on a work-history
 * row and "Active" on a token rendered as visibly different greens in dark
 * mode. All of these clear 4.5:1 in both themes.
 */
export const BADGE = {
  neutral: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
  warning:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
  accent:
    "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200",
  info: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200",
  danger: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200",
  /**
   * Distinct from `accent` on purpose: violet is the default `--profile-accent`,
   * so an accent-coloured badge on a public profile collides with the user's
   * theme rather than reading as a category.
   */
  magenta:
    "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-200",
} as const;

export type BadgeTone = keyof typeof BADGE;

/**
 * Higher-contrast badge for the one place a badge is the primary signal rather
 * than a label — the recruiter match-strength chip.
 */
export const BADGE_STRONG = {
  success:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100",
  warning:
    "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100",
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
} as const;

/**
 * The house focus ring. Keyboard focus was previously invisible on `Button`,
 * `Input` and `TextArea` — the three most-used primitives in the app.
 *
 * Use `FOCUS_RING` on controls that sit on a card, `FOCUS_RING_PAGE` on
 * controls that sit directly on the page background.
 */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900";

export const FOCUS_RING_PAGE =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-100 dark:focus-visible:ring-offset-zinc-950";

/** Field-level ring for inputs, which carry their own border. */
export const FOCUS_RING_FIELD =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500";
