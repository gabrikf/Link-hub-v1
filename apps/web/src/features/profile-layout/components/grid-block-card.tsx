import { CUSTOM_BLOCK_KINDS, type ProfileBlock } from "@repo/schemas";
import * as Switch from "@radix-ui/react-switch";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { FaGripLinesVertical } from "react-icons/fa6";
import { Button } from "../../../shared-components/button";
import { BLOCK_META } from "../block-meta";

type GridBlockCardProps = {
  block: ProfileBlock;
  onToggleVisibility: (block: ProfileBlock, isVisible: boolean) => void;
  onTogglePin: (block: ProfileBlock, pinned: boolean) => void;
  onEdit: (block: ProfileBlock) => void;
  onDelete: (block: ProfileBlock) => void;
};

const isCustom = (block: ProfileBlock) =>
  (CUSTOM_BLOCK_KINDS as readonly string[]).includes(block.kind);

export function GridBlockCard({
  block,
  onToggleVisibility,
  onTogglePin,
  onEdit,
  onDelete,
}: GridBlockCardProps) {
  const meta = BLOCK_META[block.kind];
  const custom = isCustom(block);

  return (
    <div
      className={[
        // The whole card is the drag surface (see editor-grid dragConfig), so
        // it shows a grab cursor; interactive controls opt out via
        // `.block-no-drag` and keep their own pointer cursor.
        "flex h-full w-full cursor-grab flex-col justify-between gap-2 overflow-hidden rounded-2xl border bg-white p-3 transition-all duration-300 select-none active:cursor-grabbing dark:bg-zinc-900",
        block.isVisible
          ? "border-zinc-200 hover:border-violet-400/70 hover:shadow-[0_0_22px_-6px_rgba(139,92,246,0.5)] dark:border-zinc-700 dark:hover:border-violet-500/60"
          : "border-dashed border-zinc-300 opacity-60 dark:border-zinc-700",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400"
            aria-label={`Drag ${meta.label}`}
            title="Drag the card to move it"
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
              aria-label={`Edit ${meta.label}`}
              onClick={() => onEdit(block)}
            >
              <FiEdit2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="icon"
              size="icon"
              fullWidth={false}
              aria-label={`Delete ${meta.label}`}
              shouldHaveConfirmation
              confirmationTitle="Delete block?"
              confirmationDescription="This block will be removed from this viewport layout."
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
            aria-label={`Toggle ${meta.label} visibility`}
            className="h-4 w-7 cursor-pointer rounded-full bg-zinc-300 transition data-[state=checked]:bg-teal-600 dark:bg-zinc-700 dark:data-[state=checked]:bg-teal-500"
          >
            <Switch.Thumb className="block h-3 w-3 translate-x-0.5 rounded-full bg-white transition-transform duration-150 data-[state=checked]:translate-x-3.5 dark:bg-zinc-900" />
          </Switch.Root>
          {block.isVisible ? "Visible" : "Hidden"}
        </label>

        <label className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-50 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200">
          <Switch.Root
            checked={block.pinnedAllTabs}
            onCheckedChange={(checked) => onTogglePin(block, checked)}
            aria-label={`Pin ${meta.label} to all tabs`}
            className="h-4 w-7 cursor-pointer rounded-full bg-zinc-300 transition data-[state=checked]:bg-violet-600 dark:bg-zinc-700 dark:data-[state=checked]:bg-violet-500"
          >
            <Switch.Thumb className="block h-3 w-3 translate-x-0.5 rounded-full bg-white transition-transform duration-150 data-[state=checked]:translate-x-3.5 dark:bg-zinc-900" />
          </Switch.Root>
          All tabs
        </label>
      </div>
    </div>
  );
}
