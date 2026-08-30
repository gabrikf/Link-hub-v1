import { CENTERED_IMAGE_PLACEMENT, type ImagePlacement } from "@repo/schemas";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiCheck, FiCrosshair, FiMove, FiZoomIn, FiZoomOut } from "react-icons/fi";
import {
  canPanImage,
  clampPlacement,
  panPlacement,
  PLACEMENT_SCALE_BOUNDS,
  safeAreaRect,
  type Size,
} from "../lib/image-placement";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { PlacedImage } from "./placed-image";
import { FOCUS_RING_FIELD, SURFACE_INSET } from "./surface";

type ImagePositionEditorProps = {
  /** The already-uploaded image. `null` keeps the dialog closed. */
  src: string | null;
  /**
   * Width / height of the frame to drag inside — a shape the image is actually
   * published at, and specifically the TALLER of the two when there are two
   * (see `safeAreaAspect`). Getting this right is the difference between
   * choosing a crop and guessing one: the banner used to be dragged in a 3:1
   * frame and published at 6.36:1 and 2.13:1, neither of which is 3:1.
   */
  aspect: number;
  /**
   * A SECOND shape the same image is published at, drawn over the frame as a
   * "safe area".
   *
   * One banner goes into two very different frames — 6.36:1 on a desktop
   * profile, 2.13:1 on a phone — and `object-fit: cover` re-crops for each. The
   * frame above is the taller of the two (there is more photo to see, and a
   * 74px-tall drag surface is not one); this marks the band the narrower one
   * keeps, so nobody centres a face in a strip that a desktop visitor never
   * sees. Omit it when the image really is published at one shape.
   */
  safeAreaAspect?: number;
  safeAreaLabel?: string;
  placement: ImagePlacement | null;
  onCancel: () => void;
  onSave: (placement: ImagePlacement) => void;
  title: string;
  description: string;
};

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/** Arrow-key nudge, in frame pixels. Shift multiplies it. */
const NUDGE_PX = 8;
const NUDGE_MULTIPLIER = 4;
const ZOOM_BUTTON_STEP = 0.25;

/**
 * "Drag the picture until the right part shows" — for the banner and for the
 * page background.
 *
 * WHY NOT {@link AvatarCropper}: that dialog rasterises a square crop and
 * uploads the result, which is right for an avatar (one shape, everywhere,
 * forever) and wrong here. The banner is painted into at least three frames of
 * different heights, all of them `object-fit: cover`, so a crop baked at one
 * aspect ratio is re-cropped by the next frame and the face slides back out of
 * view. This dialog stores a focal point instead and re-uploads nothing — see
 * `lib/image-placement.ts` for the geometry.
 *
 * The frame below is not a mock-up of the result: it is {@link PlacedImage},
 * the same component the public profile mounts, holding the same placement.
 *
 * Focus trap, Escape and focus restoration come from the house {@link Dialog}.
 */
export function ImagePositionEditor({
  src,
  ...props
}: ImagePositionEditorProps) {
  // Keyed remount so a different image starts from ITS stored placement rather
  // than from whatever the previous one was left at.
  return src ? <PositionEditorDialog key={src} src={src} {...props} /> : null;
}

function PositionEditorDialog({
  src,
  aspect,
  safeAreaAspect,
  safeAreaLabel,
  placement,
  onCancel,
  onSave,
  title,
  description,
}: ImagePositionEditorProps & { src: string }) {
  const { t } = useTranslation();
  const reactId = useId();
  const zoomId = `image-position-zoom-${reactId}`;
  const hintId = `image-position-hint-${reactId}`;

  const frameRef = useRef<HTMLDivElement>(null);
  /**
   * The pointer position and the placement AT THE MOMENT the drag started.
   * Deltas are measured from there rather than accumulated frame by frame:
   * accumulation drifts once the placement clamps at an edge, so the picture
   * would stop following the finger after the first over-drag.
   */
  const dragOrigin = useRef<{
    pointerX: number;
    pointerY: number;
    placement: ImagePlacement;
    frame: Size;
  } | null>(null);

  const [draft, setDraft] = useState<ImagePlacement>(
    clampPlacement(placement ?? CENTERED_IMAGE_PLACEMENT),
  );
  const [natural, setNatural] = useState<Size | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const frameSize = (): Size => {
    const rect = frameRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  };

  /**
   * Whether there is anything to reveal at all. A photo whose shape already
   * matches the frame has zero slack on both axes at 1x, so dragging is a
   * no-op — and a control that silently does nothing reads as broken. The hint
   * below says "zoom in first" instead.
   *
   * Answered from the two aspect ratios, NOT from a measurement: `frameRef`
   * must not be read during render (the ref holds a value React did not render
   * with), and the answer does not need the frame's size anyway — see
   * `canPanImage`.
   */
  const canPan = natural ? canPanImage(aspect, natural, draft.scale) : false;

  /**
   * The band the OTHER published shape keeps, recomputed on every drag frame
   * because it moves with the photograph.
   */
  const safeArea =
    natural && safeAreaAspect
      ? safeAreaRect(aspect, safeAreaAspect, natural, draft)
      : null;

  const move = (dx: number, dy: number, from: ImagePlacement, frame: Size) => {
    if (!natural) return;
    setDraft(panPlacement(from, { dx, dy }, frame, natural));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!natural || event.button !== 0) return;
    // Capture on the frame: the pointer WILL leave a 176px-tall strip during a
    // normal drag, and without capture the gesture dies the moment it does.
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      placement: draft,
      frame: frameSize(),
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin) return;
    event.preventDefault();
    move(
      event.clientX - origin.pointerX,
      event.clientY - origin.pointerY,
      origin.placement,
      origin.frame,
    );
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOrigin.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragOrigin.current = null;
    setIsDragging(false);
  };

  /**
   * The keyboard path to the same gesture. Not a nicety: a drag surface with no
   * key bindings is a control a keyboard user simply cannot operate, and the
   * zoom slider alone cannot choose WHICH part of the photo shows.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? NUDGE_PX * NUDGE_MULTIPLIER : NUDGE_PX;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = deltas[event.key];
    if (!delta) return;

    event.preventDefault();
    move(delta[0], delta[1], draft, frameSize());
  };

  const setScale = (next: number) =>
    setDraft((current) => clampPlacement({ ...current, scale: next }));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={title}
      description={description}
      // No `closeLabel`: the dialog's default is "Close <title>", which is what
      // keeps the corner X distinguishable from the Cancel button beside Apply.
      contentClassName="max-w-lg"
      buttons={
        <>
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            onClick={onCancel}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            fullWidth={false}
            onClick={() => onSave(draft)}
            disabled={!natural}
          >
            <FiCheck className="h-4 w-4" aria-hidden="true" />
            {t("image.applyPosition")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {/*
          `aspect-ratio` inline rather than a Tailwind class: the ratio is a
          prop (3 for the banner, 16/9 for the background) and the frame has to
          be the published shape, not a class picked at authoring time.
        */}
        <div
          ref={frameRef}
          role="group"
          tabIndex={0}
          aria-label={t("image.positionFrame")}
          aria-describedby={hintId}
          data-testid="image-position-frame"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={handleKeyDown}
          style={{ aspectRatio: String(aspect) }}
          className={cx(
            // `touch-none` stops the browser claiming the gesture as a scroll —
            // without it a drag on a phone scrolls the dialog and the photo
            // never moves.
            "relative w-full touch-none select-none overflow-hidden rounded-xl bg-zinc-900 dark:bg-zinc-950",
            FOCUS_RING_FIELD,
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
        >
          <PlacedImage
            src={src}
            placement={draft}
            data-testid="image-position-preview"
            onLoad={(event) =>
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
          />

          {/*
            The safe area: everything OUTSIDE this band is cropped away on the
            wider of the two published shapes. Drawn as a dimming of the two
            offcuts rather than as a bright outline, because the thing being
            judged is the photograph and a box drawn on top of it competes with
            what it is meant to help you see.
          */}
          {safeArea ? (
            <div
              aria-hidden="true"
              data-testid="image-position-safe-area"
              className="pointer-events-none absolute"
              style={{
                left: `${(safeArea.left * 100).toFixed(3)}%`,
                top: `${(safeArea.top * 100).toFixed(3)}%`,
                width: `${(safeArea.width * 100).toFixed(3)}%`,
                height: `${(safeArea.height * 100).toFixed(3)}%`,
                /*
                 * ONE element dims everything around itself: an enormous
                 * spread with no blur and no offset paints outside the border
                 * box only, and the frame's `overflow-hidden` cuts it back to
                 * the frame. The photo inside the band is left completely
                 * untouched, which four edge divs cannot promise (they meet at
                 * the corners and double up).
                 */
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
              }}
            />
          ) : null}

          {safeArea && safeAreaLabel ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
              style={{
                // Pinned to the top edge of the band, nudged inside it.
                top: `calc(${(safeArea.top * 100).toFixed(3)}% + 4px)`,
              }}
            >
              {safeAreaLabel}
            </span>
          ) : null}

          {/* Rule-of-thirds guides, only while dragging — a framing aid, and
              the only feedback that says "you are moving this" on a photo with
              no obvious landmarks. */}
          <div
            aria-hidden="true"
            className={cx(
              "pointer-events-none absolute inset-0 transition-opacity duration-150",
              isDragging ? "opacity-100" : "opacity-0",
            )}
          >
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
          </div>

          {/*
            BOTTOM edge, not the middle. Centred, this pill covered most of a
            337x112 frame on a phone — so before you began, you could not see
            the part of your own photo you were about to judge.
          */}
          <span
            aria-hidden="true"
            className={cx(
              "pointer-events-none absolute bottom-2 left-1/2 inline-flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1.5 truncate rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm transition-opacity duration-150",
              isDragging ? "opacity-0" : "opacity-100",
            )}
          >
            <FiMove className="h-3.5 w-3.5" aria-hidden="true" />
            {canPan ? t("image.dragToReposition") : t("image.zoomToReposition")}
          </span>
        </div>

        <div className={cx("space-y-3 p-3", SURFACE_INSET)}>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="icon"
              size="icon"
              fullWidth={false}
              aria-label={t("image.zoomOut")}
              disabled={draft.scale <= PLACEMENT_SCALE_BOUNDS.min}
              onClick={() => setScale(draft.scale - ZOOM_BUTTON_STEP)}
            >
              <FiZoomOut className="h-4 w-4" aria-hidden="true" />
            </Button>

            <input
              id={zoomId}
              type="range"
              min={PLACEMENT_SCALE_BOUNDS.min}
              max={PLACEMENT_SCALE_BOUNDS.max}
              step={PLACEMENT_SCALE_BOUNDS.step}
              value={draft.scale}
              aria-label={t("image.zoom")}
              aria-valuetext={t("image.zoomLevel", {
                zoom: draft.scale.toFixed(1),
              })}
              onChange={(event) => setScale(Number(event.target.value))}
              className={cx(
                "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-violet-600 dark:bg-zinc-700 dark:accent-violet-400",
                FOCUS_RING_FIELD,
              )}
            />

            <Button
              type="button"
              variant="icon"
              size="icon"
              fullWidth={false}
              aria-label={t("image.zoomIn")}
              disabled={draft.scale >= PLACEMENT_SCALE_BOUNDS.max}
              onClick={() => setScale(draft.scale + ZOOM_BUTTON_STEP)}
            >
              <FiZoomIn className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {/*
            The keyboard path's only feedback. Arrow keys move the photo and
            nothing about that reaches a screen reader — the frame is a picture
            and the change is a style property. `aria-live="polite"` on a
            read-out of the current position is what turns "press ArrowDown and
            hope" into an operable control.
          */}
          <p
            aria-live="polite"
            data-testid="image-position-readout"
            className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400"
          >
            {t("image.positionReadout", {
              horizontal: Math.round(draft.x),
              vertical: Math.round(draft.y),
              zoom: draft.scale.toFixed(2),
            })}
          </p>

          <div className="flex items-center justify-between gap-2">
            <p
              id={hintId}
              className="text-xs text-zinc-500 dark:text-zinc-400"
            >
              {t("image.positionKeyboardHint")}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              fullWidth={false}
              onClick={() => setDraft(CENTERED_IMAGE_PLACEMENT)}
            >
              <FiCrosshair className="h-4 w-4" aria-hidden="true" />
              {t("image.recenter")}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
