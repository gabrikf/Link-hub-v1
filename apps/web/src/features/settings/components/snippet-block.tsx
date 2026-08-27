import { useTranslation } from "react-i18next";
import { FiCheck, FiCopy } from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import { useClipboard } from "../lib/use-clipboard";

/**
 * A labelled, copy-pasteable block of config.
 *
 * Lifted out of `connect-panel.tsx` unchanged when the activity-connections
 * panel needed the same thing for webhook URLs, one-time secrets and the Claude
 * Code hook. Two forks of "code box with a Copy button" would have drifted the
 * moment either one grew a state.
 */
export type Snippet = {
  /** File / target the snippet goes into, shown above the code block. */
  target: string;
  language: string;
  code: string;
};

export function SnippetBlock({ snippet }: { snippet: Snippet }) {
  const { t } = useTranslation();
  const { copied, copy } = useClipboard();

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
        <span className="truncate font-mono text-xs text-zinc-600 dark:text-zinc-400">
          {snippet.target}
        </span>
        <Button
          type="button"
          variant={copied ? "soft" : "ghost"}
          size="sm"
          fullWidth={false}
          className="shrink-0"
          aria-label={t("settings.snippet.copyTarget", {
            target: snippet.target,
          })}
          onClick={() => copy(snippet.code)}
        >
          {copied ? (
            <FiCheck className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <FiCopy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? t("common.copied") : t("common.copy")}
        </Button>
      </div>
      <pre className="overflow-x-auto bg-white p-3 text-xs leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
        <code>{snippet.code}</code>
      </pre>
    </div>
  );
}
