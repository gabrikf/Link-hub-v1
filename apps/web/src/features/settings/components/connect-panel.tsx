import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FiCheck, FiCopy, FiTerminal, FiZap } from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import { useClipboard } from "../lib/use-clipboard";

// The MCP server is NOT published to npm — it is run locally from the built
// entry point in this monorepo (see apps/mcp/README.md). Users first build it
// with `npm run build --workspace=mcp`, which produces apps/mcp/dist/index.js,
// then point their client at that absolute path via `node`.
const MCP_ENTRY = "/absolute/path/to/linkhub/apps/mcp/dist/index.js";

const TOKEN_PLACEHOLDER = "lh_pat_xxxxxxxxxxxxxxxxxxxxxxxx";

function resolveApiUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  return configured && configured.length > 0
    ? configured
    : "http://localhost:3333";
}

type Snippet = {
  /** File / target the snippet goes into, shown above the code block. */
  target: string;
  language: string;
  code: string;
};

type ToolTab = {
  key: string;
  label: string;
  snippets: Snippet[];
};

function buildTabs(apiUrl: string, token: string): ToolTab[] {
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

  const mcpJson = JSON.stringify(
    { mcpServers: { linkhub: mcpServerBlock } },
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

  const claudeCodeCli = [
    `claude mcp add linkhub \\`,
    `  --env LINKHUB_API_URL=${apiUrl} \\`,
    `  --env LINKHUB_API_TOKEN=${token} \\`,
    `  -- node ${MCP_ENTRY}`,
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
    },
  ];
}

function SnippetBlock({ snippet }: { snippet: Snippet }) {
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
          onClick={() => copy(snippet.code)}
        >
          {copied ? (
            <FiCheck className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <FiCopy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto bg-white p-3 text-xs leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
        <code>{snippet.code}</code>
      </pre>
    </div>
  );
}

type ConnectPanelProps = {
  /** The most recently created plaintext token, if any, to pre-fill snippets. */
  token: string | null;
};

export function ConnectPanel({ token }: ConnectPanelProps) {
  const apiUrl = useMemo(() => resolveApiUrl(), []);
  const effectiveToken = token ?? TOKEN_PLACEHOLDER;
  const tabs = useMemo(
    () => buildTabs(apiUrl, effectiveToken),
    [apiUrl, effectiveToken],
  );
  const [activeKey, setActiveKey] = useState(tabs[0]?.key ?? "");
  const tablistRef = useRef<HTMLDivElement | null>(null);

  const activeTab = tabs.find((tab) => tab.key === activeKey) ?? tabs[0];

  // Roving arrow-key navigation for the tool tablist.
  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key) || tabs.length === 0) {
      return;
    }
    event.preventDefault();
    const currentIndex = tabs.findIndex((tab) => tab.key === activeTab?.key);
    let nextIndex = currentIndex < 0 ? 0 : currentIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }
    const nextTab = tabs[nextIndex];
    if (nextTab) {
      setActiveKey(nextTab.key);
      tablistRef.current
        ?.querySelector<HTMLButtonElement>(`#connect-tab-${nextTab.key}`)
        ?.focus();
    }
  };

  return (
    <section className="anim-fade-up rounded-3xl border border-zinc-200 bg-white/70 p-5 backdrop-blur-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-start gap-3">
        <span className="anim-float flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
          <FiZap className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Connect your AI coding tools
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Drop one of these snippets into your editor to let its AI post to
            LinkHub for you. Then ask your AI:{" "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              &ldquo;summarize my commits this week and post them to
              LinkHub&rdquo;
            </span>
            .
          </p>
        </div>
      </div>

      {token ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
          <FiCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          Snippets below are pre-filled with the token you just created.
        </p>
      ) : (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          <FiTerminal className="h-4 w-4 shrink-0" aria-hidden="true" />
          Create a token above, then replace{" "}
          <code className="font-mono">{TOKEN_PLACEHOLDER}</code> with it.
        </p>
      )}

      <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
        First build the server:{" "}
        <code className="font-mono text-zinc-800 dark:text-zinc-200">
          npm run build --workspace=mcp
        </code>
        , then set{" "}
        <code className="font-mono">args</code> to the absolute path of your{" "}
        <code className="font-mono">apps/mcp/dist/index.js</code>.
      </p>

      <div
        ref={tablistRef}
        role="tablist"
        aria-label="AI tool"
        className="mt-4 flex flex-wrap gap-1.5"
        onKeyDown={handleTabKeyDown}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab?.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`connect-tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`connect-tabpanel-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveKey(tab.key)}
              className={[
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                isActive
                  ? "bg-violet-700 text-white shadow-sm dark:bg-violet-600"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab ? (
        <div
          role="tabpanel"
          id={`connect-tabpanel-${activeTab.key}`}
          aria-labelledby={`connect-tab-${activeTab.key}`}
          className="mt-4 space-y-3"
        >
          {activeTab.snippets.map((snippet) => (
            <SnippetBlock key={snippet.target} snippet={snippet} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
