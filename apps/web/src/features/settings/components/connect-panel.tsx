import { useMemo, type ReactNode } from "react";
import {
  FiCheck,
  FiChevronDown,
  FiGitCommit,
  FiTerminal,
  FiZap,
} from "react-icons/fi";
import {
  FOCUS_RING,
  SURFACE_GLASS,
} from "../../../shared-components/surface";
import { CONNECT_PANEL_ID, resolveApiUrl } from "../lib/mcp-config";
// Host tabs and snippet builders are shared with the auto-post wizard's MCP
// path — one definition, two surfaces.
import {
  BUILD_COMMAND,
  buildTabs,
  PATH_COMMAND,
  PROMPT_NAME,
  TOKEN_PLACEHOLDER,
} from "../lib/mcp-tool-tabs";
import { DISCLOSURE_PANEL_ID } from "./disclosure-panel";
import { EnforcementGrid, ExamplePostsGrid } from "./safety-explainers";
// Shared with the activity-connections panel, which needs the same copyable
// block for webhook URLs, one-time secrets and the Claude Code hook.
import { SnippetBlock } from "./snippet-block";
import { ToolTabs } from "./tool-tabs";

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
              It is gone when this tab closes
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
        <ToolTabs tabs={tabs} idPrefix="connect" />
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
        <EnforcementGrid />

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
        <ExamplePostsGrid />
      </Step>
    </section>
  );
}
