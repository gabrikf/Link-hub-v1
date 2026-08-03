import { useId, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiImage,
  FiLoader,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";
import { uploadImage } from "../lib/upload-api";
import { AvatarCropper } from "./avatar-cropper";

export type FileUploadAspect = "banner" | "cover" | "square";

type FileUploadProps = {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  /** Preview aspect ratio: "banner" ~3:1, "cover" ~16:9, "square" 1:1. */
  aspect?: FileUploadAspect;
  className?: string;
  helperText?: string;
  /**
   * Opt-in: route the picked file through a circular crop dialog and upload the
   * cropped result instead of the original. Off by default so banner, cover and
   * post-image call sites keep the plain pick-and-upload path.
   */
  cropToCircle?: boolean;
};

const ASPECT_CLASS: Record<FileUploadAspect, string> = {
  banner: "aspect-[3/1]",
  cover: "aspect-video",
  square: "aspect-square",
};

/** Client-side guard mirroring the server's allow-list — fail fast, better UX. */
const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

type Status = "idle" | "uploading" | "error";

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
  className,
  helperText,
  cropToCircle = false,
}: FileUploadProps) {
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
      return "Unsupported file type. Use JPEG, PNG, WebP, GIF, or AVIF.";
    }
    if (file.size > MAX_SIZE_BYTES) {
      return "Image is too large. Maximum size is 5 MB.";
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
    } catch (uploadError) {
      setStatus("error");
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Couldn't upload the image. Please try again.",
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
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const describedBy =
    [hasError ? errorId : null, helperText ? helperId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={`space-y-2 ${className ?? ""}`.trim()}>
      {label ? (
        <label
          className="block text-sm text-zinc-700 dark:text-zinc-300"
          htmlFor={inputId}
        >
          {label}
        </label>
      ) : null}

      {/* Drop zone (a non-interactive group) with an explicit real button as the
          only click/keyboard target — avoids nesting the Clear <button> inside
          another button (invalid a11y). Drag-and-drop lives on the group. */}
      <div
        role="group"
        aria-label={
          hasValue ? "Replace image" : `Upload ${label ?? "image"}`
        }
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
          ASPECT_CLASS[aspect],
          "group relative w-full overflow-hidden rounded-2xl border bg-zinc-100 ring-1 ring-inset transition dark:bg-zinc-800/60",
          hasError
            ? "border-red-400 ring-red-300/60 dark:border-red-500/70 dark:ring-red-500/30"
            : isDragging
              ? "border-violet-400 ring-violet-300/70 dark:border-violet-500/70 dark:ring-violet-500/30"
              : "border-zinc-200 ring-zinc-900/5 dark:border-zinc-700 dark:ring-white/5",
        ].join(" ")}
      >
        {/* The one interactive control: a real button gets native Enter/Space
            activation and a single tab stop. It overlays the whole zone so the
            preview/placeholder stay clickable. */}
        <button
          type="button"
          onClick={openPicker}
          disabled={isUploading}
          aria-label={
            hasValue ? "Replace image" : `Upload ${label ?? "image"}`
          }
          aria-invalid={hasError || undefined}
          aria-describedby={describedBy}
          className="absolute inset-0 z-0 h-full w-full cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 disabled:cursor-default"
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

        {value ? (
          <>
            {!previewLoaded ? (
              <div
                className="anim-sheen absolute inset-0 bg-zinc-200 dark:bg-zinc-700/60"
                aria-hidden="true"
              />
            ) : null}
            <img
              key={value}
              src={value}
              alt={label ? `${label} preview` : "Uploaded image preview"}
              className={[
                "h-full w-full object-cover transition-opacity duration-300",
                previewLoaded ? "opacity-100" : "opacity-0",
              ].join(" ")}
              onLoad={() => setPreviewLoaded(true)}
            />
            {/* Hover affordance to replace */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm">
                <FiUploadCloud className="h-4 w-4" aria-hidden="true" />
                Replace
              </span>
            </div>
          </>
        ) : (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-zinc-400 dark:text-zinc-500">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10">
              <FiImage className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Click or drop an image
            </span>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
              JPEG, PNG, WebP, GIF or AVIF · up to 5 MB
            </span>
          </div>
        )}

        {/* Uploading overlay */}
        {isUploading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 text-zinc-700 backdrop-blur-sm dark:bg-zinc-900/70 dark:text-zinc-200">
            <FiLoader className="h-6 w-6 animate-spin" aria-hidden="true" />
            <span className="text-xs font-medium">Uploading…</span>
          </div>
        ) : null}

        {/* Clear button */}
        {hasValue && !isUploading ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Remove image"
            className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur transition hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/20"
          >
            <FiX className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {hasError && error ? (
        <p
          id={errorId}
          className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400"
        >
          <FiAlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-xs text-zinc-500 dark:text-zinc-400">
          {helperText}
        </p>
      ) : (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Upload an image file — it's stored securely and served over a CDN.
        </p>
      )}

      {cropToCircle ? (
        <AvatarCropper
          file={pendingCrop}
          onCancel={handleCropCancel}
          onCropped={handleCropped}
        />
      ) : null}
    </div>
  );
}
