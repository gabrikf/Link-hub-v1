import { textBlockConfigSchema, type TextBlockConfig } from "@repo/schemas";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { Input } from "../../../shared-components/input";
import { TextArea } from "../../../shared-components/text-area";

type TextBlockDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig?: TextBlockConfig | null;
  isSubmitting?: boolean;
  onSubmit: (config: TextBlockConfig) => Promise<void> | void;
};

export function TextBlockDialog({
  open,
  onOpenChange,
  initialConfig,
  isSubmitting = false,
  onSubmit,
}: TextBlockDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialConfig?.title ?? "");
      setBody(initialConfig?.body ?? "");
      setError(null);
    }
  }, [open, initialConfig]);

  const handleSave = async () => {
    const parsed = textBlockConfigSchema.safeParse({
      title: title.trim() || undefined,
      body,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("layout.textBlock.invalid"));
      return;
    }

    await onSubmit(parsed.data);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        initialConfig ? t("layout.textBlock.edit") : t("layout.textBlock.add")
      }
    >
      <div className="space-y-4">
        <Input
          id="text-block-title"
          label={t("common.titleOptional")}
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
        />
        <TextArea
          id="text-block-body"
          label={t("common.body")}
          rows={6}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
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
