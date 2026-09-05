import type { ApiTokenScope, CreateApiTokenOutput } from "@repo/schemas";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { FiAlertTriangle, FiChevronDown, FiKey } from "react-icons/fi";
import { reportError } from "../../../../lib/report-error";
import { useCreateToken } from "../../../../lib/token-queries";
import { Button } from "../../../../shared-components/button";
import { Input } from "../../../../shared-components/input";
import { FOCUS_RING } from "../../../../shared-components/surface";
import { stashToken } from "../../lib/token-stash";
import { SnippetBlock } from "../snippet-block";

/**
 * Inline token creation for the wizard's Connect step.
 *
 * The hook and the extractor upload with a PAT carrying `activity:write`; the
 * MCP server needs `posts:read posts:write profile:read`. Sending the user to
 * the separate token dialog mid-wizard would lose their place, so the create
 * happens here — with the same one-time-plaintext rules as everywhere else.
 */
export function WizardTokenBlock({
  scopes,
  defaultName,
  token,
  onCreated,
}: Readonly<{
  scopes: ApiTokenScope[];
  defaultName: string;
  /** Lifted state: the wizard remembers the token across step changes. */
  token: CreateApiTokenOutput | null;
  onCreated: (token: CreateApiTokenOutput) => void;
}>) {
  const { t } = useTranslation();
  const createToken = useCreateToken();
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setError(null);
    try {
      const result = await createToken.mutateAsync({
        name: name.trim() || defaultName,
        scopes,
      });
      // Same stash the settings page reads: closing the wizard (Escape, the
      // backdrop, resetState) must not destroy the only copy of the plaintext,
      // and the page's manual-setup snippets pick it up from here on close.
      stashToken(result);
      onCreated(result);
    } catch (error) {
      // Token name/value never travel with the report.
      reportError(error, {
        action: "settings.wizard-create-token",
        extra: { scopes },
      });
      setError(t("settings.createToken.failed"));
    }
  };

  if (token) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
        <p className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
          <FiAlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          {/* Two sentences, the first emphasised. `<strong>` is a Trans slot
              so a language that leads with the other clause can move it. */}
          <span>
            <Trans
              i18nKey="wizard.token.shownOnce"
              components={{ strong: <strong className="font-semibold" /> }}
            />
          </span>
        </p>
        <div className="mt-2">
          <SnippetBlock
            snippet={{
              target: t("wizard.token.heading"),
              language: "text",
              code: token.token,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
        <FiKey className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t("wizard.token.uploadsWith", { scopes: scopes.join(", ") })}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <Input
            id="wizard-token-name"
            label={t("wizard.token.name")}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="soft"
          fullWidth={false}
          className="shrink-0"
          isLoading={createToken.isPending}
          loadingLabel={t("common.creating")}
          onClick={() => {
            void handleCreate();
          }}
        >
          {t("settings.token.create")}
        </Button>
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-1.5 text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}
      <details className="group mt-2">
        <summary
          className={`flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 ${FOCUS_RING} rounded`}
        >
          {t("wizard.token.alreadyHaveOne")}
          <FiChevronDown
            className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <Trans
            i18nKey="wizard.token.scopeRequirement"
            count={scopes.length}
            values={{ scopes: scopes.join(" ") }}
            components={{
              token: <code className="font-mono break-all" />,
              scopes: <code className="font-mono" />,
            }}
          />
        </p>
      </details>
    </div>
  );
}
