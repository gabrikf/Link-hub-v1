import type { CSSProperties, HTMLAttributes } from "react";
import { SURFACE } from "./surface";

/**
 * Loading placeholders.
 *
 * Built on the house `anim-sheen` utility (index.css) rather than a new
 * dependency — it is already how `image-input.tsx` shims a loading image, and
 * it is covered by the global `prefers-reduced-motion` guard.
 *
 * Rule of thumb for callers: a skeleton should occupy the same box as the
 * content it stands in for. Same card count, same heights, same gaps — the
 * point is that nothing shifts when the data lands.
 */

export type SkeletonShape = "block" | "text" | "circle";

const shapeClasses: Record<SkeletonShape, string> = {
  block: "rounded-xl",
  text: "h-3 rounded-full",
  circle: "rounded-full",
};

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * @deprecated Import `SURFACE` from `./surface` instead. Kept as an alias so
 * the second definition of the card surface cannot drift from the first.
 */
export const SURFACE_CLASS = SURFACE;

type SkeletonProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  shape?: SkeletonShape;
  /** Convenience for `style.width` — accepts any CSS length. */
  width?: string | number;
  /** Convenience for `style.height` — accepts any CSS length. */
  height?: string | number;
};

export function Skeleton({
  shape = "block",
  width,
  height,
  className,
  style,
  ...rest
}: SkeletonProps) {
  const sizeStyle: CSSProperties = {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...style,
  };

  return (
    <div
      aria-hidden="true"
      className={cx(
        "anim-sheen bg-zinc-200/80 dark:bg-zinc-800",
        shapeClasses[shape],
        className,
      )}
      style={sizeStyle}
      {...rest}
    />
  );
}

type SkeletonTextProps = {
  /** Number of lines to render. The last one is shortened, like real text. */
  lines?: number;
  className?: string;
};

/** A paragraph-shaped stack of text bars. */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          shape="text"
          width={index === lines - 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  );
}

type SkeletonChipsProps = {
  count?: number;
  className?: string;
};

/** A row of pill-shaped placeholders, for tag/skill chip rows. */
export function SkeletonChips({ count = 4, className }: SkeletonChipsProps) {
  const widths = [72, 96, 60, 84, 110, 68];

  return (
    <div className={cx("flex flex-wrap gap-2", className)}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton
          key={index}
          shape="circle"
          height={24}
          width={widths[index % widths.length]}
        />
      ))}
    </div>
  );
}

type LoadingLabelProps = {
  children: string;
};

/**
 * Screen-reader announcement to pair with a visual skeleton.
 *
 * Skeletons are `aria-hidden`, so without this a screen reader hears nothing
 * while a region loads. Render one per loading region.
 */
export function LoadingLabel({ children }: LoadingLabelProps) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {children}
    </span>
  );
}
