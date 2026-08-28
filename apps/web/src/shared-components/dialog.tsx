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
 * Tailwind emits `max-w-*`/`w-*`/`max-h-*` utilities in a fixed stylesheet
 * order, so when a caller passes `contentClassName="... max-w-6xl"` it does NOT
 * reliably beat the component's own `max-w-lg` (the default happened to win,
 * capping every override at 512px). Detect an override and drop the conflicting
 * default so the caller's value actually applies — no tailwind-merge needed.
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
  const hasHeader = Boolean(title) || Boolean(description);

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
            // The frame itself NEVER scrolls (`overflow-hidden`) and lays its
            // one child out as a flex column: the scrolling moved down into
            // that child. While `overflow-y-auto` lived here, the close button
            // — an absolutely positioned child of the scroll container —
            // scrolled away with the content, so on any dialog taller than the
            // max height (resume review, the auto-post wizard, the layout
            // preview) the X was gone the moment the user scrolled, which on
            // mobile is the primary way out of the modal.
            "fixed left-1/2 top-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900",
            // Comfortable wider default; suppressed when the caller sets its own.
            hasClassPrefix(contentClassName, "w-") ? "" : "w-[92vw]",
            hasClassPrefix(contentClassName, "max-w-") ? "" : "max-w-lg",
            // `svh`, not `vh`: `vh` resolves against the LARGE viewport (747px
            // at 375x812) while only ~635px is actually visible under browser
            // chrome, so the action row below fell into the clipped strip with
            // body scroll locked by Radix — unreachable Save/Cancel on mobile.
            hasClassPrefix(contentClassName, "max-h-") ? "" : "max-h-[92svh]",
            contentClassName,
          )}
        >
          {/*
            Positioned against the frame, not against the scrolled body, so it
            stays at the same corner at every scroll offset. `absolute` rather
            than `position: sticky` on a header row: sticky only pins while its
            containing block is in view and it consumes layout space at the top
            of the scroller, which would have re-flowed all 14 callers; an
            absolute child of the non-scrolling frame is unconditional — there
            is no scroll position, content height or caller `max-h` that can
            move it. `z-10` keeps it above the body, and the `icon` variant is
            opaque in both themes, so text sliding under it is hidden rather
            than smeared through it.
          */}
          <RadixDialog.Close asChild>
            <Button
              type="button"
              variant="icon"
              size="icon"
              fullWidth={false}
              className="absolute right-2 top-2 z-10"
              aria-label={
                closeLabel ?? (title ? `Close ${title}` : "Close dialog")
              }
            >
              <FiX className="h-4 w-4" aria-hidden="true" />
            </Button>
          </RadixDialog.Close>

          {/*
            The scroll container. `min-h-0` is load-bearing: a flex child
            defaults to `min-height: auto`, which refuses to shrink below its
            content and would push the body past the frame's `max-h` instead of
            scrolling inside it. The padding lives here rather than on the
            frame so content scrolls to the rounded edge instead of vanishing
            20px early, and so the scrollbar hugs the border.
          */}
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {/* `pr-11` reserves the close button's 36px + 8px inset, so a long
                title wraps before it reaches the X instead of running under it. */}
            {hasHeader ? (
              <div className="pr-11">
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
              </div>
            ) : null}

            {/* With no header there is nothing above the children to keep them
                clear of the X, so they carry the reserved gutter instead. */}
            {children ? (
              <div className={cx("mt-4", hasHeader ? "" : "pr-11")}>
                {children}
              </div>
            ) : null}

            {/* `flex-wrap`: at <=470px the three-button unsaved-changes dialog
                squeezed "Close without saving" into a 3-line wrap inside a fixed
                h-10 box, spilling out of its own border. */}
            {buttons ? (
              <div className="mt-1 flex flex-wrap justify-end gap-2">
                {buttons}
              </div>
            ) : null}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
