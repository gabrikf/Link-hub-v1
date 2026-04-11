import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

type DialogProps = {
  title?: string;
  description?: string;
  children?: ReactNode;
  buttons?: ReactNode;
  contentClassName?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

export function Dialog({
  title,
  description,
  children,
  buttons,
  contentClassName,
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
            "fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900",
            contentClassName,
          )}
        >
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
            <div className="mt-5 flex justify-end gap-2">{buttons}</div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
