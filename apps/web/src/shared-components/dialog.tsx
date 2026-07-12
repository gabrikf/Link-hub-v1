import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { FiX } from "react-icons/fi";
import { Button } from "./button";

type DialogProps = {
  title?: string;
  description?: string;
  children?: ReactNode;
  buttons?: ReactNode;
  contentClassName?: string;
  closeLabel?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * Tailwind emits `max-w-*`/`w-*` utilities in a fixed stylesheet order, so when
 * a caller passes `contentClassName="... max-w-6xl"` it does NOT reliably beat
 * the component's own `max-w-lg` (the default happened to win, capping every
 * override at 512px). Detect a width override and drop the conflicting default
 * so the caller's value actually applies — no tailwind-merge dependency needed.
 */
const hasClassPrefix = (className: string | undefined, prefix: string) =>
  (className ?? "").split(/\s+/).some((token) => token.startsWith(prefix));

export function Dialog({
  title,
  description,
  children,
  buttons,
  contentClassName,
  closeLabel,
  open,
  defaultOpen,
  onOpenChange,
}: DialogProps) {
  return (
    <RadixDialog.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-zinc-950/60" />
        <RadixDialog.Content
          className={cx(
            "fixed left-1/2 top-1/2 z-50 max-h-[92vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900",
            // Comfortable wider default; suppressed when the caller sets its own.
            hasClassPrefix(contentClassName, "w-") ? "" : "w-[92vw]",
            hasClassPrefix(contentClassName, "max-w-") ? "" : "max-w-lg",
            contentClassName,
          )}
        >
          <RadixDialog.Close asChild>
            <Button
              type="button"
              variant="icon"
              size="icon"
              fullWidth={false}
              className="absolute right-2 top-2"
              aria-label={
                closeLabel ?? (title ? `Close ${title}` : "Close dialog")
              }
            >
              <FiX className="h-4 w-4" aria-hidden="true" />
            </Button>
          </RadixDialog.Close>

          {title ? (
            <RadixDialog.Title className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {title}
            </RadixDialog.Title>
          ) : null}

          {description ? (
            <RadixDialog.Description className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {description}
            </RadixDialog.Description>
          ) : null}

          {children ? <div className="mt-4">{children}</div> : null}

          {buttons ? (
            <div className="mt-1 flex justify-end gap-2">{buttons}</div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
