import type { TextareaHTMLAttributes } from "react";

type TextAreaFieldProps = {
  id: string;
  label: string;
  error?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({
  id,
  label,
  error,
  className,
  ...textareaProps
}: TextAreaFieldProps) {
  return (
    <div>
      <label
        className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
        htmlFor={id}
      >
        {label}
      </label>
      <textarea
        id={id}
        className={`w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${className ?? ""}`.trim()}
        {...textareaProps}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
