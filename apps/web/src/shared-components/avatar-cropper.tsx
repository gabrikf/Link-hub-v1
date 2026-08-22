import { useCallback, useEffect, useId, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import {
  FiCheck,
  FiRotateCw,
  FiZoomIn,
  FiZoomOut,
} from "react-icons/fi";
import { getCroppedImg } from "../lib/crop-image";
import { reportError } from "../lib/report-error";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { FeedbackMessage } from "./feedback-message";
import { FOCUS_RING_FIELD, SURFACE_INSET } from "./surface";

type AvatarCropperProps = {
  /** The picked file. `null` keeps the dialog closed. */
  file: File | null;
  onCancel: () => void;
  onCropped: (file: File) => void | Promise<void>;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

const clampZoom = (value: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

/**
 * Circular avatar crop dialog: pan, zoom (wheel / pinch / slider / buttons) and
 * rotate, then rasterise the selection client-side into a `File`.
 *
 * Focus trap, Escape-to-close, `aria-modal` and focus restoration all come from
 * the house {@link Dialog} (Radix) — none of that is reimplemented here.
 */
export function AvatarCropper({
  file,
  onCancel,
  onCropped,
}: AvatarCropperProps) {
  // Keyed remount, rather than an effect that copies `file` into state: picking
  // a different photo resets crop / zoom / rotation / error for free, and scopes
  // the object URL to exactly one file.
  return file ? (
    <CropperDialog
      key={`${file.name}:${file.size}:${file.lastModified}`}
      file={file}
      onCancel={onCancel}
      onCropped={onCropped}
    />
  ) : null;
}

function CropperDialog({
  file,
  onCancel,
  onCropped,
}: AvatarCropperProps & { file: File }) {
  const reactId = useId();
  const zoomId = `avatar-cropper-zoom-${reactId}`;

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * One object URL per file, revoked on unmount (which, thanks to the key above,
   * is also what a file swap does). Skipping the revoke pins the decoded bitmap
   * in memory for the lifetime of the tab. The cleanup cannot fire while
   * `getCroppedImg` is still reading the URL, because nothing unmounts this
   * component mid-save.
   *
   * The URL genuinely does not exist until after mount, so it cannot be derived
   * during render: a `useMemo` would hand StrictMode's double render two URLs
   * and then revoke the one still wired to `<Cropper image=…>`.
   */
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Stable identity: react-easy-crop re-invokes this on every pan frame, and an
  // inline closure would also defeat its internal prop diffing.
  const handleCropComplete = useCallback(
    (_croppedArea: Area, croppedPixels: Area) => {
      setCroppedAreaPixels(croppedPixels);
    },
    [],
  );

  const hasCropArea = Boolean(
    croppedAreaPixels &&
      croppedAreaPixels.width > 0 &&
      croppedAreaPixels.height > 0,
  );

  const handleSave = async () => {
    if (!objectUrl || !croppedAreaPixels) return;

    setIsSaving(true);
    setError(null);

    try {
      const cropped = await getCroppedImg(
        objectUrl,
        croppedAreaPixels,
        rotation,
        file.name,
      );
      await onCropped(cropped);
    } catch (cropError) {
      reportError(cropError, {
        action: "avatar.crop",
        extra: { fileSize: file.size, fileType: file.type, rotation },
      });
      setError(
        cropError instanceof Error
          ? cropError.message
          : "We couldn't crop that image. Please try another file.",
      );
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title="Adjust your photo"
      description="Drag to reposition, then zoom or rotate until it looks right. Only the circle is saved."
      closeLabel="Cancel cropping"
      contentClassName="max-w-md"
      buttons={
        <>
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            fullWidth={false}
            onClick={() => void handleSave()}
            disabled={!hasCropArea}
            isLoading={isSaving}
            loadingLabel="Saving…"
          >
            <FiCheck className="h-4 w-4" aria-hidden="true" />
            Save photo
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {/*
          EXPLICIT height, never `h-full` or a percentage: react-easy-crop
          measures its own parent, and a parent with no resolved height yields a
          {width: 0, height: 0} crop area (upstream issue #267) — the Save button
          would then stay disabled forever.

          The circular mask here IS the live preview; a second preview canvas
          would decode the bitmap twice for no extra information.
        */}
        <div className="relative h-72 w-full overflow-hidden rounded-xl bg-zinc-900 dark:bg-zinc-950">
          {objectUrl ? (
            <Cropper
              image={objectUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={false}
              objectFit="cover"
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              zoomWithScroll
              restrictPosition
              keyboardStep={4}
              onCropChange={setCrop}
              onZoomChange={(next) => setZoom(clampZoom(next))}
              onRotationChange={setRotation}
              onCropComplete={handleCropComplete}
            />
          ) : null}
        </div>

        {/* Every gesture also has a non-drag path: the slider gives arrows /
            Home / End / PageUp / PageDown for free, and the buttons cover
            pointer users who can't hold a drag. */}
        <div className={cx("space-y-3 p-3", SURFACE_INSET)}>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="icon"
              size="icon"
              fullWidth={false}
              aria-label="Zoom out"
              disabled={zoom <= MIN_ZOOM}
              onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
            >
              <FiZoomOut className="h-4 w-4" aria-hidden="true" />
            </Button>

            <input
              id={zoomId}
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              aria-label="Zoom"
              aria-valuetext={`${zoom.toFixed(1)}x`}
              onChange={(event) => setZoom(clampZoom(Number(event.target.value)))}
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
              aria-label="Zoom in"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
            >
              <FiZoomIn className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Drag the photo to reposition it.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              fullWidth={false}
              onClick={() => setRotation((current) => (current + 90) % 360)}
            >
              <FiRotateCw className="h-4 w-4" aria-hidden="true" />
              Rotate 90°
            </Button>
          </div>
        </div>

        {error ? <FeedbackMessage tone="error" message={error} /> : null}
      </div>
    </Dialog>
  );
}
