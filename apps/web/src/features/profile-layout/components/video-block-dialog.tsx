import { videoBlockConfigSchema, type VideoBlockConfig } from "@repo/schemas";
import { useEffect, useState } from "react";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { Input } from "../../../shared-components/input";

type VideoBlockDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig?: VideoBlockConfig | null;
  isSubmitting?: boolean;
  onSubmit: (config: VideoBlockConfig) => Promise<void> | void;
};

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

export function VideoBlockDialog({
  open,
  onOpenChange,
  initialConfig,
  isSubmitting = false,
  onSubmit,
}: VideoBlockDialogProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialConfig?.title ?? "");
      setUrl(initialConfig?.url ?? "");
      setError(null);
    }
  }, [open, initialConfig]);

  const provider = detectProvider(url);

  const handleSave = async () => {
    if (!provider) {
      setError("Enter a valid YouTube or Vimeo URL.");
      return;
    }

    const parsed = videoBlockConfigSchema.safeParse({
      title: title.trim() || undefined,
      provider,
      url,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid video block.");
      return;
    }

    await onSubmit(parsed.data);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialConfig ? "Edit video block" : "Add video block"}
    >
      <div className="space-y-4">
        <Input
          id="video-block-title"
          label="Title (optional)"
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Input
          id="video-block-url"
          label="Video URL (YouTube or Vimeo)"
          value={url}
          placeholder="https://www.youtube.com/watch?v=..."
          onChange={(event) => setUrl(event.target.value)}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {provider
            ? `Detected provider: ${provider === "youtube" ? "YouTube" : "Vimeo"}`
            : "Paste a YouTube or Vimeo link."}
        </p>
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
