import type { GitConnection } from "@repo/schemas";
import { useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";
import { FiAlertTriangle } from "react-icons/fi";
import { reportHandled } from "../../../lib/report-error";
import { Button } from "../../../shared-components/button";
import {
  buildWebhookUrl,
  claudeHookNotes,
  CLAUDE_HOOK_SNIPPET,
  claudeHookSummary,
  CLAUDE_HOOK_TARGET,
  getExtractorNotes,
  getGithubWebhookSteps,
  getGitlabWebhookSteps,
  isForgeProvider,
  PROVIDER_LABELS,
} from "../lib/connection-format";
import { resolveApiUrl } from "../lib/mcp-config";
import { SnippetBlock } from "./snippet-block";

/**
 * The one-time setup block for a just-created connection, extracted from
 * `connections-panel.tsx` when the auto-post wizard needed the exact same
 * amber "shown once" treatment for forge secrets. The plaintext webhook secret
 * is returned exactly once by the API; every surface that shows it must show
 * it the same way, and must never be one a stray Escape key destroys.
 */

/**
 * Survives route changes and reloads within the tab, and dies with the tab —
 * matching the one-time nature of the plaintext webhook secret itself. Exactly
 * the treatment `crafthub:last-created-token` gets, and for exactly the same
 * reason: the setup block is useless if dismissing a dialog destroys the only
 * copy of the secret, and the only recovery is creating a second connection
 * and orphaning the first.
 */
const STASHED_CONNECTION_KEY = "crafthub:last-created-connection";

/** Only what the setup block needs. Never merged into the cached read model. */
export type StashedConnection = {
  connectionId: string;
  provider: GitConnection["provider"];
  displayName: string;
  /** Plaintext, shown once. Null for providers with no signed webhooks. */
  webhookSecret: string | null;
};

export function readStashedConnection(): StashedConnection | null {
  try {
    const raw = window.sessionStorage.getItem(STASHED_CONNECTION_KEY);
    return raw ? (JSON.parse(raw) as StashedConnection) : null;
  } catch (error) {
    // Private mode / blocked storage / corrupt entry. Never include the value —
    // it carries a plaintext webhook secret.
    reportHandled(error, { action: "storage.read-stashed-connection" });
    return null;
  }
}

export function stashConnection(value: StashedConnection): void {
  try {
    window.sessionStorage.setItem(
      STASHED_CONNECTION_KEY,
      JSON.stringify(value),
    );
  } catch (error) {
    // Private mode / quota. The in-memory copy still drives this session.
    reportHandled(error, { action: "storage.stash-connection" });
  }
}

export function clearStashedConnection(): void {
  try {
    window.sessionStorage.removeItem(STASHED_CONNECTION_KEY);
  } catch (error) {
    // Nothing to do — the in-memory state is cleared either way.
    reportHandled(error, { action: "storage.clear-stashed-connection" });
  }
}

export function InstructionList({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

/**
 * The plaintext webhook secret, and the URL it authenticates.
 *
 * This lives on the panel rather than inside the create dialog on purpose. The
 * secret is returned exactly once by the API and is unrecoverable afterwards,
 * so the surface that shows it must not be the one a stray Escape key destroys.
 *
 * `onDismiss` is optional: inside the wizard the block is a step, not a
 * banner, and the wizard's own navigation is the way past it.
 */
export function NewConnectionSetup({
  created,
  onDismiss,
}: {
  created: StashedConnection;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  const apiUrl = useMemo(() => resolveApiUrl(), []);
  const webhookUrl = buildWebhookUrl(
    apiUrl,
    created.provider,
    created.connectionId,
  );
  const isForge = isForgeProvider(created.provider);

  return (
    <div className="anim-fade-up mt-5 rounded-xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <FiAlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
            aria-hidden="true"
          />
          <div>
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {t("settings.setup.finishFor", {
                displayName: created.displayName,
              })}
            </h3>
            {isForge && created.webhookSecret ? (
              <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
                <Trans
                  i18nKey="settings.setup.secretShownOnce"
                  components={{ strong: <strong className="font-semibold" /> }}
                />
              </p>
            ) : isForge ? (
              // The resume path for a forge connection: the secret was shown
              // once at creation and is unrecoverable, so this block can only
              // restate the webhook facts, never the secret.
              <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
                {t("settings.setup.connectedWebhook", {
                  providerLabel: PROVIDER_LABELS[created.provider],
                })}
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
                {t("settings.setup.connectedLocal")}
              </p>
            )}
          </div>
        </div>
        {onDismiss ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            fullWidth={false}
            className="shrink-0"
            onClick={onDismiss}
          >
            {t("common.dismiss")}
          </Button>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {created.webhookSecret ? (
          <SnippetBlock
            snippet={{
              target: t("settings.setup.webhookSecret"),
              language: "text",
              code: created.webhookSecret,
            }}
          />
        ) : null}

        {webhookUrl ? (
          <SnippetBlock
            snippet={{
              target: t("settings.setup.webhookUrl"),
              language: "text",
              code: webhookUrl,
            }}
          />
        ) : null}

        {created.provider === "claude_code" ? (
          <>
            <SnippetBlock
              snippet={{
                target: CLAUDE_HOOK_TARGET,
                language: "json",
                code: CLAUDE_HOOK_SNIPPET,
              }}
            />
            <p className="text-xs text-zinc-700 dark:text-zinc-300">
              {claudeHookSummary()}
            </p>
          </>
        ) : null}
      </div>

      <div className="mt-3">
        <h4 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          {t("settings.setup.setItUpIn", {
            providerLabel: PROVIDER_LABELS[created.provider],
          })}
        </h4>
        {created.provider === "github" ? (
          <InstructionList steps={getGithubWebhookSteps(t)} />
        ) : null}
        {created.provider === "gitlab" ? (
          <InstructionList steps={getGitlabWebhookSteps(t)} />
        ) : null}
        {created.provider === "claude_code" ? (
          <InstructionList steps={claudeHookNotes()} />
        ) : null}
        {created.provider === "extractor" ? (
          <InstructionList steps={getExtractorNotes(t)} />
        ) : null}
      </div>
    </div>
  );
}
