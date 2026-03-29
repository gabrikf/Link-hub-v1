import type { ButtonHTMLAttributes } from "react";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  children,
  className,
  ...buttonProps
}: PrimaryButtonProps) {
  return (
    <button
      className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 ${className ?? ""}`.trim()}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
