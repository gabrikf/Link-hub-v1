import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FiEdit2, FiLink2, FiTrash } from "react-icons/fi";
import { FaGripLinesVertical } from "react-icons/fa6";
import type { LinkResponse } from "@repo/schemas";
import * as Switch from "@radix-ui/react-switch";
import { getLinkIconOption } from "../../../lib/link-icons";
import { Button } from "../../../shared-components/button";

type SortableLinkItemProps = {
  link: LinkResponse;
  onToggleVisibility: (linkId: string, isPublic: boolean) => void;
  onEdit: (link: LinkResponse) => void;
  onDelete: (linkId: string) => void;
};

export function SortableLinkItem({
  link,
  onToggleVisibility,
  onEdit,
  onDelete,
}: SortableLinkItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: link.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const selectedIcon = getLinkIconOption(link.icon);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Button
          type="button"
          variant="soft"
          size="icon"
          fullWidth={false}
          aria-label="Drag to reorder"
          className="mt-0.5 cursor-grab rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-500 active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400"
          {...attributes}
          {...listeners}
        >
          <FaGripLinesVertical className="h-4 w-4" />
        </Button>

        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100">
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full"
              style={{
                color: selectedIcon?.color,
                background:
                  selectedIcon?.backgroundColor ??
                  "linear-gradient(135deg, #0EA5E9, #14B8A6)",
              }}
            >
              {selectedIcon ? (
                <selectedIcon.Icon className="h-3 w-3" aria-hidden="true" />
              ) : (
                <FiLink2 className="h-3 w-3 text-white" aria-hidden="true" />
              )}
            </span>
            {link.title}
          </p>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block break-all text-sm text-zinc-600 underline decoration-zinc-400 underline-offset-2 dark:text-zinc-300 dark:decoration-zinc-500"
          >
            {link.url}
          </a>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {link.isPublic ? "Public" : "Private"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <label className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200">
          <Switch.Root
            checked={link.isPublic}
            onCheckedChange={(checked) => onToggleVisibility(link.id, checked)}
            aria-label="Toggle link visibility"
            className="h-5 w-9 cursor-pointer rounded-full bg-zinc-300 transition data-[state=checked]:bg-teal-600 dark:bg-zinc-700 dark:data-[state=checked]:bg-teal-500"
          >
            <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform duration-150 data-[state=checked]:translate-x-4.5 dark:bg-zinc-900" />
          </Switch.Root>
          <span>{link.isPublic ? "Visible" : "Hidden"}</span>
        </label>

        <Button
          type="button"
          variant="icon"
          size="icon"
          fullWidth={false}
          onClick={() => onEdit(link)}
          aria-label="Edit link"
        >
          <FiEdit2 />
        </Button>

        <Button
          type="button"
          variant="danger"
          size="icon"
          fullWidth={false}
          shouldHaveConfirmation
          onClick={() => onDelete(link.id)}
          aria-label="Delete link"
        >
          <FiTrash />
        </Button>
      </div>
    </li>
  );
}
