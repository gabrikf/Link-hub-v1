import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiCheck, FiShare2 } from "react-icons/fi";
import { reportError, reportHandled } from "../../../lib/report-error";

type ProfileShareButtonProps = {
  url: string;
  name: string;
  className?: string;
};

/**
 * Share control for the public profile. Prefers the native share sheet when
 * available, otherwise copies the profile link to the clipboard and shows a
 * transient "Copied" confirmation. No external dependencies / QR.
 */
export function ProfileShareButton({
  url,
  name,
  className,
}: ProfileShareButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const flashCopied = useCallback(() => {
    setCopied(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleShare = useCallback(async () => {
    const shareData = {
      title: t("profile.documentTitle", { name }),
      text: t("profile.shareText", { name }),
      url,
    };

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        // The user dismissing the native sheet rejects with AbortError — that's
        // not a failure, so do NOT fall back to clipboard / show "Copied".
        if (error instanceof DOMException && error.name === "AbortError") {
          reportHandled(error, { action: "profile.share" });
          return;
        }
        // Any other rejection is a genuine failure — fall through to clipboard.
        reportError(error, { action: "profile.share" });
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      flashCopied();
    } catch (error) {
      // Clipboard unavailable (e.g. insecure context) — no-op.
      reportHandled(error, { action: "profile.share-copy" });
    }
  }, [flashCopied, name, t, url]);

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={t("profile.shareThisProfile")}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white shadow-sm backdrop-blur transition hover:bg-black/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {copied ? (
        <>
          <FiCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t("common.copied")}
        </>
      ) : (
        <>
          <FiShare2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t("common.share")}
        </>
      )}
    </button>
  );
}
