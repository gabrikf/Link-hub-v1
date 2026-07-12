import type { ProfileBlock } from "@repo/schemas";
import type { ReactNode } from "react";
import {
  getCompactor,
  GridLayout,
  useContainerWidth,
  type Layout,
} from "react-grid-layout";
import { blocksToRglLayout, type GridLayoutItem } from "../grid-utils";

/**
 * Free-form placement compactor: `type: null` (no compaction, so blocks stay
 * exactly where they are dropped), `allowOverlap: false` + `preventCollision:
 * false` (blocks never overlap, but dragging onto a neighbour PUSHES it aside
 * instead of snapping back).
 *
 * `preventCollision: true` used to force the user to resize both blocks narrow
 * before either could gain a neighbour, and dropping onto an occupied slot
 * snapped back (felt blocked). With `preventCollision: false` a drag displaces
 * neighbours, giving a responsive free-form rearrange while overlap stays
 * disallowed.
 */
const FREEFORM_COMPACTOR = getCompactor(null, false, false);

/**
 * Enable resizing with visible handles. `se` (corner) resizes both axes, `e`
 * narrows the width so a full-width block can make room for a neighbour, and
 * `s` adjusts height. The handles are styled below so resize is discoverable.
 */
const RESIZE_CONFIG = { enabled: true, handles: ["se", "e", "s"] } as const;

/**
 * Scoped styling to make the (otherwise near-invisible, black-on-dark) default
 * react-resizable handles discoverable: violet grips that fade in on hover and
 * stay solid while resizing. Scoped under `.editor-grid-zone` so it never
 * leaks to any other grid. (index.css is owned by a parallel agent.)
 */
const EDITOR_GRID_HANDLE_CSS = `
.editor-grid-zone .react-grid-item > .react-resizable-handle {
  opacity: 0.5;
  width: 22px;
  height: 22px;
}
.editor-grid-zone .react-grid-item:hover > .react-resizable-handle,
.editor-grid-zone .react-grid-item.resizing > .react-resizable-handle {
  opacity: 1;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle::after {
  right: 4px;
  bottom: 4px;
  width: 7px;
  height: 7px;
  border-right: 2.5px solid rgb(139 92 246);
  border-bottom: 2.5px solid rgb(139 92 246);
}
`;

type EditorGridProps = {
  blocks: ProfileBlock[];
  cols: number;
  rowHeight?: number;
  onChange: (layout: GridLayoutItem[]) => void;
  renderCard: (block: ProfileBlock) => ReactNode;
  emptyMessage?: string;
};

/**
 * A single react-grid-layout grid that measures its own container width (v2
 * replaced the WidthProvider HOC with the useContainerWidth hook). Drag is
 * limited to the `.block-drag-handle` element so the card's controls stay
 * clickable; blocks are freely placeable and resizable (see the compactor and
 * resize config above).
 */
export function EditorGrid({
  blocks,
  cols,
  rowHeight = 40,
  onChange,
  renderCard,
  emptyMessage = "No blocks here yet.",
}: EditorGridProps) {
  // `mounted` gates the grid until the container width has actually been
  // measured, avoiding the first-paint overflow flash from the 1280px default.
  const { width, containerRef, mounted } = useContainerWidth();

  const persist = (layout: Layout) => {
    onChange(layout as GridLayoutItem[]);
  };

  // Sensible minimums so a block can't be dragged/resized down to nothing.
  // Mobile only has 4 columns, so allow a narrower minimum there.
  const minW = cols <= 4 ? 1 : 2;
  const items: GridLayoutItem[] = blocksToRglLayout(blocks).map((item) => ({
    ...item,
    minW,
    minH: 2,
  }));

  return (
    <div ref={containerRef} className="editor-grid-zone w-full">
      <style>{EDITOR_GRID_HANDLE_CSS}</style>
      {blocks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
          {emptyMessage}
        </div>
      ) : mounted ? (
        <GridLayout
          width={width}
          layout={items}
          gridConfig={{ cols, rowHeight, margin: [12, 12] }}
          dragConfig={{ handle: ".block-drag-handle" }}
          resizeConfig={RESIZE_CONFIG}
          compactor={FREEFORM_COMPACTOR}
          onDragStop={persist}
          onResizeStop={persist}
        >
          {blocks.map((block) => (
            <div key={block.id}>{renderCard(block)}</div>
          ))}
        </GridLayout>
      ) : null}
    </div>
  );
}
