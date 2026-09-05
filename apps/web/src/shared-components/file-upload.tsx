import { CENTERED_IMAGE_PLACEMENT, type ImagePlacement } from "@repo/schemas";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FiAlertCircle,
  FiCamera,
  FiImage,
  FiLoader,
  FiMove,
  FiTrash2,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";
import { reportError } from "../lib/report-error";
import { uploadImage } from "../lib/upload-api";
import { AvatarCropper } from "./avatar-cropper";
import { Button } from "./button";
import { ImagePositionEditor } from "./image-position-editor";
import { PlacedImage } from "./placed-image";

export type FileUploadAspect = "banner" | "cover" | "square";

/**
 * "tile" is the rectangular drop zone used by banner / cover / post images.
 *
 * "avatar" is the profile-picture shape: a CIRCLE that matches how {@link Avatar}
 * renders the same photo everywhere else in the app, with the replace
 * affordance on the circle itself and removal as an explicit, labelled button
 * beside it — never a floating X pinned to a corner.
 */
export type FileUploadVariant = "tile" | "avatar";

type FileUploadProps = Readonly<{
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  /** Preview aspect ratio: "banner" ~3:1, "cover" ~16:9, "square" 1:1. */
  aspect?: FileUploadAspect;
  /** Preview shape and control layout. Defaults to the rectangular tile. */
  variant?: FileUploadVariant;
  className?: string;
  helperText?: string;
  /**
   * Opt-in: route the picked file through a circular crop dialog and upload the
   * cropped result instead of the original. Off by default so banner, cover and
   * post-image call sites keep the plain pick-and-upload path.
   */
  cropToCircle?: boolean;
  /**
   * Opt-in: let the user say WHICH part of the image shows.
   *
   * Passing `onPlacementChange` turns the tile into a repositionable one — the
   * preview renders at the stored focal point, a fresh upload opens the
   * position editor straight away, and a "Reposition" control stays available
   * afterwards. Left out, the tile behaves exactly as it did.
   */
  placement?: ImagePlacement | null;
  onPlacementChange?: (placement: ImagePlacement | null) => void;
  /** Width / height of the frame this image is published at. */
  placementAspect?: number;
  /**
   * A second shape the same image is published at, drawn over the editor frame
   * as a safe area. See {@link ImagePositionEditor}.
   */
  placementSafeAreaAspect?: number;
  placementSafeAreaLabel?: string;
  placementTitle?: string;
  placementDescription?: string;
  /**
   * Handle for tests. Two of these tiles sit in the appearance panel and both
   * label their controls the same way ("Replace image", "Reposition"), so
   * without a stable per-field root there is no honest way to say "the BANNER's
   * reposition button".
   */
  testId?: string;
}>;

const ASPECT_CLASS: Record<FileUploadAspect, string> = {
  banner: "aspect-[3/1]",
  cover: "aspect-video",
  square: "aspect-square",
};

/** Matches the 96px avatar the profile preview renders. */
const AVATAR_PREVIEW_CLASS = "h-24 w-24 shrink-0 rounded-full";

/** Client-side guard mirroring the server's allow-list — fail fast, better UX. */
const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * A small control floating on top of a photograph — Remove, Reposition.
 *
 * Deliberately NOT `Button`: these sit on an image the user chose, so they need
 * a dark scrim and a white focus ring rather than the theme's surfaces, and
 * they are children of a drop zone that is itself a click target. There is one
 * definition rather than two identical literals because the second one was a
 * copy of the first and the pair would have drifted.
 *
 * No `dark:` variants, and that is correct here: the backdrop is the
 * photograph, which is the same picture in both themes.
 */
const OVERLAY_CONTROL =
  "inline-flex items-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur transition hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/20";

type Status = "idle" | "uploading" | "error";

/**
 * What fills the tile: the uploaded photograph with its hover/focus "replace"
 * affordance, or the empty-state placeholder for the shape in use.
 *
 * Module scope, not a closure inside {@link FileUpload}: a component redeclared
 * on every render is a new type every render, so React would tear down and
 * remount the `<img>` — and the sheen would flash on every keystroke elsewhere
 * in the form.
 */
function DropZoneContents({
  value,
  placement,
  label,
  isAvatar,
  previewLoaded,
  onPreviewLoad,
}: Readonly<{
  value: string | null;
  placement: ImagePlacement | null;
  label?: string;
  isAvatar: boolean;
  previewLoaded: boolean;
  onPreviewLoad: () => void;
}>) {
  const { t } = useTranslation();

  if (!value) {
    return isAvatar ? (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-zinc-400 dark:text-zinc-500">
        <FiCamera className="h-6 w-6" aria-hidden="true" />
        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          {t("image.addPhoto")}
        </span>
      </div>
    ) : (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-zinc-400 dark:text-zinc-500">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10">
          <FiImage className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {t("image.clickOrDrop")}
        </span>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
          {t("image.fileRequirements")}
        </span>
      </div>
    );
  }

  return (
    <>
      {!previewLoaded ? (
        <div
          className="anim-sheen absolute inset-0 bg-zinc-200 dark:bg-zinc-700/60"
          aria-hidden="true"
        />
      ) : null}
      <PlacedImage
        key={value}
        src={value}
        placement={placement}
        alt={
          label
            ? t("image.labelPreview", { label })
            : t("image.uploadedPreview")
        }
        className={[
          "transition-opacity duration-300",
          previewLoaded ? "opacity-100" : "opacity-0",
        ].join(" ")}
        onLoad={onPreviewLoad}
      />
      {/* Hover/focus affordance to replace. `group-focus-within` matters:
          the pick control is an invisible overlay, so keyboard users would
          otherwise get a focus ring around an unexplained circle. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-focus-within:bg-black/45 group-focus-within:opacity-100 group-hover:bg-black/45 group-hover:opacity-100">
        {isAvatar ? (
          <span className="inline-flex flex-col items-center gap-0.5 text-white">
            <FiCamera className="h-5 w-5" aria-hidden="true" />
            <span className="text-[11px] font-medium">
              {t("image.changePhoto")}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm">
            <FiUploadCloud className="h-4 w-4" aria-hidden="true" />
            {t("common.replace")}
          </span>
        )}
      </div>
    </>
  );
}

/**
 * The pills that float on the tile itself once it holds a photograph: Remove,
 * and — where the caller accepts a focal point — Reposition.
 *
 * Reposition is a real button rather than a hover-only affordance: the owner
 * comes back to it days later, long after the upload, and a control that only
 * exists on hover does not exist on a phone.
 */
function TileOverlayControls({
  canReposition,
  onReposition,
  onClear,
}: Readonly<{
  canReposition: boolean;
  onReposition: (event: React.MouseEvent) => void;
  onClear: (event: React.MouseEvent) => void;
}>) {
  const { t } = useTranslation();

  return (
    <>
      {canReposition ? (
        <button
          type="button"
          onClick={onReposition}
          className={`absolute bottom-2 left-2 z-10 gap-1.5 px-3 py-1.5 text-xs font-medium ${OVERLAY_CONTROL}`}
        >
          <FiMove className="h-3.5 w-3.5" aria-hidden="true" />
          {t("image.reposition")}
        </button>
      ) : null}

      <button
        type="button"
        onClick={onClear}
        aria-label={t("image.removeImage")}
        className={`absolute right-2 top-2 z-10 h-8 w-8 justify-center ${OVERLAY_CONTROL}`}
      >
        <FiX className="h-4 w-4" aria-hidden="true" />
      </button>
    </>
  );
}

/**
 * The column beside the circular avatar: what the file has to be, and removal
 * as an explicit labelled button — never a floating X pinned to the circle.
 */
function AvatarSidePanel({
  canRemove,
  onRemove,
}: Readonly<{
  canRemove: boolean;
  onRemove: (event: React.MouseEvent) => void;
}>) {
  const { t } = useTranslation();

  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {t("image.fileRequirements")}
      </p>
      {canRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          fullWidth={false}
          className="-ml-3"
          onClick={onRemove}
        >
          <FiTrash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t("image.removePhoto")}
        </Button>
      ) : null}
    </div>
  );
}

/** The "uploading…" scrim drawn over the tile while a file is in flight. */
function UploadingOverlay({ isAvatar }: Readonly<{ isAvatar: boolean }>) {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 text-zinc-700 backdrop-blur-sm dark:bg-zinc-900/70 dark:text-zinc-200">
      <FiLoader
        className={isAvatar ? "h-5 w-5 animate-spin" : "h-6 w-6 animate-spin"}
        aria-hidden="true"
      />
      {!isAvatar ? (
        <span className="text-xs font-medium">{t("common.uploading")}</span>
      ) : null}
    </div>
  );
}

/**
 * The line under the field: the upload error if there is one, else the caller's
 * helper text, else the reassurance about where the file ends up.
 */
function FieldHint({
  error,
  errorId,
  helperText,
  helperId,
}: Readonly<{
  error: string | null;
  errorId: string;
  helperText?: string;
  helperId: string;
}>) {
  const { t } = useTranslation();

  if (error) {
    return (
      <p
        id={errorId}
        className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400"
      >
        <FiAlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {error}
      </p>
    );
  }

  if (helperText) {
    return (
      <p id={helperId} className="text-xs text-zinc-500 dark:text-zinc-400">
        {helperText}
      </p>
    );
  }

  return (
    <p className="text-xs text-zinc-400 dark:text-zinc-500">
      {t("image.storedSecurely")}
    </p>
  );
}

/**
 * The accessible name of the single pick control. The avatar wording matches
 * what the hover overlay says, so what a sighted user reads and what a screen
 * reader announces are the same phrase.
 */
function usePickerLabel(
  isAvatar: boolean,
  hasValue: boolean,
  label: string | undefined,
): string {
  const { t } = useTranslation();

  if (isAvatar) {
    return hasValue ? t("image.changePhoto") : t("image.addPhoto");
  }
  return hasValue
    ? t("image.replaceImage")
    : t("image.uploadLabel", { label: label ?? "image" });
}

/** Border and ring for the drop zone, which reflect error and drag state. */
function dropZoneStateClass(hasError: boolean, isDragging: boolean): string {
  if (hasError) {
    return "border-red-400 ring-red-300/60 dark:border-red-500/70 dark:ring-red-500/30";
  }
  if (isDragging) {
    return "border-violet-400 ring-violet-300/70 dark:border-violet-500/70 dark:ring-violet-500/30";
  }
  return "border-zinc-200 ring-zinc-900/5 dark:border-zinc-700 dark:ring-white/5";
}

/**
 * Reusable image upload field: pick or drop an image file, it is uploaded to
 * object storage, and the resulting public URL is surfaced via `onChange`.
 * Mirrors the look of {@link ImageInput}, but persists real binaries.
 */
export function FileUpload({
  value,
  onChange,
  label,
  aspect = "cover",
  variant = "tile",
  className,
  helperText,
  cropToCircle = false,
  placement = null,
  onPlacementChange,
  placementAspect = 3,
  placementSafeAreaAspect,
  placementSafeAreaLabel,
  placementTitle,
  placementDescription,
  testId,
}: FileUploadProps) {
  const { t } = useTranslation();
  const reactId = useId();
  const inputId = `file-upload-${reactId}`;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  /** Validated file waiting on the crop dialog. Only ever set when cropping. */
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);
  /** The image currently open in the position editor, if any. */
  const [positioningUrl, setPositioningUrl] = useState<string | null>(null);

  const canReposition = Boolean(onPlacementChange);

  /**
   * A new URL means a new `<img>` that has not loaded yet, so the sheen must
   * come back. Adjusted during render rather than in an effect: an effect would
   * paint one frame of the OLD image marked as loaded before correcting itself.
   */
  const [loadedValue, setLoadedValue] = useState(value);
  if (value !== loadedValue) {
    setLoadedValue(value);
    setPreviewLoaded(false);
  }

  const isUploading = status === "uploading";
  const hasError = status === "error";
  const hasValue = Boolean(value);

  const validate = (file: File): string | null => {
    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      return t("errors.imageUnsupportedType");
    }
    if (file.size > MAX_SIZE_BYTES) {
      return t("errors.imageTooLarge");
    }
    return null;
  };

  const upload = async (file: File) => {
    setStatus("uploading");
    setError(null);

    try {
      const url = await uploadImage(file);
      onChange(url);
      setStatus("idle");
      /*
       * A NEW image gets a fresh, centred placement and the editor opens on it
       * immediately.
       *
       * Opening it is the whole fix for the reported bug: the previous flow
       * uploaded a photo, cropped it to the middle of a 3:1 strip and left the
       * owner looking at a picture of her own shoulder with no visible way to
       * change it. Keeping the OLD placement would be worse than useless — a
       * focal point chosen for a different photograph.
       */
      if (onPlacementChange) {
        onPlacementChange(CENTERED_IMAGE_PLACEMENT);
        setPositioningUrl(url);
      }
    } catch (uploadError) {
      reportError(uploadError, {
        action: "upload.image-field",
        extra: { fileSize: file.size, fileType: file.type },
      });
      setStatus("error");
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : t("errors.imageUploadFailed"),
      );
    }
  };

  /**
   * Size/MIME validation runs BEFORE the crop dialog on purpose — decoding a
   * 200 MB TIFF just to tell the user it was rejected is a cheap way to hang
   * the tab.
   */
  const handleFile = async (file: File) => {
    const validationError = validate(file);
    if (validationError) {
      setStatus("error");
      setError(validationError);
      return;
    }

    if (cropToCircle) {
      setStatus("idle");
      setError(null);
      setPendingCrop(file);
      return;
    }

    await upload(file);
  };

  const handlePreviewLoad = () => setPreviewLoaded(true);

  const handleReposition = (event: React.MouseEvent) => {
    event.stopPropagation();
    setPositioningUrl(value);
  };

  /** Lets the user re-pick the SAME file — without this, `change` never fires. */
  const resetPicker = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleCropCancel = () => {
    setPendingCrop(null);
    resetPicker();
  };

  const handleCropped = async (croppedFile: File) => {
    setPendingCrop(null);
    resetPicker();
    await upload(croppedFile);
  };

  const openPicker = () => {
    if (isUploading) return;
    inputRef.current?.click();
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    setStatus("idle");
    setError(null);
    onChange(null);
    // A focal point belongs to one photograph. Leaving it behind would apply
    // this image's framing to whatever is uploaded next.
    onPlacementChange?.(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const describedBy =
    [hasError ? errorId : null, helperText ? helperId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const isAvatar = variant === "avatar";
  const showTileOverlayControls = !isAvatar && hasValue && !isUploading;

  const pickerLabel = usePickerLabel(isAvatar, hasValue, label);

  const dropZone = (
    /* Drop zone (a non-interactive group) with an explicit real button as the
       only click/keyboard target — avoids nesting a second <button> inside
       another button (invalid a11y). Drag-and-drop lives on the group. */
    <div
      role="group"
      aria-label={pickerLabel}
      aria-busy={isUploading || undefined}
      onDragOver={(event) => {
        event.preventDefault();
        if (!isUploading) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (isUploading) return;
        const file = event.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      }}
      className={[
        isAvatar
          ? AVATAR_PREVIEW_CLASS
          : `${ASPECT_CLASS[aspect]} w-full rounded-2xl`,
        /*
         * `isolate` contains this tile's own `z-10` controls (Remove,
         * Reposition). Without a stacking context here they escape into the
         * dialog's and paint OVER the sticky live preview above them — 94% of
         * it survived at 390px, the rest was two floating pills sitting on the
         * owner's face. `relative` alone with `z-index: auto` is not a
         * stacking context.
         */
        "group relative isolate overflow-hidden border bg-zinc-100 ring-1 ring-inset transition dark:bg-zinc-800/60",
        dropZoneStateClass(hasError, isDragging),
      ].join(" ")}
    >
      {/* The one interactive control: a real button gets native Enter/Space
          activation and a single tab stop. It overlays the whole zone so the
          preview/placeholder stay clickable. */}
      <button
        type="button"
        onClick={openPicker}
        disabled={isUploading}
        aria-label={pickerLabel}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
        className={[
          "absolute inset-0 z-0 h-full w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 disabled:cursor-default",
          isAvatar ? "rounded-full" : "rounded-2xl",
        ].join(" ")}
      />

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        tabIndex={-1}
        accept={ACCEPTED_MIME_TYPES.join(",")}
        className="sr-only"
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <DropZoneContents
        value={value}
        placement={canReposition ? placement : null}
        label={label}
        isAvatar={isAvatar}
        previewLoaded={previewLoaded}
        onPreviewLoad={handlePreviewLoad}
      />

      {/* Uploading overlay */}
      {isUploading ? <UploadingOverlay isAvatar={isAvatar} /> : null}

      {/* Tile only. On the avatar an X floating over a circle reads as
          decoration, so removal moves out to a labelled button beside the
          preview. */}
      {showTileOverlayControls ? (
        <TileOverlayControls
          canReposition={canReposition}
          onReposition={handleReposition}
          onClear={handleClear}
        />
      ) : null}
    </div>
  );

  return (
    <div data-testid={testId} className={`space-y-2 ${className ?? ""}`.trim()}>
      {label ? (
        <label
          className="block text-sm text-zinc-700 dark:text-zinc-300"
          htmlFor={inputId}
        >
          {label}
        </label>
      ) : null}

      {isAvatar ? (
        <div className="flex items-center gap-4">
          {dropZone}
          <AvatarSidePanel
            canRemove={hasValue && !isUploading}
            onRemove={handleClear}
          />
        </div>
      ) : (
        dropZone
      )}

      <FieldHint
        error={hasError ? error : null}
        errorId={errorId}
        helperText={helperText}
        helperId={helperId}
      />

      {cropToCircle ? (
        <AvatarCropper
          file={pendingCrop}
          onCancel={handleCropCancel}
          onCropped={handleCropped}
        />
      ) : null}

      {canReposition ? (
        <ImagePositionEditor
          src={positioningUrl}
          aspect={placementAspect}
          safeAreaAspect={placementSafeAreaAspect}
          safeAreaLabel={placementSafeAreaLabel}
          placement={placement}
          title={placementTitle ?? t("image.repositionTitle")}
          description={placementDescription ?? t("image.repositionHelp")}
          onCancel={() => setPositioningUrl(null)}
          onSave={(next) => {
            onPlacementChange?.(next);
            setPositioningUrl(null);
          }}
        />
      ) : null}
    </div>
  );
}
