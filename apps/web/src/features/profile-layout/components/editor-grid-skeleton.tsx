import type { ProfileViewport } from "@repo/schemas";
import { LoadingLabel, Skeleton } from "../../../shared-components/skeleton";
import { GRID_GAP, GRID_ROW_HEIGHT } from "../grid-utils";
import { CanvasFrame } from "./canvas-frame";

/** A block placeholder, in grid units — same shape as `blocksToRglLayout`. */
export type SkeletonSpan = { w: number; h: number };

type EditorGridSkeletonProps = Readonly<{
  cols: number;
  /** Must match `EditorGrid`'s canvas clamp, or the zone jumps width on mount. */
  viewport?: ProfileViewport;
  /** Must match `EditorGrid`'s `rowHeight` for the boxes to line up. */
  rowHeight?: number;
  /** Placeholder blocks, in grid units. */
  spans: SkeletonSpan[];
  label: string;
}>;

/**
 * Stand-in for `EditorGrid` while the layout query is in flight.
 *
 * react-grid-layout lays an item of height `h` out as `h * rowHeight +
 * (h - 1) * margin`, which is exactly what a CSS grid with `rowHeight` rows and
 * a `margin`-sized gap produces — so these placeholders occupy the same boxes,
 * and the zone does not resize when the real grid mounts.
 *
 * What it cannot mirror is WHICH blocks the user has: that is the payload being
 * fetched. Callers pass the default arrangement for their zone.
 */
export function EditorGridSkeleton({
  cols,
  viewport = "pc",
  rowHeight = GRID_ROW_HEIGHT,
  spans,
  label,
}: EditorGridSkeletonProps) {
  return (
    // Same frame as the real grid, so the zone neither jumps width nor loses
    // its sideways scroll when the layout arrives.
    <CanvasFrame viewport={viewport}>
      <LoadingLabel>{label}</LoadingLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridAutoRows: `${rowHeight}px`,
          gap: `${GRID_GAP}px`,
        }}
      >
        {spans.map((span, index) => (
          <Skeleton
            key={index}
            className="h-full w-full rounded-2xl border border-zinc-200 dark:border-zinc-700"
            style={{
              gridColumn: `span ${Math.min(span.w, cols)}`,
              gridRow: `span ${span.h}`,
            }}
          />
        ))}
      </div>
    </CanvasFrame>
  );
}
