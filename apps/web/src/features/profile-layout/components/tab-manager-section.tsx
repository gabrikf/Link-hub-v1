import {
  DEFAULT_BUILTIN_BLOCKS,
  type ProfileBlock,
  type ProfileTab,
  type ProfileViewport,
} from "@repo/schemas";
import * as Switch from "@radix-ui/react-switch";
import type { ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { FiAlertCircle, FiInfo, FiPlus } from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import {
  FOCUS_RING,
  SURFACE,
  SURFACE_INSET,
} from "../../../shared-components/surface";
import type { GridLayoutItem } from "../grid-utils";
import { EditorGrid } from "./editor-grid";
import { EditorGridSkeleton } from "./editor-grid-skeleton";
import { TabStrip } from "./tab-strip";

/**
 * Wired with `aria-describedby` rather than a hover tooltip. The explanation is
 * the whole point of the switch — it names the content-visibility consequence —
 * and a hover affordance is invisible on touch and to a keyboard user.
 */
const TABS_ENABLED_HINT_ID = "layout-tabs-enabled-hint";

/**
 * Placeholder geometry for this zone while the layout loads.
 *
 * DERIVED from `DEFAULT_BUILTIN_BLOCKS` — the arrangement every profile starts
 * from — because the real one is precisely what the request is fetching. It was
 * a hand-copy of those spans, which silently stopped mirroring anything the day
 * the default moved `links` into the always-visible zone.
 */
const TAB_SKELETON_SPANS = (cols: number) =>
  DEFAULT_BUILTIN_BLOCKS.filter((builtin) => !builtin.pinnedAllTabs).map(
    (builtin) => ({ w: cols, h: builtin.gridH }),
  );

type TabManagerSectionProps = Readonly<{
  tabsEnabled: boolean;
  onTabsEnabledChange: (tabsEnabled: boolean) => void;
  /** Blocks that vanish from the public page while tabs are off. */
  hiddenBlockCount: number;
  /** The tabs to draw — empty while the layout is in flight. */
  visibleTabs: ProfileTab[];
  activeTabId: string | null;
  tabCount: number;
  onSelectTab: (tabId: string) => void;
  onRenameTab: (tab: ProfileTab) => void;
  onDeleteTab: (tabId: string) => void;
  onMoveTab: (tabId: string, direction: -1 | 1) => void;
  onAddTab: () => void;
  blocks: ProfileBlock[];
  cols: number;
  viewport: ProfileViewport;
  isTouch: boolean;
  isLayoutLoading: boolean;
  onPositionsChange: (items: GridLayoutItem[]) => void;
  renderCard: (block: ProfileBlock) => ReactNode;
  /** Whether THIS row's block-kind menu is the open one. */
  isAddMenuOpen: boolean;
  onToggleAddMenu: () => void;
  /** Read by the page's outside-click dismissal, which owns the listener. */
  addMenuRef: RefObject<HTMLDivElement | null>;
  /** The shared block-kind menu, rendered here only while this row owns it. */
  addBlockMenu: ReactNode;
}>;

/**
 * The tabs card: the show-tabs switch and, while tabs are on, the tab strip,
 * the add-block row and the active tab's grid.
 */
export function TabManagerSection({
  tabsEnabled,
  onTabsEnabledChange,
  hiddenBlockCount,
  visibleTabs,
  activeTabId,
  tabCount,
  onSelectTab,
  onRenameTab,
  onDeleteTab,
  onMoveTab,
  onAddTab,
  blocks,
  cols,
  viewport,
  isTouch,
  isLayoutLoading,
  onPositionsChange,
  renderCard,
  isAddMenuOpen,
  onToggleAddMenu,
  addMenuRef,
  addBlockMenu,
}: TabManagerSectionProps) {
  const { t } = useTranslation();

  return (
    <section className={`anim-fade-up space-y-3 p-4 ${SURFACE}`}>
      {/*
        The switch lives HERE, directly above the tab strip it governs,
        rather than with the other profile fields in the dashboard modal.
        This is the only screen where the tabs are visible, so it is the
        only place the switch is discoverable and its effect legible: flip
        it and the strip below disappears under your cursor.
      */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* A `p`, not an `h2`: this names the control, not the whole
              section below it, and an `h2` here would mislabel the tab
              manager in the document outline. */}
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {t("layout.tabsEnabled")}
          </p>
          <p
            id={TABS_ENABLED_HINT_ID}
            className="text-xs text-zinc-500 dark:text-zinc-400"
          >
            {t("layout.tabsEnabledHelp")}
          </p>
        </div>
        <Switch.Root
          checked={tabsEnabled}
          // Until the layout lands, `tabsEnabled` is the default
          // fallback's, not this profile's — flipping it would write a
          // value the user never saw.
          disabled={isLayoutLoading}
          onCheckedChange={onTabsEnabledChange}
          aria-label={t("layout.toggleTabs")}
          aria-describedby={TABS_ENABLED_HINT_ID}
          className={[
            "relative h-6 w-11 shrink-0 cursor-pointer rounded-full bg-zinc-300 transition disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-700",
            "data-[state=checked]:bg-violet-600 dark:data-[state=checked]:bg-violet-500",
            // 44x24 is a wide-enough target and a short one. The halo
            // brings the tappable height to 44 without touching the
            // design — see the same trick on the block card's switch.
            "before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-[''] sm:before:hidden",
            FOCUS_RING,
          ].join(" ")}
        >
          <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-5 dark:bg-zinc-100" />
        </Switch.Root>
      </div>

      {tabsEnabled ? null : (
        <div className={`${SURFACE_INSET} space-y-1.5 p-3`}>
          <p className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <FiInfo
              className="mt-px h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500"
              aria-hidden="true"
            />
            {t("layout.tabsOffNotice")}
          </p>
          {/*
            The consequence, counted. Turning tabs off does not delete a
            thing, but it does take every block on a later tab off the
            public page, and "some of your blocks" is not something a user
            can act on. i18next `count` picks the plural form — a ternary
            between two strings would be wrong in languages with more
            than two.
          */}
          {hiddenBlockCount > 0 ? (
            <p className="flex items-start gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              <FiAlertCircle
                className="mt-px h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              {t("layout.tabsHiddenBlocks", { count: hiddenBlockCount })}
            </p>
          ) : null}
        </div>
      )}

      {tabsEnabled ? (
        <TabStrip
          tabs={visibleTabs}
          activeTabId={activeTabId}
          isLayoutLoading={isLayoutLoading}
          tabCount={tabCount}
          onSelect={onSelectTab}
          onRename={onRenameTab}
          onDelete={onDeleteTab}
          onMove={onMoveTab}
          onAdd={onAddTab}
        />
      ) : null}

      {/*
        Add block menu — and the active tab's grid. With tabs off NEITHER
        is rendered: the published page is the always-visible zone alone,
        so an editable tab grid here would be a section the visitor never
        sees, and a button filing blocks into it a trap rather than a
        shortcut. Nothing is written to achieve that — flip the switch
        back and every block returns exactly where it was.
      */}
      {tabsEnabled ? (
        <>
          <div
            ref={addMenuRef}
            className="relative flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800"
          >
            {/*
              Not `primary` — the page's one primary is the toolbar's, and
              this is a peer of the always-visible button that now sits in
              its own section, not a choice with a default.
            */}
            <Button
              type="button"
              variant="outline"
              fullWidth={false}
              size="sm"
              className="min-h-11 rounded-full sm:min-h-0"
              disabled={isLayoutLoading}
              aria-expanded={isAddMenuOpen}
              onClick={onToggleAddMenu}
            >
              <FiPlus className="h-4 w-4" aria-hidden="true" />
              {t("layout.addToTabs")}
            </Button>

            {isAddMenuOpen ? addBlockMenu : null}
          </div>

          {isLayoutLoading ? (
            <EditorGridSkeleton
              cols={cols}
              viewport={viewport}
              spans={TAB_SKELETON_SPANS(cols)}
              label={t("layout.loadingBlocks")}
            />
          ) : (
            <EditorGrid
              blocks={blocks}
              cols={cols}
              viewport={viewport}
              isTouch={isTouch}
              onChange={onPositionsChange}
              renderCard={renderCard}
              emptyMessage={t("layout.tabEmpty")}
            />
          )}
        </>
      ) : null}
    </section>
  );
}
