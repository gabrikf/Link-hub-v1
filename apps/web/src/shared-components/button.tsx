import {
  type ButtonHTMLAttributes,
  type MouseEvent,
  useCallback,
  useState,
} from "react";
import * as RadixAlertDialog from "@radix-ui/react-alert-dialog";
import { useTranslation } from "react-i18next";
import { FiLoader } from "react-icons/fi";
import { FOCUS_RING } from "./surface";

type ButtonVariant =
  | "primary"
  | "outline"
  | "soft"
  | "ghost"
  | "icon"
  | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  shouldHaveConfirmation?: boolean;
  /** Defaults to a translated "Are you sure?" when not provided. */
  confirmationTitle?: string;
  /** Defaults to a translated "This action can't be undone." when not provided. */
  confirmationDescription?: string;
  /** Shows a spinner and blocks interaction while a mutation is in flight. */
  isLoading?: boolean;
  /** Label swapped in while `isLoading`. Falls back to `children`. */
  loadingLabel?: string;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-violet-700 text-white hover:bg-violet-800 dark:bg-violet-600 dark:text-white dark:hover:bg-violet-500",
  outline:
    "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
  soft: "bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:hover:bg-violet-500/25",
  ghost:
    "bg-transparent text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800",
  icon: "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
  danger:
    "border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-500/50 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-500/10",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
  icon: "h-9 w-9 p-2",
};

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  fullWidth = true,
  shouldHaveConfirmation = false,
  confirmationTitle,
  confirmationDescription,
  isLoading = false,
  loadingLabel,
  disabled,
  onClick,
  ...buttonProps
}: ButtonProps) {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const resolvedConfirmationTitle = confirmationTitle ?? t("common.areYouSure");
  const resolvedConfirmationDescription =
    confirmationDescription ?? t("common.cannotBeUndone");

  const buttonClassName = cx(
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md transition disabled:cursor-not-allowed disabled:opacity-60",
    // Keyboard focus was previously invisible on every button in the app.
    FOCUS_RING,
    variantClasses[variant],
    sizeClasses[size],
    fullWidth && "w-full",
    className,
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
    },
    [onClick],
  );

  const handleConfirm = useCallback(() => {
    if (!onClick) {
      return;
    }

    const syntheticEvent = {
      preventDefault: () => {},
      stopPropagation: () => {},
    } as MouseEvent<HTMLButtonElement>;

    onClick(syntheticEvent);
  }, [onClick]);

  const triggerButton = (
    <button
      className={buttonClassName}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      onClick={
        shouldHaveConfirmation
          ? (event) => {
              event.preventDefault();
              setIsDialogOpen(true);
            }
          : handleClick
      }
      {...buttonProps}
    >
      {isLoading && <FiLoader className="h-4 w-4 shrink-0 animate-spin" />}
      {isLoading && loadingLabel ? loadingLabel : children}
    </button>
  );

  if (!shouldHaveConfirmation) {
    return triggerButton;
  }

  return (
    <>
      {triggerButton}
      {/*
       * Destructive confirmations use AlertDialog, not the generic Dialog:
       * it renders `role="alertdialog"`, moves initial focus to Cancel rather
       * than the destructive action, and refuses to dismiss on outside-click
       * or Escape-into-confirm — the correct semantics for something that
       * "can't be undone".
       */}
      <RadixAlertDialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <RadixAlertDialog.Portal>
          <RadixAlertDialog.Overlay className="fixed inset-0 z-50 bg-zinc-950/60" />
          <RadixAlertDialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92svh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
            <RadixAlertDialog.Title className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {resolvedConfirmationTitle}
            </RadixAlertDialog.Title>
            <RadixAlertDialog.Description className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {resolvedConfirmationDescription}
            </RadixAlertDialog.Description>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <RadixAlertDialog.Cancel asChild>
                <Button type="button" variant="outline" fullWidth={false}>
                  {t("common.cancel")}
                </Button>
              </RadixAlertDialog.Cancel>
              <RadixAlertDialog.Action asChild>
                <Button
                  type="button"
                  variant="danger"
                  fullWidth={false}
                  onClick={handleConfirm}
                >
                  {t("common.confirm")}
                </Button>
              </RadixAlertDialog.Action>
            </div>
          </RadixAlertDialog.Content>
        </RadixAlertDialog.Portal>
      </RadixAlertDialog.Root>
    </>
  );
}
