import type { ReactNode } from "react";
import { FOCUS_RING } from "../../../../shared-components/surface";

/**
 * The two form controls the wizard steps share. The vocabulary they are driven
 * by — source keys, step keys, display-name prefills — lives in
 * `wizard-vocabulary.ts`, so this module exports components only.
 */

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

/**
 * A small segmented control — the same visual as the tool tablist in
 * `tool-tabs.tsx`, sized down for binary/short choices (personal|work,
 * github|gitlab, cadence).
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
}>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex flex-wrap gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-800"
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={cx(
              "rounded-full px-3 py-1 text-xs font-medium transition",
              FOCUS_RING,
              isActive
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A native `<select>` styled exactly like the per-employer picker in
 * `disclosure-panel.tsx` / `connection-dialog.tsx` — the shared `SelectField`
 * is a react-select bound to a react-hook-form `Control`, which the wizard
 * does not use.
 */
export function WizardFieldSelect({
  id,
  label,
  value,
  onChange,
  children,
  helperText,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  helperText?: string;
}>) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cx(
          "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
          FOCUS_RING,
        )}
      >
        {children}
      </select>
      {helperText ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
