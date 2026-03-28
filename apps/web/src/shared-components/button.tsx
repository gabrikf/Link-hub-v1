import type { ButtonHTMLAttributes } from "react";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  children,
  className,
  ...buttonProps
}: PrimaryButtonProps) {
  return (
    <button
      className={`w-full rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-60 cursor-pointer ${className ?? ""}`.trim()}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
