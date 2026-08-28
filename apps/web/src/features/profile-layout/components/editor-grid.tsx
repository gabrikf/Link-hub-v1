import type { ProfileBlock, ProfileViewport } from "@repo/schemas";
import { useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  GridLayout,
  useContainerWidth,
  verticalCompactor,
  type Layout,
} from "react-grid-layout";
import { SURFACE_EMPTY } from "../../../shared-components/surface";
import {
  blocksToRglLayout,
  GRID_GAP,
  GRID_ROW_HEIGHT,
  PROFILE_CANVAS_WIDTH,
  type GridLayoutItem,
} from "../grid-utils";

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
 * Blocks always pack toward the TOP of the grid — no vertical holes, ever.
 * Moving one block pushes its neighbours out of the way and the whole zone
 * re-packs upward, exactly like the public profile renders it.
 *
 * This replaces the previous `getCompactor(null, false, false)`, which is the
 * IDENTITY compactor (`type: null` = "never compact"). With it, a block dropped
 * ten rows below the stack simply stayed there, and deleting or shrinking a
 * block left a permanent gap that the user had to clean up by hand. Vertical
 * compaction is also what migrates existing layouts that already contain holes:
 * the grid compacts them on mount and the guarded `onLayoutChange` below
 * persists the corrected geometry.
 *
 * `allowOverlap: false` + `preventCollision: false` (both baked into
 * `verticalCompactor`) keep the good part of the old behaviour: dragging onto a
 * neighbour PUSHES it aside instead of snapping back.
 *
 * Kept at module scope because GridLayout lists `compactor` in an effect
 * dependency array — a fresh object each render would re-run the layout sync
 * effect on every render.
 */
const VERTICAL_COMPACTOR = verticalCompactor;

/**
 * Resize from all eight edges and corners. Corners (`nw`/`ne`/`se`/`sw`) change
 * both axes at once; `n`/`s` change height; `e`/`w` change width — and the
 * north/west handles grow the block upward/leftward rather than forcing the
 * user to drag the opposite edge and then reposition the whole card.
 */
const RESIZE_CONFIG = {
  enabled: true,
  handles: ["n", "ne", "e", "se", "s", "sw", "w", "nw"],
} as const;

/** Module scope for the same effect-dependency reason as `VERTICAL_COMPACTOR`. */
const DRAG_CONFIG = { cancel: ".block-no-drag" } as const;

/**
 * Scoped styling that makes all eight react-resizable handles discoverable AND
 * actually grabbable. Scoped under `.editor-grid-zone` so it never leaks to any
 * other grid. (index.css is owned by a parallel agent.)
 *
 * Three things the default `react-grid-layout/css/styles.css` gets wrong for
 * this editor:
 *
 * 1. Z-INDEX. The card's control rows (`grid-block-card.tsx`) are
 *    `.block-no-drag relative z-10`, so at the old `z-index: 4` they painted
 *    OVER the handles — the south handle sits directly behind the
 *    Visible/All-tabs switch row and was literally unreachable. `z-index: 20`
 *    puts every handle back on top.
 * 2. TRANSFORMS. The base stylesheet rotates six of the eight handles
 *    (`rotate(45deg)`, `rotate(135deg)`, …) to reuse one corner chevron glyph.
 *    We draw our own `::after` grips, so every rotation has to go — otherwise
 *    the grip is skewed and, worse, the rotated box no longer covers the edge
 *    it belongs to. Hence `transform: none` on all axes.
 * 3. SIZING. The base rules centre the N/S and E/W handles with a hard-coded
 *    `-10px` margin that assumes the default 20px square. Since we resize the
 *    hit boxes we must restate the centring margin for each axis, or the edge
 *    handles drift off-centre.
 *
 * Hit boxes are deliberately kept within the card's 12px padding ring (`p-3`)
 * so they never cover the buttons and switches inside the card.
 */
const EDITOR_GRID_HANDLE_CSS = `
.editor-grid-zone {
  /* Grip fill + the halo that separates it from the card underneath. Declared
     as variables (and re-declared for dark mode just below) because the rule in
     index.css that used to darken these — \`.dark .react-grid-item >
     .react-resizable-handle::after\` — is DEAD: it colours a \`border\`, and the
     ::after rule here sets \`border: none\` and wins on source order, so the
     handles rendered identically in both themes. One rule, both themes. */
  --rgl-handle: rgba(139, 92, 246, 0.85);
  --rgl-handle-active: rgb(124, 58, 237);
  --rgl-handle-halo: rgba(255, 255, 255, 0.65);
}
.dark .editor-grid-zone {
  --rgl-handle: rgba(167, 139, 250, 0.95);
  --rgl-handle-active: rgb(196, 181, 253);
  --rgl-handle-halo: rgba(9, 9, 11, 0.7);
}

.editor-grid-zone .react-grid-item > .react-resizable-handle {
  opacity: 1;
  z-index: 20;
  background: transparent;
  transform: none;
  padding: 0;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle::after {
  content: "";
  position: absolute;
  border: none;
  border-radius: 3px;
  background: var(--rgl-handle);
  box-shadow: 0 0 0 2px var(--rgl-handle-halo);
}

/* ---- Corners: 16x16 hit box with a 9x9 grip tucked into the corner. ---- */
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-nw,
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-ne,
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-se,
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-sw {
  width: 16px;
  height: 16px;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-nw::after,
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-ne::after,
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-se::after,
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-sw::after {
  width: 9px;
  height: 9px;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-nw::after {
  top: 3px;
  left: 3px;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-ne::after {
  top: 3px;
  right: 3px;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-se::after {
  bottom: 3px;
  right: 3px;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-sw::after {
  bottom: 3px;
  left: 3px;
}

/* ---- North / South: wide, shallow hit box centred on the edge. ---- */
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-n,
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-s {
  width: 48px;
  height: 14px;
  left: 50%;
  margin-left: -24px;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-n::after,
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-s::after {
  left: 50%;
  margin-left: -11px;
  width: 22px;
  height: 5px;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-n::after {
  top: 3px;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-s::after {
  bottom: 3px;
}

/* ---- East / West: tall, narrow hit box centred on the edge. ---- */
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-e,
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-w {
  width: 14px;
  height: 48px;
  top: 50%;
  margin-top: -24px;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-e::after,
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-w::after {
  top: 50%;
  margin-top: -11px;
  width: 5px;
  height: 22px;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-e::after {
  right: 3px;
}
.editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-w::after {
  left: 3px;
}

.editor-grid-zone .react-grid-item.resizing > .react-resizable-handle::after {
  background: var(--rgl-handle-active);
}

/* Neighbours reflow on every drag now that the grid compacts, so shorten the
   base 200ms slide — at 200ms the push-and-repack reads as laggy. */
.editor-grid-zone .react-grid-item {
  transition-duration: 120ms;
}

/* ---- Touch: grow every hit box past the WCAG 2.5.8 minimum. ----
   The desktop sizes above are deliberately small so they fit inside the card's
   12px padding ring and stay precise under a mouse, but on a touch screen the
   16x16 corners fail 2.5.8's 24x24 target size outright, and the 48x14 / 14x48
   edges fail the 44px guideline on their short axis. Scoped to a coarse pointer
   so mouse precision is untouched; the grips themselves stay the same size, only
   the hit boxes grow. */
@media (pointer: coarse) {
  .editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-nw,
  .editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-ne,
  .editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-se,
  .editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-sw {
    width: 28px;
    height: 28px;
  }
  .editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-n,
  .editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-s {
    width: 56px;
    height: 28px;
    margin-left: -28px;
  }
  .editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-e,
  .editor-grid-zone .react-grid-item > .react-resizable-handle.react-resizable-handle-w {
    width: 28px;
    height: 56px;
    margin-top: -28px;
  }
}
`;

type EditorGridProps = {
  blocks: ProfileBlock[];
  cols: number;
  /** Which canvas width to clamp to — see `PROFILE_CANVAS_WIDTH`. */
  viewport: ProfileViewport;
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
 * clicking a control never starts a drag. Blocks pack to the top and resize
 * from all eight sides (see the compactor and resize config above).
 */
export function EditorGrid({
  blocks,
  cols,
  viewport,
  rowHeight = GRID_ROW_HEIGHT,
  onChange,
  renderCard,
  emptyMessage,
}: EditorGridProps) {
  const { t } = useTranslation();
  const resolvedEmptyMessage = emptyMessage ?? t("layout.noBlocksHere");

  // `mounted` gates the grid until the container width has actually been
  // measured, avoiding the first-paint overflow flash from the 1280px default.
  const { width, containerRef, mounted } = useContainerWidth();

  const persist = useCallback(
    (layout: Layout) => {
      onChange(layout as GridLayoutItem[]);
    },
    [onChange],
  );

  // Sensible minimums so a block can't be dragged/resized down to nothing.
  // Mobile only has 4 columns, so allow a narrower minimum there.
  //
  // Memoized for the same reason `compactor` is hoisted to module scope above:
  // GridLayout lists `layout` in an effect dependency array and `deepEqual`-walks
  // it, so a fresh array on every render re-runs that effect (and the walk) for
  // every mounted grid — and there are always two.
  const items: GridLayoutItem[] = useMemo(() => {
    const minW = cols <= 4 ? 1 : 2;
    return blocksToRglLayout(blocks).map((item) => ({
      ...item,
      minW,
      minH: 2,
    }));
  }, [blocks, cols]);

  const gridConfig = useMemo(
    () => ({ cols, rowHeight, margin: [GRID_GAP, GRID_GAP] as [number, number] }),
    [cols, rowHeight],
  );

  /**
   * Persist only when the grid actually hands back different GEOMETRY.
   *
   * The guard is not optional. GridLayout's mount effect calls
   * `onLayoutChange` unconditionally whenever its internal layout isn't
   * `deepEqual` to the `layout` prop — and it never is, because the internal
   * items are 14-key `cloneLayoutItem` objects while ours carry 7 keys. Without
   * this check every mount, tab switch and pc/mobile switch would fire a PATCH
   * to the server with geometry nobody changed.
   *
   * When the geometry HAS changed the call is exactly what we want: it is how a
   * legacy layout containing vertical holes gets compacted and saved the first
   * time the user opens the editor.
   *
   * Termination: persisting optimistically rewrites the cached blocks to this
   * very geometry, so the next render feeds an already-compacted `layout` prop
   * back in, the library's own `deepEqual` on the internal layout is then true
   * and no further `onLayoutChange` fires. One round, then quiet.
   */
  const handleLayoutChange = useCallback(
    (layout: Layout) => {
      const changed = layout.some((item) => {
        const current = items.find((entry) => entry.i === item.i);
        return (
          current !== undefined &&
          (current.x !== item.x ||
            current.y !== item.y ||
            current.w !== item.w ||
            current.h !== item.h)
        );
      });

      if (changed) {
        persist(layout);
      }
    },
    [items, persist],
  );

  return (
    // `maxWidth` is the whole point of the shared `PROFILE_CANVAS_WIDTH`: the
    // measured container width IS the grid width, so clamping it here is what
    // makes an editor column the same number of pixels as a published column.
    // Before this the pc canvas measured ~1169px against the page's 670px and
    // the mobile canvas measured the same ~1169px against the page's 293px.
    <div
      ref={containerRef}
      className="editor-grid-zone mx-auto w-full"
      style={{ maxWidth: PROFILE_CANVAS_WIDTH[viewport] }}
    >
      <style>{EDITOR_GRID_HANDLE_CSS}</style>
      {blocks.length === 0 ? (
        <div
          className={`px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400 ${SURFACE_EMPTY}`}
        >
          {resolvedEmptyMessage}
        </div>
      ) : mounted ? (
        <GridLayout
          width={width}
          layout={items}
          gridConfig={gridConfig}
          dragConfig={DRAG_CONFIG}
          resizeConfig={RESIZE_CONFIG}
          compactor={VERTICAL_COMPACTOR}
          onDragStop={persist}
          onResizeStop={persist}
          onLayoutChange={handleLayoutChange}
        >
          {blocks.map((block) => (
            <div key={block.id}>{renderCard(block)}</div>
          ))}
        </GridLayout>
      ) : null}
    </div>
  );
}
