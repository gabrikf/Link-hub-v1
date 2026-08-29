import type { TFunction } from "i18next";
import type { Snippet } from "../components/snippet-block";

/**
 * The per-host MCP setup snippets, extracted from `connect-panel.tsx` when the
 * auto-post wizard needed the same tabs. One definition, two surfaces — a fork
 * would have drifted the first time a host changed its config shape.
 *
 * `buildTabs` takes `t` because `connect-step.tsx` in the (out-of-scope,
 * separately in-flight) `auto-post-wizard/` directory already calls it as
 * `buildTabs(t, apiUrl, token)` — its own i18n pass got here first for this
 * one function. `PLAIN_LANGUAGE_ASK` is converted alongside it since nothing
 * outside this file imports it directly.
 */

// The MCP server is NOT published to npm — it is run locally from the built
// entry point in this monorepo (see apps/mcp/README.md). Users first build it
// with `npm run build --workspace=mcp`, which produces apps/mcp/dist/index.js,
// then point their client at that absolute path via `node`.
//
// We can't know the user's checkout location from the browser, so the JSON
// snippets carry this placeholder — but PATH_COMMAND below prints the real
// value in one copy-paste, and the Claude Code CLI snippet resolves it inline
// so that path never has to be typed by hand at all.
export const MCP_ENTRY = "/absolute/path/to/crafthub/apps/mcp/dist/index.js";

/** Resolves the repo root from anywhere inside the checkout. */
export const ENTRY_SHELL_EXPR =
  '"$(git rev-parse --show-toplevel)/apps/mcp/dist/index.js"';

export const BUILD_COMMAND = "npm run build --workspace=mcp";

export const PATH_COMMAND = `echo ${ENTRY_SHELL_EXPR}`;

export const TOKEN_PLACEHOLDER = "lh_pat_xxxxxxxxxxxxxxxxxxxxxxxx";

/** The prompt the MCP server registers — see apps/mcp/src/prompts. */
export const PROMPT_NAME = "weekly_update";

/** Works in any host, even one that doesn't surface MCP prompts in its UI. */
export function getPlainLanguageAsk(t: TFunction): string {
  return t("settings.mcp.plainAsk");
}

export type ToolTab = {
  key: string;
  label: string;
  snippets: Snippet[];
  /** How to confirm this host actually loaded the server. */
  verify: string[];
  /** Label for the invocation control in this host, e.g. "Slash command". */
  invokeLabel: string;
  /** The literal thing the user types to run the workflow prompt. */
  invokeCommand: string;
  /** Extra caveat shown under the invocation snippet. */
  invokeNote?: string;
};

export function buildTabs(
  t: TFunction,
  apiUrl: string,
  token: string,
): ToolTab[] {
  // Shared stdio server block: `node <absolute path to built entry>` with the
  // API URL + token in env. Mirrors apps/mcp/README.md exactly.
  const mcpServerBlock = {
    command: "node",
    args: [MCP_ENTRY],
    env: {
      CRAFTHUB_API_URL: apiUrl,
      CRAFTHUB_API_TOKEN: token,
    },
  };

  const claudeDesktopConfig = JSON.stringify(
    { mcpServers: { crafthub: mcpServerBlock } },
    null,
    2,
  );

  // Project-scoped `.mcp.json` lives at the repo root, so a repo-relative path
  // works and needs no editing at all. Mirrors apps/mcp/README.md.
  const mcpJson = JSON.stringify(
    {
      mcpServers: {
        crafthub: {
          command: "node",
          args: ["./apps/mcp/dist/index.js"],
          env: {
            CRAFTHUB_API_URL: apiUrl,
            CRAFTHUB_API_TOKEN: token,
          },
        },
      },
    },
    null,
    2,
  );

  const cursorJson = JSON.stringify(
    { mcpServers: { crafthub: mcpServerBlock } },
    null,
    2,
  );

  const vscodeJson = JSON.stringify(
    {
      servers: {
        crafthub: {
          type: "stdio",
          command: "node",
          args: [MCP_ENTRY],
          env: {
            CRAFTHUB_API_URL: apiUrl,
            CRAFTHUB_API_TOKEN: token,
          },
        },
      },
    },
    null,
    2,
  );

  // Resolves the entry path inline, so this one is genuinely zero-edit: copy,
  // paste, run from anywhere inside the repo.
  const claudeCodeCli = [
    `claude mcp add crafthub \\`,
    `  --env CRAFTHUB_API_URL=${apiUrl} \\`,
    `  --env CRAFTHUB_API_TOKEN=${token} \\`,
    `  -- node ${ENTRY_SHELL_EXPR}`,
  ].join("\n");

  return [
    {
      key: "claude-desktop",
      label: t("settings.mcp.claudeDesktop"),
      snippets: [
        {
          target: "claude_desktop_config.json",
          language: "json",
          code: claudeDesktopConfig,
        },
      ],
      verify: [
        t("settings.mcp.claudeDesktopRestart"),
        t("settings.mcp.claudeDesktopTools"),
        t("settings.mcp.claudeDesktopAsk"),
      ],
      invokeLabel: t("settings.mcp.claudeDesktopComposer"),
      // NOT a slash command. Claude Desktop has no /-prefixed MCP prompts, and
      // showing one in a copy box sends people to type `/weekly_update` and
      // get "Unknown command" — the single most common support question this
      // panel caused. Left as a literal: not in the canonical string map, and
      // it mixes navigation copy with the technical PROMPT_NAME identifier.
      invokeCommand: `+ menu → crafthub → ${PROMPT_NAME}`,
      invokeNote: t("settings.mcp.claudeDesktopPrompts"),
    },
    {
      key: "claude-code",
      label: t("settings.provider.claudeCode"),
      snippets: [
        {
          target: t("settings.mcp.claudeCodeTerminal"),
          language: "bash",
          code: claudeCodeCli,
        },
        {
          target: t("settings.mcp.claudeCodeProject"),
          language: "json",
          code: mcpJson,
        },
      ],
      verify: [
        t("settings.mcp.claudeCodeVerify"),
        t("settings.mcp.claudeCodeList"),
        t("settings.mcp.claudeCodeAsk"),
      ],
      invokeLabel: t("settings.mcp.slashCommand"),
      invokeCommand: `/mcp__crafthub__${PROMPT_NAME}`,
      invokeNote: t("settings.mcp.claudeCodePrompts"),
    },
    {
      key: "cursor",
      label: t("settings.mcp.cursor"),
      snippets: [
        {
          target: ".cursor/mcp.json",
          language: "json",
          code: cursorJson,
        },
      ],
      verify: [
        t("settings.mcp.cursorVerify"),
        t("settings.mcp.cursorRed"),
        t("settings.mcp.cursorAsk"),
      ],
      invokeLabel: t("settings.mcp.chat"),
      invokeCommand: getPlainLanguageAsk(t),
      invokeNote: t("settings.mcp.cursorPrompts"),
    },
    {
      key: "vscode",
      label: t("settings.mcp.vscode"),
      snippets: [
        {
          target: ".vscode/mcp.json",
          language: "json",
          code: vscodeJson,
        },
      ],
      verify: [
        t("settings.mcp.vscodeVerify"),
        t("settings.mcp.vscodeConfirm"),
        t("settings.mcp.vscodeAsk"),
      ],
      invokeLabel: t("settings.mcp.vscodeSlash"),
      invokeCommand: `/mcp.crafthub.${PROMPT_NAME}`,
      invokeNote: t("settings.mcp.vscodePrompts"),
    },
    {
      key: "generic",
      label: t("settings.mcp.others"),
      snippets: [
        {
          target: t("settings.mcp.othersConfig"),
          language: "json",
          code: claudeDesktopConfig,
        },
      ],
      verify: [
        t("settings.mcp.othersShape"),
        t("settings.mcp.othersRestart"),
        t("settings.mcp.claudeCodeAsk"),
      ],
      invokeLabel: t("settings.mcp.chat"),
      invokeCommand: getPlainLanguageAsk(t),
      invokeNote: t("settings.mcp.othersPrompts"),
    },
  ];
}
