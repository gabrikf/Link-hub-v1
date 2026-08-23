import {
  DEFAULT_BUILTIN_BLOCKS,
  DEFAULT_TAB_TITLE,
  GRID_COLUMNS,
  type BlockPosition,
  type FullProfileLayout,
  type ProfileBlock,
  type ProfileLayout,
  type ProfileViewport,
} from "@repo/schemas";
import type { LayoutItem } from "react-grid-layout";
// `react-grid-layout/core` is the React-free entry point: importing the pure
// geometry helpers from there keeps this module renderer-agnostic (it is used by
// the public profile renderer too, which never mounts a GridLayout).
import {
  correctBounds,
  moveElement,
  verticalCompactor,
} from "react-grid-layout/core";

/** react-grid-layout item plus the extra flags we push onto each grid child. */
export type GridLayoutItem = LayoutItem;

/** Default height (in grid rows) for a freshly-added custom block. */
export const DEFAULT_CUSTOM_BLOCK_HEIGHT = 4;

/**
 * Width (px) of the block canvas per viewport — the SINGLE source of truth that
 * the editor grid, the preview modal and the published profile all clamp to.
 *
 * Without it the two canvases disagreed wildly and every drag was a lie: the
 * editor grid measured ~1169px (12 cols x 86.4px) while the published page
 * measured 670px (12 cols x 44.8px) at every window width from 900 to 1280. A
 * block dragged as 6x4 (522x172 in the editor) published at 281x172 — half the
 * width, same height. Mobile was worse: nothing constrained the editor per
 * viewport, so the 4-column mobile layout was edited at ~1169px (292px columns)
 * and published at 293px (64.25px columns), a 4.6x error.
 *
 * The numbers: `pc` is sized so a 12-column grid has usable columns (1024px ->
 * ~74px per column at the 12px gutter) while still fitting inside the editor
 * shell at a 1280px window. `mobile` approximates a phone's content box
 * (a 390-430px device minus the page and card padding) so the 4-column mobile
 * canvas matches what a phone actually renders.
 *
 * Both are MAXIMUMS: every consumer stays fluid below them, so a narrow phone
 * simply gets a narrower grid with the same proportions.
 */
export const PROFILE_CANVAS_WIDTH: Record<ProfileViewport, number> = {
  pc: 1024,
  mobile: 360,
};

/**
 * Pixel height of one grid row and the gutter between cells. Shared by the
 * react-grid-layout editor (`rowHeight` / `margin`) and the CSS-grid renderer
 * on the public profile, so a block's `gridH` maps to the same pixel height in
 * both. Do not fork these.
 */
export const GRID_ROW_HEIGHT = 40;
export const GRID_GAP = 12;

/** Pick which viewport's layout to show from the "is this a narrow screen?" flag. */
export function pickViewport(isMobile: boolean): ProfileViewport {
  return isMobile ? "mobile" : "pc";
}

/**
 * Build a default single-tab layout for a viewport. Used as a fallback when the
 * server response has no `layout` (legacy profiles) so the profile still renders
 * fully instead of collapsing to an empty grid.
 */
export function buildDefaultLayout(viewport: ProfileViewport): ProfileLayout {
  const cols = GRID_COLUMNS[viewport];
  const tabId = `default-tab-${viewport}`;

  const blocks: ProfileBlock[] = DEFAULT_BUILTIN_BLOCKS.map((builtin) => ({
    id: `default-${viewport}-${builtin.kind}`,
    // Viewport-independent so the pc/mobile fallback rows share a logical id.
    groupId: `default-group-${builtin.kind}`,
    kind: builtin.kind,
    tabId: builtin.pinnedAllTabs ? null : tabId,
    gridX: 0,
    gridY: builtin.gridY,
    gridW: cols,
    gridH: builtin.gridH,
    isVisible: true,
    pinnedAllTabs: builtin.pinnedAllTabs,
    config: null,
  }));

  return {
    tabs: [{ id: tabId, title: DEFAULT_TAB_TITLE, order: 0 }],
    blocks,
  };
}

/**
 * Resolve the layout for one viewport out of a (possibly-undefined) full layout,
 * falling back to the default single-tab layout for legacy responses.
 */
export function resolveViewportLayout(
  layout: FullProfileLayout | undefined,
  viewport: ProfileViewport,
): ProfileLayout {
  const viewportLayout = layout?.[viewport];
  if (!viewportLayout || viewportLayout.tabs.length === 0) {
    return buildDefaultLayout(viewport);
  }
  return viewportLayout;
}

/** Pinned blocks (shown on every tab) in stable grid order. */
export function pinnedBlocks(layout: ProfileLayout): ProfileBlock[] {
  return layout.blocks.filter((block) => block.pinnedAllTabs);
}

/** Blocks that belong to a specific tab (not pinned). */
export function blocksForTab(
  layout: ProfileLayout,
  tabId: string,
): ProfileBlock[] {
  return layout.blocks.filter(
    (block) => !block.pinnedAllTabs && block.tabId === tabId,
  );
}

/** Map profile blocks to react-grid-layout items. */
export function blocksToRglLayout(blocks: ProfileBlock[]): GridLayoutItem[] {
  return blocks.map((block) => ({
    i: block.id,
    x: block.gridX,
    y: block.gridY,
    w: block.gridW,
    h: block.gridH,
  }));
}

/** Map react-grid-layout items back to the position-persistence payload shape. */
export function rglLayoutToPositions(
  layout: readonly GridLayoutItem[],
): BlockPosition[] {
  return layout.map((item) => ({
    id: item.i,
    gridX: item.x,
    gridY: item.y,
    gridW: item.w,
    gridH: item.h,
  }));
}

/**
 * Pack a set of blocks upward so there are no vertical holes, mirroring exactly
 * what react-grid-layout does internally (`synchronizeLayoutWithChildren`:
 * `correctBounds` first, so nothing hangs off the right edge, then a vertical
 * `compact`). Blocks keep their relative row/column order; each one simply
 * floats up until it rests on the top of the grid or on the block above it.
 *
 * IMPORTANT — callers must pass ONE ZONE at a time (the pinned blocks, or a
 * single tab's blocks). Every zone is rendered as its own independent grid, so
 * y-coordinates are per-zone; compacting two zones together would interleave
 * them and produce rows that no grid ever renders.
 *
 * This is what removes holes left behind by a hidden block on the PUBLIC
 * profile: `isVisible` filtering happens after coordinates are assigned, so
 * hiding a block that occupied rows 0-3 leaves a four-row gap that no amount of
 * editor-side compaction can fix — the editor still sees the hidden block.
 *
 * Returns new block objects (the input is never mutated). Order is preserved,
 * so the result can be index-aligned with the input.
 */
export function compactBlocks(
  blocks: ProfileBlock[],
  cols: number,
): ProfileBlock[] {
  if (blocks.length === 0) {
    return [];
  }

  // `blocksToRglLayout` already returns fresh objects, so letting the
  // (documented-as-mutating) `correctBounds` write into them is safe.
  const bounded = correctBounds(blocksToRglLayout(blocks), { cols });
  const compacted = verticalCompactor.compact(bounded, cols);

  return blocks.map((block, index) => {
    const item = compacted[index];
    if (!item) {
      return block;
    }
    return {
      ...block,
      gridX: item.x,
      gridY: item.y,
      gridW: item.w,
      gridH: item.h,
    };
  });
}

/** Apply compacted react-grid-layout geometry back onto blocks, matched by id. */
function applyGeometry(
  blocks: ProfileBlock[],
  layout: readonly GridLayoutItem[],
): ProfileBlock[] {
  return blocks.map((block) => {
    const item = layout.find((entry) => entry.i === block.id);
    if (!item) {
      return block;
    }
    return {
      ...block,
      gridX: item.x,
      gridY: item.y,
      gridW: item.w,
      gridH: item.h,
    };
  });
}

const clampInt = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/** Minimum block width in columns — mobile only has 4, so allow narrower there. */
export const minBlockWidth = (cols: number) => (cols <= 4 ? 1 : 2);

/** Minimum block height in rows, mirroring `EditorGrid`'s `minH`. */
export const MIN_BLOCK_HEIGHT = 2;

/**
 * One drop attempt: react-grid-layout's own drag maths, run on a throwaway copy
 * (`moveElement` mutates the layout it is handed).
 */
function attemptMove(
  items: readonly GridLayoutItem[],
  blockId: string,
  x: number,
  y: number,
  cols: number,
): readonly GridLayoutItem[] {
  const copy = items.map((item) => ({ ...item }));
  const target = copy.find((item) => item.i === blockId);
  if (!target) {
    return copy;
  }
  const moved = moveElement(
    copy,
    target,
    x,
    y,
    true,
    false,
    verticalCompactor.type,
    cols,
    false,
  );
  return verticalCompactor.compact(moved, cols);
}

/**
 * Move one block by a grid-cell delta, pushing neighbours out of the way and
 * repacking — the same `moveElement` + vertical compaction react-grid-layout
 * runs for a mouse drag, so a keyboard nudge and a drag produce identical
 * geometry.
 *
 * This exists because the editor was mouse-only: react-grid-layout has no
 * keyboard equivalent for drag or resize, so a keyboard user could not arrange
 * a layout at all. Arrow-key nudging is not a complete a11y story, but it is
 * the part that makes the editor operable.
 *
 * VERTICALLY, A ROW IS NOT A POSITION. The grid is vertically compacted, so
 * every block already rests on the one above it: dropping it one row higher
 * changes nothing, because the compactor floats it straight back down. A block
 * only moves when it crosses a whole neighbour, and neighbours are six rows
 * tall while the keyboard sends one row per press — which is why ArrowUp and
 * ArrowDown used to be permanent no-ops. So `dy` is read as a DIRECTION with a
 * minimum distance: the block is dropped at `y + dy` and, if the compacted
 * result leaves it on the cell it started from, one row further, until THE
 * BLOCK ITSELF lands somewhere new or the grid runs out. In practice that is
 * "swap with the neighbour on that side", for a neighbour of any height.
 *
 * Returns the input array unchanged when the nudge has nowhere to go, so the
 * caller can skip persisting a byte-identical layout.
 *
 * Callers must pass ONE ZONE at a time — see `compactBlocks`.
 */
export function moveBlockBy(
  blocks: ProfileBlock[],
  blockId: string,
  dx: number,
  dy: number,
  cols: number,
): ProfileBlock[] {
  const items = blocksToRglLayout(blocks);
  const target = items.find((item) => item.i === blockId);
  if (!target) {
    return blocks;
  }

  const x = clampInt(target.x + dx, 0, cols - target.w);
  const firstY = Math.max(0, target.y + dy);
  if (x === target.x && firstY === target.y) {
    return blocks;
  }

  const step = Math.sign(dy);
  // Down stops one row below the lowest block in the zone: past that there is
  // nothing left to cross. Up stops at the top of the grid.
  const lastY =
    step > 0
      ? items.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0)
      : 0;

  const candidates =
    step === 0
      ? [firstY]
      : Array.from(
          { length: Math.max(0, (lastY - firstY) * step + 1) },
          (_unused, index) => firstY + index * step,
        );

  for (const y of candidates) {
    const attempt = attemptMove(items, blockId, x, y, cols);
    const landed = attempt.find((item) => item.i === blockId);
    // The candidate only counts when THE BLOCK THE USER IS NUDGING ends up on a
    // different cell. Accepting "anything in the layout changed" lets a row a
    // neighbour got shoved out of pass as a successful nudge: the focused block
    // stays put, a bystander is flung to the bottom, and that scrambled layout
    // is persisted. Keep walking instead — the row where the target really does
    // cross its neighbour is further along the same direction.
    if (landed && (landed.x !== target.x || landed.y !== target.y)) {
      return applyGeometry(blocks, attempt);
    }
  }
  return blocks;
}

/**
 * Resize one block by a grid-cell delta, clamped to the same minimums the
 * mouse resize enforces (`minW` / `minH` in `EditorGrid`) and to the grid width.
 */
export function resizeBlockBy(
  blocks: ProfileBlock[],
  blockId: string,
  dw: number,
  dh: number,
  cols: number,
): ProfileBlock[] {
  const items = blocksToRglLayout(blocks);
  const target = items.find((item) => item.i === blockId);
  if (!target) {
    return blocks;
  }

  const w = clampInt(target.w + dw, minBlockWidth(cols), cols - target.x);
  const h = Math.max(MIN_BLOCK_HEIGHT, target.h + dh);
  if (w === target.w && h === target.h) {
    return blocks;
  }

  const resized = items.map((item) =>
    item.i === blockId ? { ...item, w, h } : { ...item },
  );
  const bounded = correctBounds(resized, { cols });
  return applyGeometry(blocks, verticalCompactor.compact(bounded, cols));
}

/**
 * Choose where to drop a newly-added custom block: full available width at the
 * bottom of the existing stack, so it never overlaps current content.
 */
export function computeNextPlacement(
  existing: ProfileBlock[],
  viewport: ProfileViewport,
): { gridX: number; gridY: number; gridW: number; gridH: number } {
  const cols = GRID_COLUMNS[viewport];
  const gridW = viewport === "pc" ? Math.min(6, cols) : cols;
  const gridY = existing.reduce(
    (bottom, block) => Math.max(bottom, block.gridY + block.gridH),
    0,
  );

  return { gridX: 0, gridY, gridW, gridH: DEFAULT_CUSTOM_BLOCK_HEIGHT };
}
