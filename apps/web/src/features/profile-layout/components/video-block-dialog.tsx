import { videoBlockConfigSchema, type VideoBlockConfig } from "@repo/schemas";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { Input } from "../../../shared-components/input";

type VideoBlockDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig?: VideoBlockConfig | null;
  isSubmitting?: boolean;
  onSubmit: (config: VideoBlockConfig) => Promise<void> | void;
}>;

type VideoBlockFormProps = Omit<VideoBlockDialogProps, "open">;

/** Auto-detect the provider from the URL so the user only pastes a link. */
function detectProvider(url: string): "youtube" | "vimeo" | null {
  if (/youtube\.com|youtu\.be/i.test(url)) {
    return "youtube";
  }
  if (/vimeo\.com/i.test(url)) {
    return "vimeo";
  }
  return null;
}

/**
 * The fields live here, not on the dialog, and this form is mounted only while
 * the dialog is open. Every open therefore starts from `initialConfig` by
 * construction, instead of an effect copying props into state after the fact.
 */
function VideoBlockForm({
  onOpenChange,
  initialConfig,
  isSubmitting = false,
  onSubmit,
}: VideoBlockFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialConfig?.title ?? "");
  const [url, setUrl] = useState(initialConfig?.url ?? "");
  const [error, setError] = useState<string | null>(null);

  const provider = detectProvider(url);

  const handleSave = async () => {
    if (!provider) {
      setError(t("layout.videoBlock.invalidUrl"));
      return;
    }

    const parsed = videoBlockConfigSchema.safeParse({
      title: title.trim() || undefined,
      provider,
      url,
    });

    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? t("layout.videoBlock.invalid"),
      );
      return;
    }

    await onSubmit(parsed.data);
    onOpenChange(false);
  };

  return (
    <div className="space-y-4">
      <Input
        id="video-block-title"
        label={t("common.titleOptional")}
        value={title}
        maxLength={120}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Input
        id="video-block-url"
        label={t("layout.videoBlock.urlLabel")}
        value={url}
        placeholder={t("layout.videoBlock.urlPlaceholder")}
        onChange={(event) => setUrl(event.target.value)}
      />
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {provider
          ? t("layout.videoBlock.detectedProvider", {
              provider:
                provider === "youtube"
                  ? t("enum.platform.youtube")
                  : t("enum.platform.vimeo"),
            })
          : t("layout.videoBlock.pasteLink")}
      </p>
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
          onClick={() => {
            void handleSave();
          }}
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

export function VideoBlockDialog({
  open,
  onOpenChange,
  initialConfig,
  isSubmitting = false,
  onSubmit,
}: VideoBlockDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        initialConfig ? t("layout.videoBlock.edit") : t("layout.videoBlock.add")
      }
    >
      {open ? (
        <VideoBlockForm
          onOpenChange={onOpenChange}
          initialConfig={initialConfig}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      ) : null}
    </Dialog>
  );
}
