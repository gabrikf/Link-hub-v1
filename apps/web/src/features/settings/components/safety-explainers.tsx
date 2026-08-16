import type { ReactNode } from "react";
import {
  FiAlertTriangle,
  FiCheck,
  FiShield,
  FiThumbsDown,
  FiThumbsUp,
} from "react-icons/fi";

/**
 * The two trust explainers extracted from `connect-panel.tsx` when the
 * "How this works" dialog needed the same content: the enforced-vs-guidance
 * grid and the weak/strong example posts. One copy of the copy — the whole
 * point of the enforcement grid is that its claims stay true, and two forks of
 * a promise drift into a lie.
 */

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * What LinkHub's servers enforce vs. what the model is merely instructed to
 * do. The two used to be blended into one flat promise; the difference is
 * exactly what a user needs to understand before pointing this at a work
 * laptop, so they are separated explicitly.
 */
export function EnforcementGrid() {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          <FiShield className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Enforced by LinkHub
        </div>
        <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
          These are checked on our servers. The agent cannot opt out of them,
          and neither can a leaked token.
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
              <strong>before it leaves LinkHub</strong>, so the employer name is
              never in its context to begin with.
            </span>
          </li>
          <li className="flex gap-2">
            <FiCheck
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <span>
              A token can read your policy but never change it. Only you can,
              from this page.
            </span>
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
          <FiAlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Guidance to the model — not a guarantee
        </div>
        <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
          The server instructs your agent to do these. They are instructions a
          model follows, so treat them as strong defaults rather than a
          promise, and read the draft before it goes out.
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <li className="flex gap-2">
            <FiAlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <span>
              Stripping commit SHAs, branch names, ticket ids, internal service
              names and file paths.
            </span>
          </li>
          <li className="flex gap-2">
            <FiAlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <span>
              Not repeating a secret, token or connection string it happens to
              see in a diff — and telling you it was there.
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
  );
}

type ExampleCardProps = {
  tone: "weak" | "strong";
  title: string;
  caption: string;
  children: ReactNode;
};

export function ExampleCard({ tone, title, caption, children }: ExampleCardProps) {
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

/** Same week of commits, two very different posts. */
export function ExamplePostsGrid() {
  return (
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
          <br />- Added direct file uploads for avatars and covers, replacing
          the paste-a-URL flow that was losing about a third of users at that
          step.
          <br />- Opened the posts API to AI agents over MCP, so a coding
          assistant can publish an update straight from a terminal.
        </p>
        <p>TypeScript, React 19, Fastify, Drizzle, PostgreSQL. 14 commits.</p>
      </ExampleCard>
    </div>
  );
}
