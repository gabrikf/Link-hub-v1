import type { Snippet } from "../components/snippet-block";

/**
 * The per-host MCP setup snippets, extracted from `connect-panel.tsx` when the
 * auto-post wizard needed the same tabs. One definition, two surfaces — a fork
 * would have drifted the first time a host changed its config shape.
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
export const MCP_ENTRY = "/absolute/path/to/linkhub/apps/mcp/dist/index.js";

/** Resolves the repo root from anywhere inside the checkout. */
export const ENTRY_SHELL_EXPR =
  '"$(git rev-parse --show-toplevel)/apps/mcp/dist/index.js"';

export const BUILD_COMMAND = "npm run build --workspace=mcp";

export const PATH_COMMAND = `echo ${ENTRY_SHELL_EXPR}`;

export const TOKEN_PLACEHOLDER = "lh_pat_xxxxxxxxxxxxxxxxxxxxxxxx";

/** The prompt the MCP server registers — see apps/mcp/src/prompts. */
export const PROMPT_NAME = "weekly_update";

/** Works in any host, even one that doesn't surface MCP prompts in its UI. */
export const PLAIN_LANGUAGE_ASK =
  "Use the LinkHub weekly_update prompt to turn this week's commits into a post.";

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

export function buildTabs(apiUrl: string, token: string): ToolTab[] {
  // Shared stdio server block: `node <absolute path to built entry>` with the
  // API URL + token in env. Mirrors apps/mcp/README.md exactly.
  const mcpServerBlock = {
    command: "node",
    args: [MCP_ENTRY],
    env: {
      LINKHUB_API_URL: apiUrl,
      LINKHUB_API_TOKEN: token,
    },
  };

  const claudeDesktopConfig = JSON.stringify(
    { mcpServers: { linkhub: mcpServerBlock } },
    null,
    2,
  );

  // Project-scoped `.mcp.json` lives at the repo root, so a repo-relative path
  // works and needs no editing at all. Mirrors apps/mcp/README.md.
  const mcpJson = JSON.stringify(
    {
      mcpServers: {
        linkhub: {
          command: "node",
          args: ["./apps/mcp/dist/index.js"],
          env: {
            LINKHUB_API_URL: apiUrl,
            LINKHUB_API_TOKEN: token,
          },
        },
      },
    },
    null,
    2,
  );

  const cursorJson = JSON.stringify(
    { mcpServers: { linkhub: mcpServerBlock } },
    null,
    2,
  );

  const vscodeJson = JSON.stringify(
    {
      servers: {
        linkhub: {
          type: "stdio",
          command: "node",
          args: [MCP_ENTRY],
          env: {
            LINKHUB_API_URL: apiUrl,
            LINKHUB_API_TOKEN: token,
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
    `claude mcp add linkhub \\`,
    `  --env LINKHUB_API_URL=${apiUrl} \\`,
    `  --env LINKHUB_API_TOKEN=${token} \\`,
    `  -- node ${ENTRY_SHELL_EXPR}`,
  ].join("\n");

  return [
    {
      key: "claude-desktop",
      label: "Claude Desktop",
      snippets: [
        {
          target: "claude_desktop_config.json",
          language: "json",
          code: claudeDesktopConfig,
        },
      ],
      verify: [
        "Fully quit and reopen Claude Desktop — it only reads the config at startup.",
        'Open the tools menu in the composer: "linkhub" should be listed with 7 tools.',
        'Ask "list my LinkHub posts" — a token problem shows up here as an "Invalid or expired LinkHub token" error.',
      ],
      invokeLabel: "Composer → attachments (+) → linkhub",
      // NOT a slash command. Claude Desktop has no /-prefixed MCP prompts, and
      // showing one in a copy box sends people to type `/weekly_update` and
      // get "Unknown command" — the single most common support question this
      // panel caused.
      invokeCommand: `+ menu → linkhub → ${PROMPT_NAME}`,
      invokeNote:
        "Claude Desktop lists MCP prompts under the + button in the composer, not as slash commands — typing /weekly_update there does nothing. Pick weekly_update, optionally set period / repo / status, and send. Asking in plain language (\"write my LinkHub weekly update\") works too.",
    },
    {
      key: "claude-code",
      label: "Claude Code",
      snippets: [
        {
          target: "Terminal (claude mcp add)",
          language: "bash",
          code: claudeCodeCli,
        },
        {
          target: ".mcp.json (project scope)",
          language: "json",
          code: mcpJson,
        },
      ],
      verify: [
        "Run /mcp inside Claude Code — linkhub should read “connected”.",
        "From a shell, claude mcp list prints the same status without opening a session.",
        'Ask "list my LinkHub posts" to prove the token works end to end.',
      ],
      invokeLabel: "Slash command",
      invokeCommand: `/mcp__linkhub__${PROMPT_NAME}`,
      invokeNote:
        "MCP prompts appear as /mcp__server__prompt — plain /weekly_update will not exist. Add arguments space-separated, e.g. /mcp__linkhub__weekly_update monthly. There is also /mcp__linkhub__since_last_post, which only covers work done since your last LinkHub update.",
    },
    {
      key: "cursor",
      label: "Cursor",
      snippets: [
        {
          target: ".cursor/mcp.json",
          language: "json",
          code: cursorJson,
        },
      ],
      verify: [
        "Open Settings → MCP: linkhub should show a green dot and its tool list.",
        'If it stays red, the args path is wrong — re-run the path command under "Running LinkHub locally?".',
        'Ask "list my LinkHub posts" in chat to confirm the token.',
      ],
      invokeLabel: "Chat",
      invokeCommand: PLAIN_LANGUAGE_ASK,
      invokeNote:
        "Cursor surfaces MCP prompts in the chat / menu on recent versions. If yours doesn't, just ask in plain language — the tool descriptions and the linkhub://guides/post-quality resource carry the same instructions.",
    },
    {
      key: "vscode",
      label: "VS Code",
      snippets: [
        {
          target: ".vscode/mcp.json",
          language: "json",
          code: vscodeJson,
        },
      ],
      verify: [
        "Run the MCP: List Servers command — linkhub should be Running.",
        "VS Code asks for confirmation before starting a server the first time; accept it.",
        'Ask "list my LinkHub posts" in Chat to confirm the token.',
      ],
      invokeLabel: "Slash command in Chat",
      invokeCommand: `/mcp.linkhub.${PROMPT_NAME}`,
      invokeNote:
        "VS Code exposes MCP prompts as /mcp.<server>.<prompt> in the Chat view. It will ask you for period, repo and status.",
    },
    {
      key: "generic",
      label: "Windsurf / Kiro / Codex",
      snippets: [
        {
          target: "mcpServers (your tool's MCP config file)",
          language: "json",
          code: claudeDesktopConfig,
        },
      ],
      verify: [
        "Any MCP-capable agent accepts this shape — put it in the tool's MCP config file (Windsurf: mcp_config.json, Kiro: .kiro/settings/mcp.json, Codex CLI: config.toml's equivalent block).",
        "Restart the tool, then check its MCP/server list for linkhub.",
        'Ask "list my LinkHub posts" to prove the token works end to end.',
      ],
      invokeLabel: "Chat",
      invokeCommand: PLAIN_LANGUAGE_ASK,
      invokeNote:
        "If your tool surfaces MCP prompts, run weekly_update from its prompt picker; if not, the plain-language ask above triggers the same workflow.",
    },
  ];
}
