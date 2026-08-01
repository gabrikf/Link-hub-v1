import { buttonBlockConfigSchema, type ButtonBlockConfig } from "@repo/schemas";
import { useEffect, useState } from "react";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { Input } from "../../../shared-components/input";
import {
  BUTTON_ACCENTS,
  BUTTON_ICON_OPTIONS,
  getButtonIcon,
  resolveAccentColor,
} from "../button-icons";

type ButtonBlockDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig?: ButtonBlockConfig | null;
  isSubmitting?: boolean;
  onSubmit: (config: ButtonBlockConfig) => Promise<void> | void;
};

export function ButtonBlockDialog({
  open,
  onOpenChange,
  initialConfig,
  isSubmitting = false,
  onSubmit,
}: ButtonBlockDialogProps) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [accent, setAccent] = useState("violet");
  const [icon, setIcon] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setLabel(initialConfig?.label ?? "");
      setUrl(initialConfig?.url ?? "");
      setAccent(initialConfig?.accent ?? "violet");
      setIcon(initialConfig?.icon ?? "");
      setError(null);
    }
  }, [open, initialConfig]);

  const handleSave = async () => {
    const parsed = buttonBlockConfigSchema.safeParse({
      label,
      url,
      accent: accent || undefined,
      icon: icon || undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid button block.");
      return;
    }

    await onSubmit(parsed.data);
    onOpenChange(false);
  };

  const PreviewIcon = getButtonIcon(icon);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialConfig ? "Edit button block" : "Add button block"}
    >
      <div className="space-y-4">
        <Input
          id="button-block-label"
          label="Label"
          value={label}
          maxLength={80}
          onChange={(event) => setLabel(event.target.value)}
        />
        <Input
          id="button-block-url"
          label="URL"
          value={url}
          placeholder="https://..."
          onChange={(event) => setUrl(event.target.value)}
        />

        <div>
          <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
            Accent
          </span>
          <div className="flex flex-wrap gap-2">
            {BUTTON_ACCENTS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={option.label}
                aria-pressed={accent === option.value}
                onClick={() => setAccent(option.value)}
                style={{ backgroundColor: option.hex }}
                className={[
                  "h-8 w-8 rounded-full border-2 transition",
                  accent === option.value
                    ? "border-zinc-900 dark:border-white"
                    : "border-transparent",
                ].join(" ")}
              />
            ))}
          </div>
        </div>

        <div>
          <label
            className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
            htmlFor="button-block-icon"
          >
            Icon (optional)
          </label>
          <select
            id="button-block-icon"
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">No icon</option>
            {BUTTON_ICON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <span className="mb-2 block text-xs text-zinc-500 dark:text-zinc-400">
            Preview
          </span>
          <span
            style={{ backgroundColor: resolveAccentColor(accent) }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white"
          >
            {PreviewIcon ? (
              <PreviewIcon className="h-4 w-4" aria-hidden="true" />
            ) : null}
            {label || "Button label"}
          </span>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            fullWidth={false}
            isLoading={isSubmitting}
            loadingLabel="Saving"
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
