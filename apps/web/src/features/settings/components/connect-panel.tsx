import { useMemo, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import {
  FiCheck,
  FiChevronDown,
  FiGitCommit,
  FiTerminal,
  FiZap,
} from "react-icons/fi";
import { FOCUS_RING, SURFACE_GLASS } from "../../../shared-components/surface";
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

type StepProps = Readonly<{
  index: number;
  title: string;
  children: ReactNode;
}>;

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
const getCollectedFacts = (
  t: TFunction,
): Array<{ label: string; detail: string }> => [
  {
    label: t("settings.connect.whatShipped"),
    detail: t("settings.connect.whatShippedDetail"),
  },
  {
    label: t("settings.connect.impact"),
    detail: t("settings.connect.impactDetail"),
  },
  {
    label: t("settings.connect.realNumbers"),
    detail: t("settings.connect.realNumbersDetail"),
  },
  {
    label: t("settings.connect.theStack"),
    detail: t("settings.connect.theStackDetail"),
  },
  {
    label: t("common.links"),
    detail: t("settings.connect.evidenceDetail"),
  },
  {
    label: t("settings.connect.scopeAndCount"),
    detail: t("settings.connect.scopeAndCountDetail"),
  },
];

type ConnectPanelProps = Readonly<{
  /** The most recently created plaintext token, if any, to pre-fill snippets. */
  token: string | null;
}>;

export function ConnectPanel({ token }: ConnectPanelProps) {
  const { t } = useTranslation();
  const apiUrl = useMemo(() => resolveApiUrl(), []);
  const effectiveToken = token ?? TOKEN_PLACEHOLDER;
  const tabs = useMemo(
    () => buildTabs(t, apiUrl, effectiveToken),
    [t, apiUrl, effectiveToken],
  );
  const collectedFacts = getCollectedFacts(t);

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
            {t("settings.connect.title")}
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("settings.connect.intro")}
          </p>
        </div>
      </div>

      {token ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
          <FiCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <Trans
              i18nKey="settings.connect.tokenNotice"
              components={{ strong: <strong className="font-semibold" /> }}
            />
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
          <Trans
            i18nKey="settings.connect.replacePlaceholder"
            values={{ placeholder: TOKEN_PLACEHOLDER }}
            components={{ code: <code className="font-mono break-all" /> }}
          />
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
          {t("settings.connect.localBuildTitle")}
          <FiChevronDown
            className="ml-auto h-4 w-4 shrink-0 transition group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
          {t("settings.connect.localBuildBody")}
        </p>
        <div className="mt-3 space-y-3">
          <SnippetBlock
            snippet={{
              target: t("settings.connect.terminalBuildOnce"),
              language: "bash",
              code: BUILD_COMMAND,
            }}
          />
          <SnippetBlock
            snippet={{
              target: t("settings.connect.terminalPrintPath"),
              language: "bash",
              code: PATH_COMMAND,
            }}
          />
        </div>
      </details>

      <Step index={1} title={t("settings.connect.addToTool")}>
        <ToolTabs tabs={tabs} idPrefix="connect" />
      </Step>

      <Step index={2} title={t("settings.connect.whatAgentDoes")}>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {t("settings.connect.promptShips", { promptName: PROMPT_NAME })}
        </p>
        <ul className="mt-3 space-y-1.5">
          {collectedFacts.map((fact) => (
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
          {/* `<uri>` is a slot in the locale value, not literal markup. The
              earlier version split the translated sentence on the URI string,
              which only worked because that URI happens to be identical in all
              three languages. */}
          <Trans
            i18nKey="settings.connect.houseStyle"
            components={{ uri: <code className="font-mono" /> }}
          />
        </p>
      </Step>

      <Step index={3} title={t("settings.connect.employerSafety")}>
        <EnforcementGrid />

        <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
          {t("settings.connect.pickYourLevel")}{" "}
          <a
            href={`#${DISCLOSURE_PANEL_ID}`}
            className={`font-medium text-violet-700 underline underline-offset-2 hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200 ${FOCUS_RING} rounded`}
          >
            {t("settings.connect.whatAgentMayShare")}
          </a>
          .{" "}
          <Trans
            i18nKey="settings.connect.profileReadScope"
            components={{ code: <code className="font-mono" /> }}
          />
        </p>
      </Step>

      <Step index={4} title={t("settings.connect.twoPosts")}>
        <ExamplePostsGrid />
      </Step>
    </section>
  );
}
