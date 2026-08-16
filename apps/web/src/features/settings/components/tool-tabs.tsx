import { useRef, useState, type KeyboardEvent } from "react";
import { FiCheckCircle, FiPlay } from "react-icons/fi";
import type { ToolTab } from "../lib/mcp-tool-tabs";
import { PROMPT_NAME } from "../lib/mcp-tool-tabs";
import { SnippetBlock } from "./snippet-block";

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

type ToolTabsProps = {
  tabs: ToolTab[];
  /** Keeps tab/panel ids unique when two instances are mounted at once. */
  idPrefix: string;
  /**
   * Controlled selection — the wizard threads the Connect-step choice into the
   * Schedule step's automation guidance. Omitted, the tabs manage themselves.
   */
  activeKey?: string;
  onActiveKeyChange?: (key: string) => void;
};

/**
 * The host-picker tablist plus its snippet / verify / invoke panel, extracted
 * from `connect-panel.tsx` so the auto-post wizard's MCP path renders the
 * exact same tabs instead of forking them.
 */
export function ToolTabs({
  tabs,
  idPrefix,
  activeKey,
  onActiveKeyChange,
}: ToolTabsProps) {
  const [uncontrolledKey, setUncontrolledKey] = useState(tabs[0]?.key ?? "");
  const tablistRef = useRef<HTMLDivElement | null>(null);

  const selectedKey = activeKey ?? uncontrolledKey;
  const activeTab = tabs.find((tab) => tab.key === selectedKey) ?? tabs[0];

  const setActiveKey = (key: string) => {
    setUncontrolledKey(key);
    onActiveKeyChange?.(key);
  };

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
        ?.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${nextTab.key}`)
        ?.focus();
    }
  };

  return (
    <>
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
              id={`${idPrefix}-tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`${idPrefix}-tabpanel-${tab.key}`}
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
          id={`${idPrefix}-tabpanel-${activeTab.key}`}
          aria-labelledby={`${idPrefix}-tab-${activeTab.key}`}
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
    </>
  );
}
