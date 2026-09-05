import {
  DEFAULT_BUILTIN_BLOCKS,
  type ProfileBlock,
  type ProfileViewport,
} from "@repo/schemas";
import type { ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { FiPlus } from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import type { GridLayoutItem } from "../grid-utils";
import { EditorGrid } from "./editor-grid";
import { EditorGridSkeleton } from "./editor-grid-skeleton";

/**
 * Placeholder geometry for this zone while the layout loads.
 *
 * DERIVED from `DEFAULT_BUILTIN_BLOCKS` — the arrangement every profile starts
 * from — because the real one is precisely what the request is fetching. It was
 * a hand-copy of those spans, which silently stopped mirroring anything the day
 * the default moved `links` into the always-visible zone.
 */
const PINNED_SKELETON_SPANS = (cols: number) =>
  DEFAULT_BUILTIN_BLOCKS.filter((builtin) => builtin.pinnedAllTabs).map(
    (builtin) => ({ w: cols, h: builtin.gridH }),
  );

type PinnedZoneSectionProps = Readonly<{
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
 * The always-visible zone: the grid of blocks published on every tab, and the
 * button that adds a block to it.
 */
export function PinnedZoneSection({
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
}: PinnedZoneSectionProps) {
  const { t } = useTranslation();

  return (
    <section className="anim-fade-up space-y-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-500/30 dark:bg-violet-500/5">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {t("layout.alwaysVisibleSection")}
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t("layout.pinnedHelp")}
        </p>
      </div>
      {isLayoutLoading ? (
        <EditorGridSkeleton
          cols={cols}
          viewport={viewport}
          spans={PINNED_SKELETON_SPANS(cols)}
          label={t("layout.loadingPinned")}
        />
      ) : (
        <EditorGrid
          blocks={blocks}
          cols={cols}
          viewport={viewport}
          isTouch={isTouch}
          onChange={onPositionsChange}
          renderCard={renderCard}
          emptyMessage={t("layout.noPinnedBlocks")}
        />
      )}

      {/*
        The button that fills THIS zone lives in it. Both add buttons used
        to sit together in the tab manager, so neither one said which grid
        it filled — the reported confusion. It is offered with tabs on and
        off alike: the always-visible zone is the one section that is
        always published.
      */}
      <div
        ref={addMenuRef}
        className="relative flex flex-wrap items-center gap-2 border-t border-violet-200 pt-3 dark:border-violet-500/30"
      >
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
          {t("layout.addToAlwaysVisible")}
        </Button>

        {isAddMenuOpen ? addBlockMenu : null}
      </div>
    </section>
  );
}
