import { useCallback, useEffect, useRef, useState } from "react";
import { reportHandled } from "../../../lib/report-error";

/**
 * Small clipboard helper: exposes `copy(text)` and a transient `copied` flag
 * that resets after a moment so a button can flash a "Copied" confirmation.
 */
export function useClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch (error) {
        // Fallback for browsers/contexts without the async clipboard API.
        // Never attach `text` — this helper copies plaintext PATs and secrets.
        reportHandled(error, { action: "clipboard.write" });
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand("copy");
        } catch (error) {
          // Ignore — nothing else we can do.
          reportHandled(error, { action: "clipboard.write-fallback" });
        }
        document.body.removeChild(textarea);
      }

      setCopied(true);
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setCopied(false), resetMs);
    },
    [resetMs],
  );

  return { copied, copy };
}
