import type { CreateApiTokenOutput } from "@repo/schemas";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiChevronDown } from "react-icons/fi";
import { FOCUS_RING } from "../../../../shared-components/surface";
import {
  buildExtractorConfig,
  buildTokenExport,
  claudeHookNotes,
  CLAUDE_HOOK_SNIPPET,
  claudeHookSummary,
  CLAUDE_HOOK_TARGET,
  EXTRACTOR_CONFIG_TARGET,
  extractorCronCaution,
  EXTRACTOR_CRON_SNIPPET,
  extractorReposConsequence,
  extractorReposTarget,
  EXTRACTOR_RUN_COMMAND,
  EXTRACTOR_UPLOAD_COMMAND,
  REPOS_CONFIG_SNIPPET,
  REPOS_LIST_COMMAND,
  REPOS_CONFIG_TARGET,
  reposCoverageConsequence,
  REPOS_DISCOVERY_COMMAND,
  reposDiscoveryNote,
} from "../../lib/connection-format";
import { resolveApiUrl } from "../../lib/mcp-config";
import { buildTabs, TOKEN_PLACEHOLDER } from "../../lib/mcp-tool-tabs";
import {
  NewConnectionSetup,
  type StashedConnection,
} from "../new-connection-setup";
import { SnippetBlock } from "../snippet-block";
import { ToolTabs } from "../tool-tabs";
import { WizardTokenBlock } from "./wizard-token-block";
import type { WizardSourceKey } from "./wizard-shared";

/** Scopes per source. MCP posts; hook/extractor only append activity. */
export const ACTIVITY_SCOPES = ["activity:write"] as const;
export const MCP_SCOPES = [
  "posts:read",
  "posts:write",
  "profile:read",
] as const;

function NumberedFlow({
  steps,
}: {
  steps: Array<{ label: string; body: React.ReactNode }>;
}) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={step.label} className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">
              {index + 1}
            </span>
            {step.label}
          </div>
          {step.body}
        </li>
      ))}
    </ol>
  );
}

/**
 * The repo roster, kept deliberately secondary.
 *
 * `weekly_update` summarizes every path in `~/.crafthub/repos.json`, falling
 * back to the extractor config's `repos` array and then to the current
 * directory. That last fallback works, which is exactly why this is easy to
 * miss: a week spent across four projects silently posts as one.
 */
function ReposCoverageBlock({ variant }: { variant: "mcp" | "extractor" }) {
  const { t } = useTranslation();
  const isMcp = variant === "mcp";
  return (
    <details className="group rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 ${FOCUS_RING} rounded-md`}
      >
        {t("wizard.connect.coverEveryProject")}
        <FiChevronDown
          className="ml-auto h-3.5 w-3.5 shrink-0 transition group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {isMcp ? reposCoverageConsequence() : extractorReposConsequence()}
        </p>
        <SnippetBlock
          snippet={{
            target: isMcp ? REPOS_CONFIG_TARGET : extractorReposTarget(),
            language: "json",
            code: REPOS_CONFIG_SNIPPET,
          }}
        />
        <SnippetBlock
          snippet={{
            target: isMcp
              ? t("wizard.connect.terminalBuildFolder")
              : t("wizard.connect.terminalListRepos"),
            language: "bash",
            code: isMcp ? REPOS_DISCOVERY_COMMAND : REPOS_LIST_COMMAND,
          }}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {reposDiscoveryNote()}
        </p>
      </div>
    </details>
  );
}

export type ConnectStepProps = {
  sourceKey: WizardSourceKey;
  /** Null only for the MCP path, which creates no connection. */
  created: StashedConnection | null;
  token: CreateApiTokenOutput | null;
  onTokenCreated: (token: CreateApiTokenOutput) => void;
  /** Prefill for the inline token name, derived from the display name. */
  tokenNameHint: string;
  /**
   * MCP only: the tool tab the user picked, lifted into the wizard so the
   * Schedule step can open on the same tool's automation guidance.
   */
  toolKey?: string | null;
  onToolKeyChange?: (key: string) => void;
};

export function ConnectStep({
  sourceKey,
  created,
  token,
  onTokenCreated,
  tokenNameHint,
  toolKey = null,
  onToolKeyChange,
}: ConnectStepProps) {
  const { t } = useTranslation();
  const apiUrl = useMemo(() => resolveApiUrl(), []);
  const plaintextToken = token?.token ?? null;

  if (sourceKey === "mcp") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("wizard.connect.mcpIntro")}
        </p>
        <WizardTokenBlock
          scopes={[...MCP_SCOPES]}
          defaultName={tokenNameHint}
          token={token}
          onCreated={onTokenCreated}
        />
        <ToolTabs
          tabs={buildTabs(t, apiUrl, plaintextToken ?? TOKEN_PLACEHOLDER)}
          idPrefix="wizard-mcp"
          activeKey={toolKey ?? undefined}
          onActiveKeyChange={onToolKeyChange}
        />
        <ReposCoverageBlock variant="mcp" />
      </div>
    );
  }

  if (created === null) {
    // Unreachable by design — the wizard only advances past Source once the
    // create call has answered. Render nothing rather than lie.
    return null;
  }

  if (sourceKey === "forge") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("wizard.connect.webhookIntro")}
        </p>
        {/* The exact amber shown-once treatment from the connections panel —
            same component, not a lookalike. */}
        <NewConnectionSetup created={created} />
      </div>
    );
  }

  if (sourceKey === "claude_code") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {claudeHookSummary()}
        </p>
        <WizardTokenBlock
          scopes={[...ACTIVITY_SCOPES]}
          defaultName={tokenNameHint}
          token={token}
          onCreated={onTokenCreated}
        />
        <SnippetBlock
          snippet={{
            target: CLAUDE_HOOK_TARGET,
            language: "json",
            code: CLAUDE_HOOK_SNIPPET,
          }}
        />
        <SnippetBlock
          snippet={{
            target: EXTRACTOR_CONFIG_TARGET,
            language: "json",
            // The REAL connection id — never a placeholder the user has to
            // hunt down later.
            code: buildExtractorConfig(created.connectionId),
          }}
        />
        <ol className="list-decimal space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
          {claudeHookNotes().map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ol>
      </div>
    );
  }

  // extractor
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("wizard.connect.extractorIntro")}
      </p>
      <WizardTokenBlock
        scopes={[...ACTIVITY_SCOPES]}
        defaultName={tokenNameHint}
        token={token}
        onCreated={onTokenCreated}
      />
      <NumberedFlow
        steps={[
          {
            label: t("wizard.connect.pointCli"),
            body: (
              <SnippetBlock
                snippet={{
                  target: EXTRACTOR_CONFIG_TARGET,
                  language: "json",
                  code: buildExtractorConfig(created.connectionId),
                }}
              />
            ),
          },
          {
            label: t("wizard.connect.giveToken"),
            body: (
              <SnippetBlock
                snippet={{
                  target: t("common.terminal"),
                  language: "bash",
                  code: buildTokenExport(plaintextToken),
                }}
              />
            ),
          },
          {
            label: t("wizard.connect.extractCommand"),
            body: (
              <SnippetBlock
                snippet={{
                  target: t("common.terminal"),
                  language: "bash",
                  code: EXTRACTOR_RUN_COMMAND,
                }}
              />
            ),
          },
          {
            label: t("wizard.connect.uploadCommand"),
            body: (
              <SnippetBlock
                snippet={{
                  target: t("common.terminal"),
                  language: "bash",
                  code: EXTRACTOR_UPLOAD_COMMAND,
                }}
              />
            ),
          },
        ]}
      />
      <ReposCoverageBlock variant="extractor" />
      <details className="group rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
        <summary
          className={`flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 ${FOCUS_RING} rounded-md`}
        >
          {t("wizard.connect.automateOptional")}
          <FiChevronDown
            className="ml-auto h-3.5 w-3.5 shrink-0 transition group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="mt-2 space-y-2">
          <SnippetBlock
            snippet={{
              target: t("wizard.connect.crontabFridays"),
              language: "bash",
              code: EXTRACTOR_CRON_SNIPPET,
            }}
          />
          <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
            <FiAlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            {extractorCronCaution()}
          </p>
        </div>
      </details>
    </div>
  );
}
