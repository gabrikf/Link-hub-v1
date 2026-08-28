import {
  CUSTOM_BLOCK_KINDS,
  type ProfileBlock,
  type ProfileTab,
} from "@repo/schemas";
import * as Switch from "@radix-ui/react-switch";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { FaGripLinesVertical } from "react-icons/fa6";
import { Button } from "../../../shared-components/button";
import { FOCUS_RING } from "../../../shared-components/surface";
import { getBlockMeta } from "../block-meta";

type GridBlockCardProps = {
  block: ProfileBlock;
  onToggleVisibility: (block: ProfileBlock, isVisible: boolean) => void;
  onTogglePin: (block: ProfileBlock, pinned: boolean) => void;
  onEdit: (block: ProfileBlock) => void;
  onDelete: (block: ProfileBlock) => void;
  /** Arrow keys move the block; Shift+arrows resize it. Deltas are grid cells. */
  onMove?: (block: ProfileBlock, dx: number, dy: number) => void;
  onResize?: (block: ProfileBlock, dw: number, dh: number) => void;
  /** Tabs this block can be moved to. Omitted/short-circuited when pinned. */
  tabs?: ProfileTab[];
  onMoveToTab?: (block: ProfileBlock, tabId: string) => void;
  /**
   * Profile-level "show tabs" switch. With tabs off, "pin to all tabs" and
   * "move to tab" are controls for a concept the profile no longer has, so they
   * are hidden rather than left to configure something invisible. Nothing is
   * reassigned — turning tabs back on brings both controls back unchanged.
   */
  tabsEnabled?: boolean;
};

const isCustom = (block: ProfileBlock) =>
  (CUSTOM_BLOCK_KINDS as readonly string[]).includes(block.kind);

const ARROW_DELTAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function GridBlockCard({
  block,
  onToggleVisibility,
  onTogglePin,
  onEdit,
  onDelete,
  onMove,
  onResize,
  tabs,
  onMoveToTab,
  tabsEnabled = true,
}: GridBlockCardProps) {
  const { t } = useTranslation();
  const meta = getBlockMeta(t)[block.kind];
  const custom = isCustom(block);
  const movableTabs = block.pinnedAllTabs || !tabsEnabled ? [] : (tabs ?? []);

  /**
   * Keyboard equivalent of drag and resize. react-grid-layout offers neither,
   * so without this a keyboard user cannot arrange a layout at all — the whole
   * editor was mouse-only. Arrow keys nudge by one grid cell, Shift+arrow
   * resizes by one. Events from the controls inside the card are ignored so
   * arrowing inside the "move to tab" select still works normally.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = ARROW_DELTAS[event.key];
    if (!delta) {
      return;
    }
    if (event.target !== event.currentTarget) {
      return;
    }

    const [dx, dy] = delta;
    if (event.shiftKey) {
      if (!onResize) {
        return;
      }
      event.preventDefault();
      onResize(block, dx, dy);
      return;
    }

    if (!onMove) {
      return;
    }
    event.preventDefault();
    onMove(block, dx, dy);
  };

  return (
    <div
      tabIndex={0}
      role="group"
      aria-label={t("layout.blockKeyboardHelp", { label: meta.label })}
      onKeyDown={handleKeyDown}
      className={[
        // The whole card is the drag surface (see editor-grid dragConfig), so
        // it shows a grab cursor; interactive controls opt out via
        // `.block-no-drag` and keep their own pointer cursor.
        "flex h-full w-full cursor-grab flex-col justify-between gap-2 overflow-hidden rounded-2xl border bg-white p-3 transition-all duration-300 select-none active:cursor-grabbing dark:bg-zinc-900",
        FOCUS_RING,
        block.isVisible
          ? "border-zinc-200 hover:border-violet-400/70 hover:shadow-[0_0_22px_-6px_rgba(139,92,246,0.5)] dark:border-zinc-700 dark:hover:border-violet-500/60"
          : "border-dashed border-zinc-300 opacity-60 dark:border-zinc-700",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400"
            aria-label={t("layout.dragBlock", { label: meta.label })}
            title={t("layout.dragTheCard")}
          >
            <FaGripLinesVertical className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
            <meta.Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {meta.label}
          </span>
        </div>

        {custom ? (
          <div className="block-no-drag relative z-10 flex shrink-0 cursor-default items-center gap-1">
            <Button
              type="button"
              variant="icon"
              size="icon"
              fullWidth={false}
              aria-label={t("layout.editBlock", { label: meta.label })}
              onClick={() => onEdit(block)}
            >
              <FiEdit2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="icon"
              size="icon"
              fullWidth={false}
              aria-label={t("layout.deleteBlock", { label: meta.label })}
              shouldHaveConfirmation
              confirmationTitle={t("layout.deleteBlockTitle")}
              confirmationDescription={t("layout.deleteBlockBody")}
              onClick={() => onDelete(block)}
            >
              <FiTrash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>

      <div className="block-no-drag relative z-10 flex cursor-default flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200">
          <Switch.Root
            checked={block.isVisible}
            onCheckedChange={(checked) => onToggleVisibility(block, checked)}
            aria-label={t("layout.toggleBlockVisibility", {
              label: meta.label,
            })}
            className="h-4 w-7 cursor-pointer rounded-full bg-zinc-300 transition data-[state=checked]:bg-teal-600 dark:bg-zinc-700 dark:data-[state=checked]:bg-teal-500"
          >
            <Switch.Thumb className="block h-3 w-3 translate-x-0.5 rounded-full bg-white transition-transform duration-150 data-[state=checked]:translate-x-3.5 dark:bg-zinc-900" />
          </Switch.Root>
          {block.isVisible ? t("common.visible") : t("common.hidden")}
        </label>

        {tabsEnabled ? (
          <label className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200">
            <Switch.Root
              checked={block.pinnedAllTabs}
              onCheckedChange={(checked) => onTogglePin(block, checked)}
              aria-label={t("layout.pinToAllTabs", { label: meta.label })}
              className="h-4 w-7 cursor-pointer rounded-full bg-zinc-300 transition data-[state=checked]:bg-violet-600 dark:bg-zinc-700 dark:data-[state=checked]:bg-violet-500"
            >
              <Switch.Thumb className="block h-3 w-3 translate-x-0.5 rounded-full bg-white transition-transform duration-150 data-[state=checked]:translate-x-3.5 dark:bg-zinc-900" />
            </Switch.Root>
            {t("layout.allTabs")}
          </label>
        ) : null}

        {/*
          Moving a block between tabs previously required a three-step dance —
          pin it, switch tabs, unpin it — because unpinning reassigns the block
          to whichever tab is active. This is the direct control.
        */}
        {movableTabs.length > 1 && onMoveToTab ? (
          <label className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200">
            <span className="sr-only">
              {t("layout.moveBlockToTab", { label: meta.label })}
            </span>
            <span aria-hidden="true">{t("common.tab")}</span>
            <select
              value={block.tabId ?? ""}
              onChange={(event) => onMoveToTab(block, event.target.value)}
              aria-label={t("layout.moveBlockToTab", { label: meta.label })}
              className="cursor-pointer rounded bg-transparent text-[11px] font-medium text-zinc-700 focus:outline-none dark:text-zinc-200"
            >
              {movableTabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}
