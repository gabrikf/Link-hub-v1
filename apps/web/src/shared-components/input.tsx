import type { InputHTMLAttributes } from "react";

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
  ...inputProps
}: TextInputFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-sm text-zinc-700" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-md border border-zinc-300 px-3 py-2 ${className ?? ""}`.trim()}
        {...inputProps}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
