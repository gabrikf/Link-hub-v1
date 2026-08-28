import { buttonBlockConfigSchema, type ButtonBlockConfig } from "@repo/schemas";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { Input } from "../../../shared-components/input";
import {
  getButtonAccents,
  getButtonIcon,
  getButtonIconOptions,
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
  const { t } = useTranslation();
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
      setError(parsed.error.issues[0]?.message ?? t("layout.buttonBlock.invalid"));
      return;
    }

    await onSubmit(parsed.data);
    onOpenChange(false);
  };

  const PreviewIcon = getButtonIcon(icon);
  const buttonAccents = getButtonAccents(t);
  const buttonIconOptions = getButtonIconOptions(t);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        initialConfig
          ? t("layout.buttonBlock.edit")
          : t("layout.buttonBlock.add")
      }
    >
      <div className="space-y-4">
        <Input
          id="button-block-label"
          label={t("common.label")}
          value={label}
          maxLength={80}
          onChange={(event) => setLabel(event.target.value)}
        />
        <Input
          id="button-block-url"
          label={t("common.url")}
          value={url}
          placeholder={t("common.urlPlaceholder")}
          onChange={(event) => setUrl(event.target.value)}
        />

        <div>
          <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
            {t("common.accent")}
          </span>
          <div className="flex flex-wrap gap-2">
            {buttonAccents.map((option) => (
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
            {t("common.iconOptional")}
          </label>
          <select
            id="button-block-icon"
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">{t("enum.icon.none")}</option>
            {buttonIconOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <span className="mb-2 block text-xs text-zinc-500 dark:text-zinc-400">
            {t("common.preview")}
          </span>
          <span
            style={{ backgroundColor: resolveAccentColor(accent) }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white"
          >
            {PreviewIcon ? (
              <PreviewIcon className="h-4 w-4" aria-hidden="true" />
            ) : null}
            {label || t("layout.buttonBlock.labelPlaceholder")}
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
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            fullWidth={false}
            isLoading={isSubmitting}
            loadingLabel={t("common.saving")}
            onClick={handleSave}
          >
            {t("common.save")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
