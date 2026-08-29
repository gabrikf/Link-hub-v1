import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiAlertCircle, FiImage, FiLink2, FiX } from "react-icons/fi";

/**
 * NOTE: The app has no file-upload/storage backend yet, so this field is
 * URL-based only (paste an image URL). A real `<input type="file">` upload
 * flow needs the deferred object-storage infra (signed uploads + CDN) before
 * it can persist binaries — wire that in here once it exists.
 */

export type ImageAspect = "banner" | "cover" | "square";

type ImageInputProps = {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  /** Defaults to a translated "https://…" when not provided. */
  placeholder?: string;
  /** Preview aspect ratio: "banner" ~3:1, "cover" ~16:9, "square" 1:1. */
  aspect?: ImageAspect;
  className?: string;
  helperText?: string;
};

const ASPECT_CLASS: Record<ImageAspect, string> = {
  banner: "aspect-[3/1]",
  cover: "aspect-video",
  square: "aspect-square",
};

/**
 * Defense-in-depth: only http(s) URLs are valid media sources. Mirrors
 * `httpUrlSchema` in @repo/schemas — rejects javascript:/data:/vbscript:.
 */
function isValidHttpUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    /**
     * Deliberately reports NOTHING, not even a breadcrumb.
     *
     * This runs during render on every keystroke, and `new URL()` throwing is
     * the normal answer for half-typed input — it is the predicate, not a
     * failure. Recording it filled Sentry's 100-entry breadcrumb buffer with
     * "user is still typing" and evicted the context that makes a real event
     * diagnosable.
     */
    return false;
  }
}

type LoadState = "idle" | "loading" | "loaded" | "error";

export function ImageInput({
  value,
  onChange,
  label,
  placeholder,
  aspect = "cover",
  className,
  helperText,
}: ImageInputProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("common.urlPlaceholder");
  const reactId = useId();
  const inputId = `image-input-${reactId}`;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  // Local draft so the user can type freely; only committed values (valid
  // http(s) URLs or empty) are pushed up via onChange.
  const [draft, setDraft] = useState(value ?? "");
  const [touched, setTouched] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("idle");

  // Keep the draft in sync when the value changes from the outside (e.g. form
  // reset / initial hydrate) without clobbering active typing.
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const trimmed = draft.trim();
  const isEmpty = trimmed.length === 0;
  const isValid = !isEmpty && isValidHttpUrl(trimmed);
  const showError = touched && !isEmpty && !isValid;
  const previewUrl = isValid ? trimmed : null;

  useEffect(() => {
    setLoadState(previewUrl ? "loading" : "idle");
  }, [previewUrl]);

  const commit = (next: string) => {
    const value = next.trim();
    if (value.length === 0) {
      onChange(null);
      return;
    }
    if (isValidHttpUrl(value)) {
      onChange(value);
    }
  };

  const handleClear = () => {
    setDraft("");
    setTouched(false);
    setLoadState("idle");
    onChange(null);
  };

  const hasValue = !isEmpty;

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

      {/* Preview drop-zone / thumbnail */}
      <div
        className={[
          ASPECT_CLASS[aspect],
          "group relative w-full overflow-hidden rounded-2xl border bg-zinc-100 ring-1 ring-inset transition dark:bg-zinc-800/60",
          showError
            ? "border-red-400 ring-red-300/60 dark:border-red-500/70 dark:ring-red-500/30"
            : "border-zinc-200 ring-zinc-900/5 dark:border-zinc-700 dark:ring-white/5",
        ].join(" ")}
      >
        {previewUrl ? (
          <>
            {loadState === "loading" ? (
              <div
                className="anim-sheen absolute inset-0 bg-zinc-200 dark:bg-zinc-700/60"
                aria-hidden="true"
              />
            ) : null}
            {loadState !== "error" ? (
              <img
                key={previewUrl}
                src={previewUrl}
                alt={
                  label ? t("image.labelPreview", { label }) : t("image.preview")
                }
                className={[
                  "h-full w-full object-cover transition-opacity duration-300",
                  loadState === "loaded" ? "opacity-100" : "opacity-0",
                ].join(" ")}
                onLoad={() => setLoadState("loaded")}
                onError={() => setLoadState("error")}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-zinc-500 dark:text-zinc-400">
                <FiAlertCircle className="h-6 w-6" aria-hidden="true" />
                <span className="text-xs font-medium">
                  {t("image.couldNotLoad")}
                </span>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  {t("image.checkDirectLink")}
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-zinc-400 dark:text-zinc-500">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-white/10">
              <FiImage className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {t("image.addImageUrl")}
            </span>
          </div>
        )}

        {/* Clear button (only when there's a value) */}
        {hasValue ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label={t("image.clearImage")}
            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur transition hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black/20"
          >
            <FiX className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {/* URL text input */}
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
          aria-hidden="true"
        >
          <FiLink2 className="h-4 w-4" />
        </span>
        <input
          id={inputId}
          type="url"
          inputMode="url"
          value={draft}
          placeholder={resolvedPlaceholder}
          aria-invalid={showError || undefined}
          aria-describedby={
            [showError ? errorId : null, helperText ? helperId : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            setTouched(true);
            commit(draft);
          }}
          onPaste={(event) => {
            // Let the paste land in the field first, then commit the *resulting*
            // field value through the same validate path used on blur. Reading
            // the input value (not the raw clipboard string) keeps the committed
            // value in sync with what's visible when pasting into a field that
            // already has content or a selection.
            const input = event.currentTarget;
            queueMicrotask(() => {
              setTouched(true);
              commit(input.value);
            });
          }}
          className={[
            "w-full rounded-md border bg-white py-2 pl-9 pr-3 text-zinc-900 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:bg-zinc-900 dark:text-zinc-100",
            showError
              ? "border-red-400 dark:border-red-500/70"
              : "border-zinc-300 dark:border-zinc-700",
          ].join(" ")}
        />
      </div>

      {showError ? (
        <p
          id={errorId}
          className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400"
        >
          <FiAlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("image.invalidUrl")}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-xs text-zinc-500 dark:text-zinc-400">
          {helperText}
        </p>
      ) : (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {t("image.pasteDirectLink")}
        </p>
      )}
    </div>
  );
}
