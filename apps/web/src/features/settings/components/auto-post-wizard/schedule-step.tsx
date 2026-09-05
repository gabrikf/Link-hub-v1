import type { DigestCadence } from "@repo/schemas";
import type { TFunction } from "i18next";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { FiChevronDown, FiInfo, FiShield } from "react-icons/fi";
import {
  FOCUS_RING,
  SURFACE_INSET,
} from "../../../../shared-components/surface";
import { SnippetBlock, type Snippet } from "../snippet-block";
import { Segmented } from "./wizard-controls";

/**
 * The cadences the wizard offers. `off` is a settings-row decision, not a
 * setup one, and weekly is the floor — daily was removed on purpose so a
 * profile can never turn into a commit firehose.
 */
export type WizardCadence = Extract<
  DigestCadence,
  "weekly" | "biweekly" | "monthly"
>;

function getCadenceHints(t: TFunction): Record<WizardCadence, string> {
  return {
    weekly: t("wizard.schedule.goalWeekly"),
    biweekly: t("wizard.schedule.goalBiweekly"),
    monthly: t("wizard.schedule.goalMonthly"),
  };
}

export function ScheduleStepBody({
  cadence,
  onCadenceChange,
  autoPostEnabled,
  onAutoPostChange,
  showAgentSummaryToggle,
  includeAgentSummary,
  onIncludeAgentSummaryChange,
}: Readonly<{
  cadence: WizardCadence;
  onCadenceChange: (cadence: WizardCadence) => void;
  autoPostEnabled: boolean;
  onAutoPostChange: (enabled: boolean) => void;
  /** Only the Claude Code hook has an agent summary to send. */
  showAgentSummaryToggle: boolean;
  includeAgentSummary: boolean;
  onIncludeAgentSummaryChange: (enabled: boolean) => void;
}>) {
  const { t } = useTranslation();
  const cadenceHints = getCadenceHints(t);
  return (
    <div className="space-y-4">
      <div className={`space-y-2 p-4 ${SURFACE_INSET}`}>
        <span className="block text-sm text-zinc-700 dark:text-zinc-300">
          {t("wizard.schedule.cadence")}
        </span>
        <Segmented
          label={t("wizard.schedule.cadence")}
          value={cadence}
          options={[
            { value: "weekly", label: t("settings.cadence.weekly") },
            { value: "biweekly", label: t("settings.cadence.biweekly") },
            { value: "monthly", label: t("settings.cadence.monthly") },
          ]}
          onChange={onCadenceChange}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {cadenceHints[cadence]}
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-violet-600"
          checked={autoPostEnabled}
          onChange={(event) => onAutoPostChange(event.target.checked)}
        />
        <span className="min-w-0">
          <span className="text-sm text-zinc-900 dark:text-zinc-100">
            {t("settings.connectionDialog.autoPost")}
          </span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            {t("settings.connectionDialog.autoPostHelp")}
          </span>
        </span>
      </label>

      <p className="flex items-start gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        <FiInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t("wizard.schedule.recommendation")}
      </p>

      {showAgentSummaryToggle ? (
        // Not buried, and not sold. The default is false because the text this
        // sends is a model's prose about work that may not be the user's to
        // describe — so the copy says that, rather than implying they are
        // missing out on a richer post.
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-violet-600"
            checked={includeAgentSummary}
            onChange={(event) =>
              onIncludeAgentSummaryChange(event.target.checked)
            }
          />
          <span className="min-w-0">
            <span className="text-sm text-zinc-900 dark:text-zinc-100">
              {t("settings.connectionDialog.agentSummaryToggle")}
            </span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              {t("settings.connectionDialog.agentSummaryHelp")}
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * MCP automation guidance
 * ------------------------------------------------------------------ */

/**
 * Guidance granularity — finer than the Connect-step tabs, whose generic tab
 * folds Windsurf, Kiro and Codex together but whose scheduling stories differ.
 */
export type McpGuidanceKey =
  | "claude-code"
  | "claude-desktop"
  | "codex"
  | "cursor"
  | "vscode"
  | "windsurf-kiro";

function getGuidanceOptions(
  t: TFunction,
): ReadonlyArray<{ value: McpGuidanceKey; label: string }> {
  return [
    { value: "claude-code", label: t("settings.provider.claudeCode") },
    { value: "claude-desktop", label: t("settings.mcp.claudeDesktop") },
    { value: "codex", label: t("wizard.schedule.tool.codex") },
    { value: "cursor", label: t("settings.mcp.cursor") },
    { value: "vscode", label: t("wizard.schedule.tool.copilot") },
    { value: "windsurf-kiro", label: t("wizard.schedule.tool.windsurfKiro") },
  ];
}

/**
 * Connect-step tab → guidance. The generic tab lands on Codex (first of its
 * trio) and the picker takes it from there; no tab chosen defaults to Claude
 * Code, the tool with the strongest scheduling story.
 *
 * Module-private: the mapping is only ever applied by `McpScheduleBody` below.
 */
function guidanceKeyForToolTab(tabKey: string | null): McpGuidanceKey {
  switch (tabKey) {
    case "claude-desktop":
      return "claude-desktop";
    case "cursor":
      return "cursor";
    case "vscode":
      return "vscode";
    case "generic":
      return "codex";
    default:
      return "claude-code";
  }
}

/** The prompt every scheduled run sends, cadence baked in for monthly. */
function workflowPrompt(cadence: WizardCadence, t: TFunction): string {
  return cadence === "monthly"
    ? t("wizard.schedule.promptMonthly")
    : t("wizard.schedule.promptDefault");
}

/** Mondays 9:00 for weekly/biweekly, the 1st for monthly. */
function cronPrefix(cadence: WizardCadence): string {
  return cadence === "monthly" ? "0 9 1 * *" : "0 9 * * 1";
}

function cronTarget(cadence: WizardCadence, t: TFunction): string {
  return cadence === "monthly"
    ? t("wizard.schedule.crontabMonthly")
    : t("wizard.schedule.crontabMondays");
}

type GuidancePath = {
  heading: string;
  body: string;
  snippet?: Snippet;
  note?: string;
};

/** ONE recommended path + one fallback per tool — never a wall of options. */
function buildGuidance(
  key: McpGuidanceKey,
  cadence: WizardCadence,
  t: TFunction,
): { recommended: GuidancePath; fallback: GuidancePath } {
  const prompt = workflowPrompt(cadence, t);
  const cadenceNoun =
    cadence === "weekly"
      ? "weekly"
      : cadence === "biweekly"
        ? "every-two-weeks"
        : "monthly";

  switch (key) {
    case "claude-code":
      return {
        recommended: {
          heading: t("wizard.schedule.claudeRoutines"),
          body: t("wizard.schedule.claudeRoutinesBody"),
          snippet: {
            target: t("wizard.schedule.routinePrompt"),
            language: "text",
            code: prompt,
          },
          note:
            cadence === "weekly"
              ? undefined
              : // The Routines UI has presets, not a cron box — saying so
                // stops the user hunting for a field that is not there.
                t("wizard.schedule.claudePickerLimits", {
                  cadenceNoun,
                  cadenceDetail:
                    cadence === "biweekly"
                      ? "two weeks on Monday"
                      : "month on the 1st",
                }),
        },
        fallback: {
          heading: t("wizard.schedule.cronFallback"),
          body: t("wizard.schedule.cronFallbackBody"),
          snippet: {
            target: cronTarget(cadence, t),
            language: "bash",
            code: `${cronPrefix(cadence)} claude -p "${prompt}" --allowedTools "mcp__crafthub"`,
          },
          note: t("wizard.schedule.cronAbsolutePath"),
        },
      };
    case "claude-desktop":
      return {
        recommended: {
          heading: t("wizard.schedule.desktopRecommended"),
          body: t("wizard.schedule.desktopBody"),
          snippet: {
            target: t("wizard.schedule.routinePrompt"),
            language: "text",
            code: prompt,
          },
        },
        fallback: {
          heading: t("wizard.schedule.calendarFallback"),
          body: t("wizard.schedule.calendarBody", { cadenceNoun }),
          // The trap worth naming: Cowork's scheduler looks like the obvious
          // answer and cannot work for a local stdio server.
          note: t("wizard.schedule.coworkWarning"),
        },
      };
    case "codex":
      return {
        recommended: {
          heading: t("wizard.schedule.codexAutomations"),
          body: t("wizard.schedule.codexAutomationsBody", { cadenceNoun }),
          snippet: {
            target: t("wizard.schedule.automationPrompt"),
            language: "text",
            code: t("wizard.schedule.promptShort"),
          },
        },
        fallback: {
          heading: t("wizard.schedule.cronFallbackShort"),
          body: t("wizard.schedule.codexCronWarning"),
        },
      };
    case "cursor":
      return {
        recommended: {
          heading: t("wizard.schedule.cursorCron"),
          body: t("wizard.schedule.cursorCronBody"),
          snippet: {
            target: cronTarget(cadence, t),
            language: "bash",
            code: `${cronPrefix(cadence)} agent -p "Run the crafthub weekly_update workflow"`,
          },
        },
        fallback: {
          heading: t("wizard.schedule.cursorAutomations"),
          body: t("wizard.schedule.cursorAutomationsBody"),
        },
      };
    case "vscode":
      return {
        recommended: {
          heading: t("wizard.schedule.copilotCron"),
          body: t("wizard.schedule.copilotCronBody"),
          snippet: {
            target: cronTarget(cadence, t),
            language: "bash",
            code: `${cronPrefix(cadence)} copilot -p "Run the crafthub weekly_update workflow" --allow-tool 'crafthub'`,
          },
          note: t("wizard.schedule.copilotMcpConfig"),
        },
        fallback: {
          heading: t("wizard.schedule.universalFallback"),
          body: t("wizard.schedule.noCron"),
        },
      };
    case "windsurf-kiro":
      return {
        recommended: {
          heading: t("wizard.schedule.kiroCron"),
          body: t("wizard.schedule.kiroCronBody"),
        },
        fallback: {
          heading: t("wizard.schedule.windsurfNoHeadless"),
          body: t("wizard.schedule.windsurfBody"),
        },
      };
  }
}

function GuidancePathBlock({ path }: Readonly<{ path: GuidancePath }>) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
        {path.heading}
      </p>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{path.body}</p>
      {path.snippet ? <SnippetBlock snippet={path.snippet} /> : null}
      {path.note ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{path.note}</p>
      ) : null}
    </div>
  );
}

/**
 * MCP has no server-side connection: the cadence here parameterizes the
 * guidance below, it PATCHes nothing. What makes the guidance safe to follow
 * is the duplicate guard inside the workflow prompt itself (apps/mcp
 * prompts/shared.ts) — a scheduled run that finds the period already covered
 * posts nothing.
 */
export function McpScheduleBody({
  cadence,
  onCadenceChange,
  toolKey,
}: Readonly<{
  cadence: WizardCadence;
  onCadenceChange: (cadence: WizardCadence) => void;
  /** Connect-step tab, threaded through the wizard; null if never picked. */
  toolKey: string | null;
}>) {
  const { t } = useTranslation();
  const cadenceHints = getCadenceHints(t);
  // Local: nothing downstream needs the switch, and remounting the step
  // re-derives it from the Connect-step choice.
  const [guidanceKey, setGuidanceKey] = useState<McpGuidanceKey>(() =>
    guidanceKeyForToolTab(toolKey),
  );
  const guidance = buildGuidance(guidanceKey, cadence, t);

  return (
    <div className="space-y-4">
      <div className={`space-y-2 p-4 ${SURFACE_INSET}`}>
        <span className="block text-sm text-zinc-700 dark:text-zinc-300">
          {t("settings.connections.cadence")}
        </span>
        <Segmented
          label={t("settings.connections.cadence")}
          value={cadence}
          options={[
            { value: "weekly", label: t("settings.cadence.weekly") },
            { value: "biweekly", label: t("settings.cadence.biweekly") },
            { value: "monthly", label: t("settings.cadence.monthly") },
          ]}
          onChange={onCadenceChange}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {cadenceHints[cadence]}
        </p>
        {cadence === "biweekly" ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {t("wizard.schedule.biweeklyCron")}
          </p>
        ) : null}
      </div>

      <div className={`space-y-3 p-4 ${SURFACE_INSET}`}>
        <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {t("wizard.schedule.title")}
        </span>
        <Segmented
          label={t("wizard.schedule.yourTool")}
          value={guidanceKey}
          options={getGuidanceOptions(t)}
          onChange={setGuidanceKey}
        />
        <GuidancePathBlock path={guidance.recommended} />
        <GuidancePathBlock path={guidance.fallback} />

        <details className="group rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
          <summary
            className={`flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 ${FOCUS_RING} rounded-md`}
          >
            {t("wizard.schedule.noSchedulerTitle")}
            <FiChevronDown
              className="ml-auto h-3.5 w-3.5 shrink-0 transition group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="mt-2 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <p>{t("wizard.schedule.noSchedulerBody")}</p>
            <ul className="list-disc space-y-0.5 pl-5">
              <li>
                <Trans
                  i18nKey="wizard.schedule.claudeCodeHint"
                  components={{ cmd: <code className="font-mono" /> }}
                />
              </li>
              <li>{t("wizard.schedule.claudeDesktopHint")}</li>
              <li>{t("wizard.schedule.anythingElseHint")}</li>
            </ul>
          </div>
        </details>

        <p className="flex items-start gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <FiShield
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          {t("wizard.schedule.duplicateSafe")}
        </p>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {t("wizard.schedule.mcpNoConnection")}
      </p>
    </div>
  );
}
