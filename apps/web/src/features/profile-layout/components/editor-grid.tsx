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
 * ROOT-CAUSE FIX for "blocks can't be dragged or resized".
 *
 * react-grid-layout v2 bundles react-draggable, whose internal `log()` helper
 * executes `if (process.env.DRAGGABLE_DEBUG) …` at the START of every drag and
 * resize gesture (DraggableCore.handleDragStart). Vite does not define `process`
 * in the browser, so that line throws `ReferenceError: process is not defined`,
 * which aborts the gesture before it can move anything — the block silently
 * snaps back and nothing happens. It affects BOTH drag and resize because the
 * resize handles use react-draggable too.
 *
 * The proper place to fix this would be Vite's `define`/`optimizeDeps`, but that
 * config is owned by a parallel agent. A minimal `process` shim installed before
 * the grid mounts makes `process.env.DRAGGABLE_DEBUG` evaluate to `undefined`
 * instead of throwing, in both dev and production builds.
 */
/**
 * Install the `process` shim if the runtime doesn't have one (browsers don't).
 * Exported so a unit test can guard that this stays put — the drag/resize bug it
 * fixes has silently regressed three times. Idempotent.
 */
export function ensureProcessShim(): void {
  const globalScope = globalThis as unknown as {
    process?: { env: Record<string, string | undefined> };
  };
  if (typeof globalScope.process === "undefined") {
    globalScope.process = { env: {} };
  }
}

ensureProcessShim();

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
 * react-resizable handles discoverable AND grabbable: violet grips with a real
 * hit area that stay visible so resize is obvious. Scoped under
 * `.editor-grid-zone` so it never leaks to any other grid. (index.css is owned
 * by a parallel agent.)
 *
 * The default `react-grid-layout/css/styles.css` keeps handles at `opacity: 0`
 * until the item is hovered, and the tiny 20px transparent square is hard to
 * hit. We keep the handles permanently visible, enlarge the grab area, give
 * them a soft violet chip so users can see where to grab, and bump the z-index
 * above the card body so the pointer always lands on the handle (not the card,
 * which would otherwise start a drag).
 */
const EDITOR_GRID_HANDLE_CSS = `
.editor-grid-zone .react-grid-item > .react-resizable-handle {
  opacity: 1;
  width: 26px;
  height: 26px;
  z-index: 4;
  background: transparent;
  transform: none;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle::after {
  content: "";
  position: absolute;
  border-radius: 3px;
  background: rgba(139, 92, 246, 0.85);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.65);
}
/* Corner grip: a small violet square with a diagonal notch feel. */
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-se::after {
  right: 4px;
  bottom: 4px;
  width: 10px;
  height: 10px;
  border: none;
}
/* East (width) grip: a vertical pill on the right edge. */
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-e {
  top: 50%;
  margin-top: -13px;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-s {
  left: 50%;
  margin-left: -13px;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-e::after {
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 22px;
}
/* South (height) grip: a horizontal pill on the bottom edge. */
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-s::after {
  bottom: 3px;
  left: 50%;
  transform: translateX(-50%);
  width: 22px;
  height: 6px;
}
.editor-grid-zone .react-grid-item.resizing > .react-resizable-handle::after {
  background: rgb(124, 58, 237);
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
 * replaced the WidthProvider HOC with the useContainerWidth hook).
 *
 * DRAG: the WHOLE card is the drag surface (no `handle` restriction). Grabbing
 * a tiny icon grip was the reported blocker — users tried to move the card body
 * and nothing happened. Instead we let the card body drag and use `cancel` to
 * exclude the interactive controls: react-grid-layout always appends
 * `.react-resizable-handle` to the cancel selector, and we add `.block-no-drag`
 * (wrapped around the switches/buttons/links in `grid-block-card.tsx`) so
 * clicking a control never starts a drag. Blocks are freely placeable and
 * resizable (see the compactor and resize config above).
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
          dragConfig={{ cancel: ".block-no-drag" }}
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
