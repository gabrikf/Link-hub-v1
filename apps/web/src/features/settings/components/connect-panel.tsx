import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  FiAlertTriangle,
  FiCheck,
  FiCheckCircle,
  FiChevronDown,
  FiCopy,
  FiGitCommit,
  FiPlay,
  FiShield,
  FiTerminal,
  FiThumbsDown,
  FiThumbsUp,
  FiZap,
} from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import {
  FOCUS_RING,
  SURFACE_GLASS,
} from "../../../shared-components/surface";
import { CONNECT_PANEL_ID, resolveApiUrl } from "../lib/mcp-config";
import { DISCLOSURE_PANEL_ID } from "./disclosure-panel";
import { useClipboard } from "../lib/use-clipboard";

// The MCP server is NOT published to npm — it is run locally from the built
// entry point in this monorepo (see apps/mcp/README.md). Users first build it
// with `npm run build --workspace=mcp`, which produces apps/mcp/dist/index.js,
// then point their client at that absolute path via `node`.
//
// We can't know the user's checkout location from the browser, so the JSON
// snippets carry this placeholder — but PATH_COMMAND below prints the real
// value in one copy-paste, and the Claude Code CLI snippet resolves it inline
// so that path never has to be typed by hand at all.
const MCP_ENTRY = "/absolute/path/to/linkhub/apps/mcp/dist/index.js";

/** Resolves the repo root from anywhere inside the checkout. */
const ENTRY_SHELL_EXPR =
  '"$(git rev-parse --show-toplevel)/apps/mcp/dist/index.js"';

const BUILD_COMMAND = "npm run build --workspace=mcp";

const PATH_COMMAND = `echo ${ENTRY_SHELL_EXPR}`;

const TOKEN_PLACEHOLDER = "lh_pat_xxxxxxxxxxxxxxxxxxxxxxxx";

/** The prompt the MCP server registers — see apps/mcp/src/prompts. */
const PROMPT_NAME = "weekly_update";

/** Works in any host, even one that doesn't surface MCP prompts in its UI. */
const PLAIN_LANGUAGE_ASK =
  "Use the LinkHub weekly_update prompt to turn this week's commits into a post.";

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

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
  /** How to confirm this host actually loaded the server. */
  verify: string[];
  /** Label for the invocation control in this host, e.g. "Slash command". */
  invokeLabel: string;
  /** The literal thing the user types to run the workflow prompt. */
  invokeCommand: string;
  /** Extra caveat shown under the invocation snippet. */
  invokeNote?: string;
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
      invokeCommand: `/${PROMPT_NAME}`,
      invokeNote:
        "Claude Desktop lists MCP prompts under the + button in the composer. Pick weekly_update, optionally set period / repo / status, and send.",
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
      invokeCommand: `/linkhub:${PROMPT_NAME}`,
      invokeNote:
        "MCP prompts appear as /server:prompt. Add arguments after it, e.g. /linkhub:weekly_update monthly. There is also /linkhub:since_last_post, which only covers work done since your last LinkHub update.",
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

type StepProps = {
  index: number;
  title: string;
  children: ReactNode;
};

/** Numbered step wrapper so the whole panel reads as one ordered flow. */
function Step({ index, title, children }: StepProps) {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">
          {index}
        </span>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h3>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

type ExampleCardProps = {
  tone: "weak" | "strong";
  title: string;
  caption: string;
  children: ReactNode;
};

function ExampleCard({ tone, title, caption, children }: ExampleCardProps) {
  const isWeak = tone === "weak";
  const Icon = isWeak ? FiThumbsDown : FiThumbsUp;

  return (
    <div
      className={cx(
        "rounded-xl border p-3",
        isWeak
          ? "border-red-200 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/5"
          : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/5",
      )}
    >
      <div
        className={cx(
          "flex items-center gap-2 text-xs font-semibold",
          isWeak
            ? "text-red-800 dark:text-red-300"
            : "text-emerald-800 dark:text-emerald-300",
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {title}
      </div>
      <div className="mt-2 space-y-1.5 rounded-lg bg-white/80 p-2.5 text-xs leading-relaxed text-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300">
        {children}
      </div>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{caption}</p>
    </div>
  );
}

/** What the agent is told to pull out of the git history before writing. */
const COLLECTED_FACTS: Array<{ label: string; detail: string }> = [
  {
    label: "What actually shipped",
    detail:
      "user-visible capabilities, with the ten commits behind one feature collapsed into a single line",
  },
  {
    label: "Impact",
    detail: "who each change helps and how — the part a recruiter reads",
  },
  {
    label: "Real numbers",
    detail:
      "latency, bundle size, coverage, endpoints, rows migrated — only ones it can verify in the diff",
  },
  {
    label: "The stack",
    detail:
      "named with searchable technology names, read from your dependency and migration diffs",
  },
  {
    label: "Links",
    detail: "a public PR, release or demo, when one exists",
  },
  {
    label: "Scope + count",
    detail:
      "repo name and how many of your own commits the summary covers, stored as post metadata",
  },
];

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
    <section
      id={CONNECT_PANEL_ID}
      className={`anim-fade-up p-5 sm:p-6 ${SURFACE_GLASS}`}
    >
      <div className="flex items-start gap-3">
        <span className="anim-float flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
          <FiZap className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Connect your AI coding tools
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Connect once and your coding agent learns the whole workflow from
            LinkHub itself — reading your git history, pulling out what shipped,
            and writing it up the way a recruiter wants to read it. You never
            have to paste writing rules into your agent.
          </p>
        </div>
      </div>

      {token ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
          <FiCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            The snippets below are filled in with the token you just created.{" "}
            <strong className="font-semibold">
              It is gone as soon as you reload
            </strong>{" "}
            — copy the one you need now, or you will have to create another.
          </span>
        </p>
      ) : (
        // `flex-wrap` + `break-all`: the 31-char placeholder has no break
        // opportunity under `word-break: normal` (`_` doesn't break), so at
        // 375px its min-content width overflowed the panel and produced a
        // real page-wide horizontal scrollbar. This is the no-token branch,
        // so every new user hit it.
        <p className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
          <FiTerminal className="h-4 w-4 shrink-0" aria-hidden="true" />
          Create a token above, then replace{" "}
          <code className="font-mono break-all">{TOKEN_PLACEHOLDER}</code> with
          it.
        </p>
      )}

      {/* The MCP server is not on npm yet, so the only way to run it today is
          from a checkout. That is fine for contributors and impossible for the
          developer who signed up to have their agent post for them — and as a
          numbered step 1 it read as mandatory setup they simply could not do.
          Folded into an opt-in disclosure until the package is published. */}
      <details className="group mt-6 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
        <summary
          className={`flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200 ${FOCUS_RING} rounded-md`}
        >
          <FiTerminal className="h-4 w-4 shrink-0" aria-hidden="true" />
          Running LinkHub locally? Build the server first
          <FiChevronDown
            className="ml-auto h-4 w-4 shrink-0 transition group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
          Only needed if you are running LinkHub from a checkout of the repo.
          Run both from anywhere inside it — the second prints the absolute path
          the config below needs, so you never have to type it by hand.
        </p>
        <div className="mt-3 space-y-3">
          <SnippetBlock
            snippet={{
              target: "Terminal — build once",
              language: "bash",
              code: BUILD_COMMAND,
            }}
          />
          <SnippetBlock
            snippet={{
              target: "Terminal — print your absolute entry path",
              language: "bash",
              code: PATH_COMMAND,
            }}
          />
        </div>
      </details>

      <Step index={1} title="Add LinkHub to your tool">
        <div
          ref={tablistRef}
          role="tablist"
          aria-label="AI tool"
          className="flex flex-wrap gap-1.5"
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
                className={cx(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                  isActive
                    ? "bg-violet-700 text-white shadow-sm dark:bg-violet-600"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                )}
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

            <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <FiCheckCircle
                  className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Check it worked — {activeTab.label}
              </div>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
                {activeTab.verify.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </div>

            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-500/30 dark:bg-violet-500/5">
              <div className="flex items-center gap-2 text-xs font-semibold text-violet-900 dark:text-violet-200">
                <FiPlay className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Run the workflow — {activeTab.invokeLabel}
              </div>
              <div className="mt-2">
                <SnippetBlock
                  snippet={{
                    target: `${activeTab.label} — start the ${PROMPT_NAME} workflow`,
                    language: "text",
                    code: activeTab.invokeCommand,
                  }}
                />
              </div>
              {activeTab.invokeNote ? (
                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                  {activeTab.invokeNote}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Step>

      <Step index={2} title="What your agent does with your commits">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          The <code className="font-mono">{PROMPT_NAME}</code> prompt ships with
          the server, so the instructions travel with the connection — nothing
          to paste into your agent, no rules file to maintain. When you run it,
          your agent reads your git history for the period and pulls out:
        </p>
        <ul className="mt-3 space-y-1.5">
          {COLLECTED_FACTS.map((fact) => (
            <li
              key={fact.label}
              className="flex gap-2 text-xs text-zinc-600 dark:text-zinc-400"
            >
              <FiGitCommit
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400"
                aria-hidden="true"
              />
              <span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {fact.label}
                </span>{" "}
                — {fact.detail}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
          The full house style also lives on the server as the{" "}
          <code className="font-mono">linkhub://guides/post-quality</code>{" "}
          resource, which your agent can read on its own at any time.
        </p>
      </Step>

      <Step index={3} title="What stops your employer's name getting out">
        {/* This section used to promise that the agent "strips private client
            detail" — flatly, as if guaranteed. It isn't: instructing a model is
            not the same as enforcing a rule, and the difference is exactly what
            a user needs to understand before pointing this at a work laptop.
            The two are now separated explicitly. */}
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <FiShield className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Enforced by LinkHub
            </div>
            <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
              These are checked on our servers. The agent cannot opt out of
              them, and neither can a leaked token.
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <li className="flex gap-2">
                <FiCheck
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <span>
                  At <strong>Summary</strong> level, a post naming one of your
                  employers or a term you blocked is <strong>rejected</strong>{" "}
                  before it is saved — the agent gets an error telling it to
                  rewrite.
                </span>
              </li>
              <li className="flex gap-2">
                <FiCheck
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <span>
                  Work history read by the agent is redacted{" "}
                  <strong>before it leaves LinkHub</strong>, so the employer
                  name is never in its context to begin with.
                </span>
              </li>
              <li className="flex gap-2">
                <FiCheck
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <span>
                  A token can read your policy but never change it. Only you
                  can, from this page.
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
              <FiAlertTriangle
                className="h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              Guidance to the model — not a guarantee
            </div>
            <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
              The server instructs your agent to do these. They are
              instructions a model follows, so treat them as strong defaults
              rather than a promise, and read the draft before it goes out.
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              <li className="flex gap-2">
                <FiAlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <span>
                  Stripping commit SHAs, branch names, ticket ids, internal
                  service names and file paths.
                </span>
              </li>
              <li className="flex gap-2">
                <FiAlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <span>
                  Not repeating a secret, token or connection string it happens
                  to see in a diff — and telling you it was there.
                </span>
              </li>
              <li className="flex gap-2">
                <FiAlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
                <span>
                  Showing you the draft first, and publishing as a draft when
                  anything is uncertain.
                </span>
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
          Pick your level under{" "}
          <a
            href={`#${DISCLOSURE_PANEL_ID}`}
            className={`font-medium text-violet-700 underline underline-offset-2 hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200 ${FOCUS_RING} rounded`}
          >
            What your agent may share
          </a>
          . Give the token the{" "}
          <code className="font-mono">profile:read</code> scope so the server
          can read it — without it your agent assumes the strictest level and
          will not name any employer at all.
        </p>
      </Step>

      <Step index={4} title="Same week of commits, two very different posts">
        <div className="grid gap-3 lg:grid-cols-2">
          <ExampleCard
            tone="weak"
            title="Without the prompt — a commit log with bullets"
            caption="Branch names and wip commits. Nothing here tells a reader what the software does or what you're good at."
          >
            <p className="font-semibold">Weekly update</p>
            <p className="font-mono">
              - feat: add layout editor
              <br />
              - fix: mobile mirroring bug
              <br />
              - chore: bump deps
              <br />
              - feat(mcp): posts domain + MCP server
              <br />
              - fix: PR #212 review comments
              <br />- wip
            </p>
            <p>14 commits this week in feat/posts-mcp-profile-epic.</p>
          </ExampleCard>

          <ExampleCard
            tone="strong"
            title="With the prompt — outcome, impact, stack"
            caption="Same raw material. Outcomes instead of files, a number you can picture, and a stack a recruiter can search for."
          >
            <p className="font-semibold">
              Shipped a drag-and-drop profile editor with live mobile preview
            </p>
            <p>
              Spent the week making LinkHub profiles editable without touching
              code.
            </p>
            <p>
              - Built a drag-and-drop layout editor where the desktop and mobile
              canvases stay mirrored, so a change in one shows up in the other
              instantly.
              <br />- Added direct file uploads for avatars and covers,
              replacing the paste-a-URL flow that was losing about a third of
              users at that step.
              <br />- Opened the posts API to AI agents over MCP, so a coding
              assistant can publish an update straight from a terminal.
            </p>
            <p>
              TypeScript, React 19, Fastify, Drizzle, PostgreSQL. 14 commits.
            </p>
          </ExampleCard>
        </div>
      </Step>
    </section>
  );
}
