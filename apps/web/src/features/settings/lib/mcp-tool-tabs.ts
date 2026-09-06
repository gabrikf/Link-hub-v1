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

// The MCP server ships on npm as `crafthub-mcp`, so every snippet below is
// zero-install: the host spawns `npx`, npm fetches the package on first run and
// caches it. There is deliberately nothing for the user to clone, build or
// path-resolve — this panel is read by developers who signed up to have their
// agent post for them, not by contributors to this repo.
export const MCP_PACKAGE = "crafthub-mcp";

// Pinned to `@latest` rather than a version this page would have to keep in
// step with the registry: the server and the API are released together, and a
// stale copy in the npx cache is the failure this avoids. `-y` skips npx's
// install prompt, which has no stdin to answer it inside an MCP host.
export const MCP_SPEC = `${MCP_PACKAGE}@latest`;

export const MCP_COMMAND = "npx";

export const MCP_ARGS = ["-y", MCP_SPEC];

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
  // Shared stdio server block: `npx -y crafthub-mcp@latest` with the API URL +
  // token in env. Mirrors apps/mcp/README.md exactly.
  const mcpServerBlock = {
    command: MCP_COMMAND,
    args: MCP_ARGS,
    env: {
      CRAFTHUB_API_URL: apiUrl,
      CRAFTHUB_API_TOKEN: token,
    },
  };

  // Claude Desktop's `claude_desktop_config.json`, Claude Code's project-scoped
  // `.mcp.json` and Cursor's `.cursor/mcp.json` all take this exact document —
  // once the command is `npx` there is no per-host path left to differ. Only VS
  // Code needs its own shape (`servers`, plus an explicit `type`).
  const mcpServersJson = JSON.stringify(
    { mcpServers: { crafthub: mcpServerBlock } },
    null,
    2,
  );

  const vscodeJson = JSON.stringify(
    {
      servers: {
        crafthub: {
          type: "stdio",
          command: MCP_COMMAND,
          args: MCP_ARGS,
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

  // Genuinely zero-edit: copy, paste, run from anywhere.
  const claudeCodeCli = [
    `claude mcp add crafthub \\`,
    `  --env CRAFTHUB_API_URL=${apiUrl} \\`,
    `  --env CRAFTHUB_API_TOKEN=${token} \\`,
    `  -- ${MCP_COMMAND} ${MCP_ARGS.join(" ")}`,
  ].join("\n");

  return [
    {
      key: "claude-desktop",
      label: t("settings.mcp.claudeDesktop"),
      snippets: [
        {
          target: "claude_desktop_config.json",
          language: "json",
          code: mcpServersJson,
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
          code: mcpServersJson,
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
          code: mcpServersJson,
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
          code: mcpServersJson,
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
