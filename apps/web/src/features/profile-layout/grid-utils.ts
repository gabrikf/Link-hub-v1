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

/** react-grid-layout item plus the extra flags we push onto each grid child. */
export type GridLayoutItem = LayoutItem;

/** Default height (in grid rows) for a freshly-added custom block. */
export const DEFAULT_CUSTOM_BLOCK_HEIGHT = 4;

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
