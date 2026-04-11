import {
  type ButtonHTMLAttributes,
  type MouseEvent,
  useCallback,
  useState,
} from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { Dialog } from "./dialog";

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
  confirmationTitle?: string;
  confirmationDescription?: string;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
  outline:
    "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
  soft: "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700",
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
  confirmationTitle = "Are you sure?",
  confirmationDescription = "This action can't be undone.",
  onClick,
  ...buttonProps
}: ButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const buttonClassName = cx(
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md transition disabled:cursor-not-allowed disabled:opacity-60",
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
      {children}
    </button>
  );

  if (!shouldHaveConfirmation) {
    return triggerButton;
  }

  return (
    <>
      {triggerButton}
      <Dialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={confirmationTitle}
        description={confirmationDescription}
        buttons={
          <>
            <RadixDialog.Close asChild>
              <Button type="button" variant="outline" fullWidth={false}>
                Cancel
              </Button>
            </RadixDialog.Close>
            <RadixDialog.Close asChild>
              <Button
                type="button"
                variant="danger"
                fullWidth={false}
                onClick={handleConfirm}
              >
                Confirm
              </Button>
            </RadixDialog.Close>
          </>
        }
      />
    </>
  );
}
