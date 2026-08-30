import { CENTERED_IMAGE_PLACEMENT, type ImagePlacement } from "@repo/schemas";
import type { CSSProperties } from "react";

/**
 * The geometry behind "drag the banner until my face shows".
 *
 * An `ImagePlacement` is a FOCAL POINT (see the schema): the image's `x%,y%`
 * point is pinned to the frame's `x%,y%` point, and `scale` magnifies about
 * that same point. Expressed in CSS that is exactly:
 *
 *     object-fit: cover;
 *     object-position: X% Y%;
 *     transform: scale(S);
 *     transform-origin: X% Y%;
 *
 * `object-position` and `transform-origin` MUST carry the same pair. Both are
 * percentages of the element box, and `object-fit: cover` aligns the image's
 * `X%,Y%` with the box's `X%,Y%` — so putting the transform origin there too is
 * what makes zooming happen around the point the user chose instead of around
 * the middle of the frame.
 *
 * Everything below is pure: the editor, the cover and the background layer all
 * go through these functions, which is what makes the drag surface a real
 * preview rather than an approximation of one.
 */

export type Size = { width: number; height: number };

/** The image's on-screen size inside `frame` under `object-fit: cover`, scaled. */
export function coveredSize(
  frame: Size,
  natural: Size,
  scale: number,
): Size | null {
  if (
    frame.width <= 0 ||
    frame.height <= 0 ||
    natural.width <= 0 ||
    natural.height <= 0
  ) {
    return null;
  }

  const cover = Math.max(
    frame.width / natural.width,
    frame.height / natural.height,
  );

  return {
    width: natural.width * cover * scale,
    height: natural.height * cover * scale,
  };
}

/**
 * How many pixels of the image fall outside the frame on each axis — i.e. how
 * far it can travel before it stops revealing anything new.
 *
 * Zero on an axis is a real and common answer: a 3:1 photo in a 3:1 frame at
 * scale 1 has nothing to reveal horizontally, and dragging sideways must then
 * do NOTHING rather than divide by zero and produce `Infinity`.
 */
export function placementOverflow(
  frame: Size,
  natural: Size,
  scale: number,
): Size {
  const covered = coveredSize(frame, natural, scale);
  if (!covered) {
    return { width: 0, height: 0 };
  }

  return {
    width: Math.max(0, covered.width - frame.width),
    height: Math.max(0, covered.height - frame.height),
  };
}

const MIN_SCALE = 1;
const MAX_SCALE = 3;

/** Two decimals is finer than a pixel on any frame we render, and stays legible in the row. */
const round = (value: number) => Math.round(value * 100) / 100;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Force a placement back inside the bounds the schema promises.
 *
 * Also the guard against `NaN`: a drag that starts before the image has
 * reported its natural size would otherwise write `NaN` into the form and then
 * into the API, where zod rejects it with a message no user could act on.
 */
export function clampPlacement(placement: ImagePlacement): ImagePlacement {
  const x = Number.isFinite(placement.x) ? placement.x : 50;
  const y = Number.isFinite(placement.y) ? placement.y : 50;
  const scale = Number.isFinite(placement.scale) ? placement.scale : MIN_SCALE;

  return {
    x: round(clamp(x, 0, 100)),
    y: round(clamp(y, 0, 100)),
    scale: round(clamp(scale, MIN_SCALE, MAX_SCALE)),
  };
}

export const PLACEMENT_SCALE_BOUNDS = {
  min: MIN_SCALE,
  max: MAX_SCALE,
  step: 0.05,
} as const;

/**
 * Move the image by `dx`/`dy` SCREEN pixels and report the placement that
 * produces.
 *
 * The image's left edge sits at `-(x/100) * overflowX` inside the frame, so
 * moving the content right by `dx` means *lowering* `x` — hence the subtraction.
 * The pointer and the photograph therefore travel together, which is the only
 * behaviour that feels like dragging a photo rather than a scrollbar.
 */
export function panPlacement(
  placement: ImagePlacement,
  delta: { dx: number; dy: number },
  frame: Size,
  natural: Size,
): ImagePlacement {
  const overflow = placementOverflow(frame, natural, placement.scale);

  return clampPlacement({
    x:
      overflow.width > 0
        ? placement.x - (delta.dx / overflow.width) * 100
        : placement.x,
    y:
      overflow.height > 0
        ? placement.y - (delta.dy / overflow.height) * 100
        : placement.y,
    scale: placement.scale,
  });
}

/**
 * Whether dragging can reveal anything, from the two ASPECT RATIOS alone.
 *
 * Deliberately not `placementOverflow(measuredFrame, …) > 0`. The answer does
 * not depend on how big the frame is, only on its shape: `object-fit: cover`
 * scales the image until it covers, so the axis with slack is decided by which
 * aspect ratio is wider, and a zoom above 1 always creates slack on both. Since
 * the frame's shape is a PROP (the editor sets `aspect-ratio` from it), this
 * needs no DOM measurement at all — which keeps the render pure and the hint
 * correct on the very first paint, before anything has been laid out.
 *
 * The epsilon absorbs the float noise in `1600/900` vs `16/9`; a difference
 * that small is under a pixel of slack on any frame we draw.
 */
export function canPanImage(
  frameAspect: number,
  natural: Size,
  scale: number,
): boolean {
  if (scale > 1) {
    return true;
  }
  if (natural.width <= 0 || natural.height <= 0 || frameAspect <= 0) {
    return false;
  }
  return Math.abs(natural.width / natural.height - frameAspect) > 0.001;
}

/** A rectangle in 0..1 fractions of some box. */
export type FractionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Which part of the image a frame of aspect `frameAspect` actually shows, in
 * fractions of the image itself.
 *
 * This is `object-fit: cover` written out: the image is scaled until it covers,
 * so one axis is shown whole and the other is cropped, and the placement's
 * percentage slides the cropped axis proportionally.
 */
export function visibleImageRect(
  frameAspect: number,
  natural: Size,
  placement: ImagePlacement,
): FractionRect | null {
  if (natural.width <= 0 || natural.height <= 0 || frameAspect <= 0) {
    return null;
  }

  const imageAspect = natural.width / natural.height;
  const width = Math.min(1, frameAspect / imageAspect) / placement.scale;
  const height = Math.min(1, imageAspect / frameAspect) / placement.scale;

  return {
    left: (placement.x / 100) * (1 - width),
    top: (placement.y / 100) * (1 - height),
    width,
    height,
  };
}

/**
 * Where a DIFFERENT frame's crop falls inside the one being dragged in — the
 * "safe area" overlay, in fractions of the editor frame.
 *
 * WHY THIS IS NEEDED AT ALL: one banner is published into two frames of very
 * different shapes. The public cover is 176px tall across a 1120px card on a
 * desktop (6.36:1) and across a 374px card on a phone (2.13:1), and
 * `object-fit: cover` re-crops for each. Dragging inside a frame shaped like
 * ONE of them, and calling that the answer, reproduces the original bug one
 * step downstream: a face placed at the top of a 3:1 editor frame is cropped
 * clean out of the 6.36:1 desktop cover.
 *
 * So the editor drags in the TALLER shape (there is more of the photo to see,
 * and 470x74 is not a drag surface) and draws the narrower one over it. The
 * strip moves as the photo does, because both are derived from the same
 * placement.
 *
 * Returns `null` when the target frame shows everything the editor frame does —
 * there is no "safe area" to point at when nothing extra is cropped.
 */
export function safeAreaRect(
  editorAspect: number,
  targetAspect: number,
  natural: Size,
  placement: ImagePlacement,
): FractionRect | null {
  const editor = visibleImageRect(editorAspect, natural, placement);
  const target = visibleImageRect(targetAspect, natural, placement);
  if (!editor || !target || editor.width <= 0 || editor.height <= 0) {
    return null;
  }

  const rect = {
    left: (target.left - editor.left) / editor.width,
    top: (target.top - editor.top) / editor.height,
    width: target.width / editor.width,
    height: target.height / editor.height,
  };

  // Within a rounding error of "the whole frame" means the two crops agree, and
  // an overlay tracing the frame's own edge is noise.
  if (rect.width >= 0.999 && rect.height >= 0.999) {
    return null;
  }

  return {
    left: clamp(rect.left, 0, 1),
    top: clamp(rect.top, 0, 1),
    width: clamp(rect.width, 0, 1),
    height: clamp(rect.height, 0, 1),
  };
}

/**
 * The CSS that renders a placement. The single function every surface uses —
 * public cover, live preview, editor frame and dashboard thumbnail — so a
 * repositioned banner cannot look different in the editor and on the profile.
 */
export function placementStyle(
  placement: ImagePlacement | null | undefined,
): CSSProperties {
  const { x, y, scale } = placement ?? CENTERED_IMAGE_PLACEMENT;
  const position = `${x}% ${y}%`;

  return {
    objectPosition: position,
    transform: `scale(${scale})`,
    transformOrigin: position,
  };
}
