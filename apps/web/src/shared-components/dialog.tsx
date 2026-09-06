import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FiX } from "react-icons/fi";
import { Button } from "./button";

type DialogProps = Readonly<{
  title?: string;
  description?: string;
  children?: ReactNode;
  buttons?: ReactNode;
  contentClassName?: string;
  closeLabel?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}>;

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
  const { t } = useTranslation();

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
            // two children out as a flex column: a header BAR that stays put
            // and a body that scrolls. While `overflow-y-auto` lived here, the
            // close button — an absolutely positioned child of the scroll
            // container — scrolled away with the content, so on any dialog
            // taller than the max height (resume review, the auto-post wizard,
            // the layout preview) the X was gone the moment the user scrolled,
            // which on mobile is the primary way out of the modal.
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
            THE HEADER BAR. A real, non-scrolling flex row — not an absolutely
            positioned overlay.

            The X used to be `absolute right-2 top-2 z-10` on the frame. That
            kept it pinned across scroll (which was the point) but it also
            floated it OVER the body's scroll area, and the body's scrollbar
            runs down the frame's right border: on any platform drawing classic
            scrollbars (Linux/Windows, and macOS with "always show"), the X sat
            on top of the scrollbar's top arrow and stole its clicks.

            Giving the button a row of its own fixes that at the source. The
            scroll area starts BELOW this bar, so its scrollbar starts below the
            button and the two can never occupy the same pixels. `shrink-0`
            stops the bar collapsing when the body is tall, which is exactly the
            case the pinning exists for.

            It also retires the `pr-11` gutters the old overlay needed: a long
            title now wraps against the button's flex edge, not against a
            hand-counted 44px of reserved padding.

            ONLY THE TITLE IS UP HERE. The description scrolls with the body,
            deliberately: this bar is permanent chrome, and at 390px the
            Edit-profile description wraps to two lines, so pinning it would
            spend ~40px of a 844px phone at every scroll offset to keep a
            sentence on screen that has already been read. A one-line title is
            worth that; a paragraph is not. It also keeps the change as close to
            the previous layout as the fix allows — the description is exactly
            where it was, at the top of the scrolling body.
          */}
          <div
            data-testid="dialog-header"
            className={cx(
              "flex shrink-0 items-start gap-3",
              // With a title the bar carries the dialog's own 20px inset. With
              // none it is pure chrome, so the button hugs the corner at the
              // same 8px the absolute version used.
              title ? "px-5 pt-5" : "px-2 pt-2",
            )}
          >
            {/* `min-w-0` is load-bearing: without it a long unbroken title sets
                the flex item's min-content width and pushes the X off the
                frame instead of wrapping. */}
            <div className="min-w-0 flex-1">
              {title ? (
                <RadixDialog.Title className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {title}
                </RadixDialog.Title>
              ) : null}
            </div>

            <RadixDialog.Close asChild>
              <Button
                type="button"
                variant="icon"
                size="icon"
                fullWidth={false}
                className="shrink-0"
                aria-label={
                  closeLabel ??
                  (title
                    ? t("dialog.closeTitled", { title })
                    : t("dialog.close"))
                }
              >
                <FiX className="h-4 w-4" aria-hidden="true" />
              </Button>
            </RadixDialog.Close>
          </div>

          {/*
            The scroll container. `min-h-0` is load-bearing: a flex child
            defaults to `min-height: auto`, which refuses to shrink below its
            content and would push the body past the frame's `max-h` instead of
            scrolling inside it. The horizontal padding lives here rather than
            on the frame so the scrollbar hugs the border instead of floating
            20px inside it, and content scrolls to the rounded edge instead of
            vanishing early.
          */}
          <div
            data-testid="dialog-body"
            className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4"
          >
            {description ? (
              <RadixDialog.Description className="text-sm text-zinc-600 dark:text-zinc-300">
                {description}
              </RadixDialog.Description>
            ) : null}

            {children ? (
              <div className={description ? "mt-4" : ""}>{children}</div>
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
