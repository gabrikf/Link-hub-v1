import type { ProfileTab } from "@repo/schemas";
import { useTranslation } from "react-i18next";
import {
  FiChevronLeft,
  FiChevronRight,
  FiEdit2,
  FiPlus,
  FiTrash2,
} from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import { LoadingLabel, Skeleton } from "../../../shared-components/skeleton";

/** Pill widths for the tab-manager placeholder row. */
const TAB_PILL_SKELETON_WIDTHS = [132, 118];

/**
 * The tab pill's inline icon buttons. They were bare 14px glyphs with no box —
 * fine under a mouse, unhittable with a thumb — so below `sm` they get the WCAG
 * 2.5.8 44px target and shrink back to the compact size on a wide screen.
 */
const TAB_ICON_BUTTON =
  "inline-flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-700 sm:h-6 sm:w-6 dark:hover:text-zinc-200";

type TabStripProps = Readonly<{
  /** The tabs to draw — empty while the layout is in flight. */
  tabs: ProfileTab[];
  activeTabId: string | null;
  isLayoutLoading: boolean;
  /** How many tabs exist, which is what disables reorder and delete at the ends. */
  tabCount: number;
  onSelect: (tabId: string) => void;
  onRename: (tab: ProfileTab) => void;
  onDelete: (tabId: string) => void;
  onMove: (tabId: string, direction: -1 | 1) => void;
  onAdd: () => void;
}>;

/**
 * The row of tab pills — select, reorder, rename, delete — plus the button that
 * adds a tab.
 */
export function TabStrip({
  tabs,
  activeTabId,
  isLayoutLoading,
  tabCount,
  onSelect,
  onRename,
  onDelete,
  onMove,
  onAdd,
}: TabStripProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isLayoutLoading ? (
        <>
          <LoadingLabel>{t("layout.loadingTabs")}</LoadingLabel>
          {TAB_PILL_SKELETON_WIDTHS.map((width) => (
            <Skeleton key={width} shape="circle" width={width} height={34} />
          ))}
        </>
      ) : null}

      {tabs.map((tab, index) => {
        const isActive = activeTabId === tab.id;
        return (
          <div
            key={tab.id}
            className={[
              "inline-flex items-center gap-1 rounded-full border px-2 py-1 transition",
              isActive
                ? "border-violet-500 bg-violet-50 dark:border-violet-500/60 dark:bg-violet-500/10"
                : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900",
            ].join(" ")}
          >
            <button
              type="button"
              aria-label={t("layout.moveTabLeft", {
                tabTitle: tab.title,
              })}
              disabled={index === 0}
              onClick={() => onMove(tab.id, -1)}
              className={`${TAB_ICON_BUTTON} disabled:opacity-30`}
            >
              <FiChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onSelect(tab.id)}
              className={[
                "min-h-11 min-w-11 px-1 text-sm font-medium sm:min-h-0 sm:min-w-0",
                isActive
                  ? "text-violet-700 dark:text-violet-200"
                  : "text-zinc-600 dark:text-zinc-300",
              ].join(" ")}
            >
              {tab.title}
            </button>
            <button
              type="button"
              aria-label={t("layout.renameTabNamed", {
                tabTitle: tab.title,
              })}
              onClick={() => onRename(tab)}
              className={TAB_ICON_BUTTON}
            >
              <FiEdit2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {/*
              Unguarded before, and it sits 3px from the rename pencil:
              one mis-click destroyed a tab and dumped its blocks into
              another one. Every other destructive action in the app
              confirms first.
            */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              fullWidth={false}
              aria-label={t("layout.deleteTabNamed", {
                tabTitle: tab.title,
              })}
              disabled={tabCount <= 1}
              shouldHaveConfirmation
              confirmationTitle={t("layout.deleteTabTitle", {
                tabTitle: tab.title,
              })}
              confirmationDescription={t("layout.deleteTabBody")}
              onClick={() => onDelete(tab.id)}
              className="h-6 w-6 min-h-11 min-w-11 p-0 text-zinc-400 hover:text-red-600 sm:min-h-0 sm:min-w-0 dark:hover:text-red-400"
            >
              <FiTrash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <button
              type="button"
              aria-label={t("layout.moveTabRight", {
                tabTitle: tab.title,
              })}
              disabled={index === tabCount - 1}
              onClick={() => onMove(tab.id, 1)}
              className={`${TAB_ICON_BUTTON} disabled:opacity-30`}
            >
              <FiChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}

      <Button
        type="button"
        variant="soft"
        size="sm"
        fullWidth={false}
        className="min-h-11 rounded-full sm:min-h-0"
        // Until the layout lands, `activeTab` is a placeholder id from
        // the default fallback — creating against it would fail.
        disabled={isLayoutLoading}
        onClick={onAdd}
      >
        <FiPlus className="h-4 w-4" aria-hidden="true" />
        {t("layout.addTab")}
      </Button>
    </div>
  );
}
