import { useId, type InputHTMLAttributes } from "react";
import { FOCUS_RING_FIELD } from "./surface";

type TextInputFieldProps = {
  id: string;
  label: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export function Input({
  id,
  label,
  error,
  className,
  "aria-describedby": describedBy,
  ...inputProps
}: TextInputFieldProps) {
  const errorId = `${useId()}-error`;
  // Preserve a caller-supplied describedby; the error is appended, not replaced.
  const describedByValue =
    [error ? errorId : null, describedBy].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label
        className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
        htmlFor={id}
      >
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${FOCUS_RING_FIELD} ${className ?? ""}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedByValue}
        {...inputProps}
      />
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}
