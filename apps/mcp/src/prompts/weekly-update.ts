import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DisclosureContext } from "../disclosure.js";
import { buildWorkflowText } from "./shared.js";

const argsSchema = {
  period: z
    .string()
    .optional()
    .describe(
      "Time span to summarize: 'daily', 'weekly' (default), 'monthly', a date " +
        "range like '2026-07-14..2026-07-21', or any git date expression such " +
        "as '3 days ago'.",
    ),
  repo: z
    .string()
    .optional()
    .describe(
      "Repository name to summarize, e.g. 'linkhub-v.1'. Defaults to the git " +
        "repository in the current working directory.",
    ),
  status: z
    .string()
    .optional()
    .describe(
      "'published' (default) or 'draft'. Use 'draft' to review the post in " +
        "LinkHub before it goes live.",
    ),
};

interface Window {
  readonly label: string;
  /** Instruction block telling the agent how to bound `git log`. */
  readonly establish: string;
  /** Value forwarded to the tool's `period` argument. */
  readonly value: string;
}

const PRESETS: Record<string, { label: string; since: string }> = {
  daily: { label: "the last 24 hours", since: "1 day ago" },
  today: { label: "today", since: "midnight" },
  weekly: { label: "the last 7 days", since: "7 days ago" },
  week: { label: "the last 7 days", since: "7 days ago" },
  monthly: { label: "the last 30 days", since: "30 days ago" },
  month: { label: "the last 30 days", since: "30 days ago" },
};

function sinceBlock(label: string, since: string): string {
  return `The window is **${label}**. Wherever \`<START>\` appears below, use \`--since="${since}"\`.`;
}

/** Turns the free-form `period` argument into a concrete git time window. */
function resolveWindow(period?: string): Window {
  const raw = period?.trim();
  if (!raw) {
    const preset = PRESETS.weekly!;
    return {
      label: preset.label,
      establish: sinceBlock(preset.label, preset.since),
      value: "weekly",
    };
  }

  const preset = PRESETS[raw.toLowerCase()];
  if (preset) {
    return {
      label: preset.label,
      establish: sinceBlock(preset.label, preset.since),
      value: raw.toLowerCase(),
    };
  }

  const range = raw.split("..");
  if (range.length === 2 && range[0]?.trim() && range[1]?.trim()) {
    const from = range[0]!.trim();
    const to = range[1]!.trim();
    return {
      label: `${from} → ${to}`,
      establish: `The window is the explicit range **${from} → ${to}**. Add \`--since="${from}" --until="${to}"\` to every \`git log\` below; that pair replaces \`<START>\` everywhere. If those look like git refs rather than dates, use \`git log ${from}..${to}\` instead.`,
      value: raw,
    };
  }

  return {
    label: raw,
    establish: `The user described the window as **${raw}**. Treat it as a git date expression: \`--since="${raw}"\`. If git cannot parse it, ask the user for a concrete date range before continuing.`,
    value: raw,
  };
}

/**
 * `weekly_update` — the headline prompt.
 *
 * Invoking it hands the host agent the complete commits-to-post workflow: how
 * to read the git history, which facts to extract, the LinkHub house style, the
 * safety pass, and the exact `create_commit_summary_post` field mapping. The
 * user never has to paste any rules of their own.
 */
export function registerWeeklyUpdate(
  server: McpServer,
  disclosure: DisclosureContext,
): void {
  server.registerPrompt(
    "weekly_update",
    {
      title: "Turn my commits into a LinkHub post",
      description:
        "Summarize recent git work into a recruiter-quality LinkHub post. " +
        "Walks you through reading the git log for the period, extracting what " +
        "actually shipped and its impact, writing it in LinkHub house style " +
        "(outcome over mechanics, real metrics, named stack), stripping " +
        "secrets and internal identifiers, and publishing with " +
        "create_commit_summary_post. Arguments: period, repo, status.",
      argsSchema,
    },
    (args) => {
      const window = resolveWindow(args.period);
      const status =
        args.status?.trim().toLowerCase() === "draft" ? "draft" : "published";

      return {
        description: `Turn ${window.label} of commits${
          args.repo ? ` in ${args.repo}` : ""
        } into a LinkHub post`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: buildWorkflowText({
                windowLabel: window.label,
                establishWindow: window.establish,
                periodValue: window.value,
                repo: args.repo?.trim() || undefined,
                status,
                disclosureLevel: disclosure,
              }),
            },
          },
        ],
      };
    },
  );
}
