import type { DigestCadence } from "@repo/schemas";
import { useState } from "react";
import { FiChevronDown, FiInfo, FiShield } from "react-icons/fi";
import {
  FOCUS_RING,
  SURFACE_INSET,
} from "../../../../shared-components/surface";
import { SnippetBlock, type Snippet } from "../snippet-block";
import { Segmented } from "./wizard-shared";

/**
 * The cadences the wizard offers. `off` is a settings-row decision, not a
 * setup one, and weekly is the floor — daily was removed on purpose so a
 * profile can never turn into a commit firehose.
 */
export type WizardCadence = Extract<
  DigestCadence,
  "weekly" | "biweekly" | "monthly"
>;

const CADENCE_HINTS: Record<WizardCadence, string> = {
  weekly: "The goal: one post a week.",
  biweekly:
    "Every two weeks — pair two machines or accounts to alternate and still add up to weekly.",
  monthly: "One larger digest a month.",
};

export function ScheduleStepBody({
  cadence,
  onCadenceChange,
  autoPostEnabled,
  onAutoPostChange,
  showAgentSummaryToggle,
  includeAgentSummary,
  onIncludeAgentSummaryChange,
}: {
  cadence: WizardCadence;
  onCadenceChange: (cadence: WizardCadence) => void;
  autoPostEnabled: boolean;
  onAutoPostChange: (enabled: boolean) => void;
  /** Only the Claude Code hook has an agent summary to send. */
  showAgentSummaryToggle: boolean;
  includeAgentSummary: boolean;
  onIncludeAgentSummaryChange: (enabled: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className={`space-y-2 p-4 ${SURFACE_INSET}`}>
        <span className="block text-sm text-zinc-700 dark:text-zinc-300">
          Digest cadence
        </span>
        <Segmented
          label="Digest cadence"
          value={cadence}
          options={[
            { value: "weekly", label: "Weekly" },
            { value: "biweekly", label: "Every two weeks" },
            { value: "monthly", label: "Monthly" },
          ]}
          onChange={onCadenceChange}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {CADENCE_HINTS[cadence]}
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
            Post digests automatically
          </span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            Off means digests are still generated on this cadence, but wait for
            you to approve them.
          </span>
        </span>
      </label>

      <p className="flex items-start gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        <FiInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Recommendation: keep auto-posting off until a few digests looked right
        in the review queue, then flip it on from the connection row.
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
              Send the coding agent&apos;s own description of each task
            </span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              Off by default. That text is prose a model wrote about what you
              were working on, and on a work machine it can describe systems,
              decisions and problems that are your employer&apos;s to describe,
              not yours. Without it, only hashed, aggregated metadata is sent.
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

const GUIDANCE_OPTIONS: ReadonlyArray<{
  value: McpGuidanceKey;
  label: string;
}> = [
  { value: "claude-code", label: "Claude Code" },
  { value: "claude-desktop", label: "Claude Desktop" },
  { value: "codex", label: "Codex" },
  { value: "cursor", label: "Cursor" },
  { value: "vscode", label: "VS Code + Copilot" },
  { value: "windsurf-kiro", label: "Windsurf / Kiro" },
];

/**
 * Connect-step tab → guidance. The generic tab lands on Codex (first of its
 * trio) and the picker takes it from there; no tab chosen defaults to Claude
 * Code, the tool with the strongest scheduling story.
 */
export function guidanceKeyForToolTab(tabKey: string | null): McpGuidanceKey {
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
function workflowPrompt(cadence: WizardCadence): string {
  return cadence === "monthly"
    ? "Run the linkhub weekly_update workflow with period monthly and create my post"
    : "Run the linkhub weekly_update workflow and create my post";
}

/** Mondays 9:00 for weekly/biweekly, the 1st for monthly. */
function cronPrefix(cadence: WizardCadence): string {
  return cadence === "monthly" ? "0 9 1 * *" : "0 9 * * 1";
}

function cronTarget(cadence: WizardCadence): string {
  return cadence === "monthly"
    ? "crontab — 1st of the month, 09:00"
    : "crontab — Mondays at 09:00";
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
): { recommended: GuidancePath; fallback: GuidancePath } {
  const prompt = workflowPrompt(cadence);
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
          heading: "Recommended — Routines in the Claude Code Desktop app",
          body:
            "Routines → New routine → Local, then pick the Weekly preset " +
            "(day and time) and paste the prompt below. Local routines run " +
            "sessions on this machine, so they see your local MCP servers — " +
            "and a run missed while the machine slept fires one catch-up on " +
            "wake.",
          snippet: {
            target: "Routine prompt",
            language: "text",
            code: prompt,
          },
          note:
            cadence === "weekly"
              ? undefined
              : // The Routines UI has presets, not a cron box — saying so
                // stops the user hunting for a field that is not there.
                `The schedule picker offers Hourly / Daily / Weekdays / Weekly, with no cron box. For ${cadenceNoun}, ask in chat instead: "every ${cadence === "biweekly" ? "two weeks on Monday" : "month on the 1st"} at 9am, run my LinkHub update" — Claude creates the task itself.`,
        },
        fallback: {
          heading: "Fallback — cron + headless CLI",
          body: "The same workflow, headless, on the OS scheduler:",
          snippet: {
            target: cronTarget(cadence),
            language: "bash",
            code: `${cronPrefix(cadence)} claude -p "${prompt}" --allowedTools "mcp__linkhub"`,
          },
          note:
            "Use an absolute path to claude in cron. On macOS prefer launchd " +
            "— cron skips runs while the machine sleeps; launchd fires missed " +
            "jobs on wake.",
        },
      };
    case "claude-desktop":
      return {
        recommended: {
          heading: "Recommended — schedule it from Claude Code Desktop",
          body:
            "Real scheduling lives in the Claude Code Desktop app: Routines " +
            "→ New routine → Local → Weekly. Local routines reach local MCP " +
            "servers, so add linkhub to Claude Code as well (the Claude Code " +
            "tab in the previous step has the one-line command) — the chat " +
            "app's claude_desktop_config.json is a separate config.",
          snippet: {
            target: "Routine prompt",
            language: "text",
            code: prompt,
          },
        },
        fallback: {
          heading: "Fallback — a calendar reminder",
          body:
            `A ${cadenceNoun} reminder, then run it by hand from the ` +
            "composer: + menu → linkhub → weekly_update.",
          // The trap worth naming: Cowork's scheduler looks like the obvious
          // answer and cannot work for a local stdio server.
          note:
            "Cowork's Scheduled tasks are not the tool for this: they run " +
            "remotely, so they cannot open your repositories or reach a " +
            "linkhub server running on your machine.",
        },
      };
    case "codex":
      return {
        recommended: {
          heading: "Recommended — Codex app Automations",
          body: `Codex → Automations → new ${cadenceNoun} automation with this prompt:`,
          snippet: {
            target: "Automation prompt",
            language: "text",
            code: "Run the linkhub weekly_update workflow",
          },
        },
        fallback: {
          heading: "Fallback — cron",
          body:
            "codex exec in cron currently auto-cancels MCP tool calls unless " +
            "run with its approvals-bypass flag — prefer the app Automation.",
        },
      };
    case "cursor":
      return {
        recommended: {
          heading: "Recommended — cron + the Cursor agent CLI",
          body:
            "The CLI shares the IDE's MCP config, so linkhub is already " +
            "there, and cron runs it on this machine:",
          snippet: {
            target: cronTarget(cadence),
            language: "bash",
            code: `${cronPrefix(cadence)} agent -p "Run the linkhub weekly_update workflow"`,
          },
        },
        fallback: {
          heading: "Cursor Automations — only for a hosted setup",
          body:
            "Automations schedule prompts in Cursor's cloud sandbox, which " +
            "cannot reach a linkhub server running on your machine. Use them " +
            "only if you point LinkHub at a remote API instead.",
        },
      };
    case "vscode":
      return {
        recommended: {
          heading: "Recommended — cron + Copilot CLI",
          body: "Copilot's CLI runs the workflow headless on the OS scheduler:",
          snippet: {
            target: cronTarget(cadence),
            language: "bash",
            code: `${cronPrefix(cadence)} copilot -p "Run the linkhub weekly_update workflow" --allow-tool 'linkhub'`,
          },
          note:
            "Copilot CLI reads MCP servers from ~/.copilot/mcp-config.json — " +
            "add linkhub there if it only lives in .vscode/mcp.json.",
        },
        fallback: {
          heading: "Fallback — the universal reminder",
          body:
            "No cron on this machine? The universal fallback below covers " +
            "VS Code too.",
        },
      };
    case "windsurf-kiro":
      return {
        recommended: {
          heading: "Recommended — Kiro: cron + headless CLI",
          body:
            "Kiro runs headless from cron — pass --trust-tools so the " +
            "scheduled run can call linkhub without a human at the approval " +
            "prompt.",
        },
        fallback: {
          heading: "Windsurf — no headless mode",
          body:
            "Windsurf cannot run without its UI — use the universal fallback " +
            "below.",
        },
      };
  }
}

function GuidancePathBlock({ path }: { path: GuidancePath }) {
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
}: {
  cadence: WizardCadence;
  onCadenceChange: (cadence: WizardCadence) => void;
  /** Connect-step tab, threaded through the wizard; null if never picked. */
  toolKey: string | null;
}) {
  // Local: nothing downstream needs the switch, and remounting the step
  // re-derives it from the Connect-step choice.
  const [guidanceKey, setGuidanceKey] = useState<McpGuidanceKey>(() =>
    guidanceKeyForToolTab(toolKey),
  );
  const guidance = buildGuidance(guidanceKey, cadence);

  return (
    <div className="space-y-4">
      <div className={`space-y-2 p-4 ${SURFACE_INSET}`}>
        <span className="block text-sm text-zinc-700 dark:text-zinc-300">
          Cadence
        </span>
        <Segmented
          label="Cadence"
          value={cadence}
          options={[
            { value: "weekly", label: "Weekly" },
            { value: "biweekly", label: "Every two weeks" },
            { value: "monthly", label: "Monthly" },
          ]}
          onChange={onCadenceChange}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {CADENCE_HINTS[cadence]}
        </p>
        {cadence === "biweekly" ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Plain cron can't express "every two weeks" — keep the weekly
            schedule (the duplicate guard makes the off-week run a no-op that
            posts nothing), or use your OS scheduler's own biweekly trigger
            where it exists (Task Scheduler, launchd).
          </p>
        ) : null}
      </div>

      <div className={`space-y-3 p-4 ${SURFACE_INSET}`}>
        <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Make it automatic
        </span>
        <Segmented
          label="Your tool"
          value={guidanceKey}
          options={GUIDANCE_OPTIONS}
          onChange={setGuidanceKey}
        />
        <GuidancePathBlock path={guidance.recommended} />
        <GuidancePathBlock path={guidance.fallback} />

        <details className="group rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
          <summary
            className={`flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 ${FOCUS_RING} rounded-md`}
          >
            No scheduler at all? The universal fallback
            <FiChevronDown
              className="ml-auto h-3.5 w-3.5 shrink-0 transition group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="mt-2 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <p>
              A repeating calendar reminder plus one minute: open your agent
              and run the prompt.
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              <li>
                Claude Code:{" "}
                <code className="font-mono">/mcp__linkhub__weekly_update</code>
              </li>
              <li>Claude Desktop: + menu → linkhub → weekly_update</li>
              <li>
                Anything else: pick weekly_update from the tool's prompt
                picker, or just ask for it in plain language.
              </li>
            </ul>
          </div>
        </details>

        <p className="flex items-start gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <FiShield className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Every scheduled run is duplicate-safe: the workflow checks your
          recent posts first and skips if this period is already covered.
        </p>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        There is no connection to configure on LinkHub's side for MCP — nothing
        else to save here. Every run's post lands in your review queue pending
        your approval.
      </p>
    </div>
  );
}
