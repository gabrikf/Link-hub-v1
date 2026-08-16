import type { GitConnectionKind } from "@repo/schemas";
import type { ReactNode } from "react";
import { FOCUS_RING } from "../../../../shared-components/surface";

/**
 * Shared vocabulary for the auto-post wizard steps. Kept out of the main file
 * so each step module can import types without a cycle through the dialog.
 */

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * What the user picks on step 1. `forge` folds GitHub and GitLab into one
 * card — which forge it is becomes a segmented choice inside the card, because
 * the decision that matters (webhook vs. local tool vs. agent) is the card.
 */
export type WizardSourceKey = "mcp" | "claude_code" | "extractor" | "forge";

export type ForgeProvider = "github" | "gitlab";

export type WizardStepKey =
  | "source"
  | "connect"
  | "verify"
  | "preview"
  | "schedule";

export const WIZARD_STEPS: ReadonlyArray<{
  key: WizardStepKey;
  label: string;
}> = [
  { key: "source", label: "Source" },
  { key: "connect", label: "Connect" },
  { key: "verify", label: "Verify" },
  { key: "preview", label: "Preview" },
  { key: "schedule", label: "Schedule" },
];

/**
 * Prefilled display names. A name like "Work laptop — Claude Code" is what the
 * connection list needs six months later; an empty field invites "test".
 *
 * Kind-aware: a "Personal" selection prefilling "Work laptop — …" reads as the
 * wizard contradicting the choice the user just made. `mixed` is neither
 * laptop, so it names the machine without claiming which half it belongs to.
 */
export function defaultLocalDisplayName(
  key: Exclude<WizardSourceKey, "mcp" | "forge">,
  kind: GitConnectionKind,
): string {
  const machine =
    kind === "work"
      ? "Work laptop"
      : kind === "mixed"
        ? "This machine"
        : "Personal laptop";
  const tool = key === "claude_code" ? "Claude Code" : "extractor";
  return `${machine} — ${tool}`;
}

export const DEFAULT_FORGE_DISPLAY_NAMES: Record<ForgeProvider, string> = {
  github: "My GitHub repos",
  gitlab: "My GitLab projects",
};

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
}: {
  label: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
}) {
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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  helperText?: string;
}) {
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
