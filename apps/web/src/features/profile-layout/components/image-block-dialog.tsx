import { imageBlockConfigSchema, type ImageBlockConfig } from "@repo/schemas";
import { useEffect, useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { FileUpload } from "../../../shared-components/file-upload";
import { Input } from "../../../shared-components/input";

type ImageBlockDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig?: ImageBlockConfig | null;
  isSubmitting?: boolean;
  onSubmit: (config: ImageBlockConfig) => Promise<void> | void;
};

type ImageRow = { url: string; alt: string };

export function ImageBlockDialog({
  open,
  onOpenChange,
  initialConfig,
  isSubmitting = false,
  onSubmit,
}: ImageBlockDialogProps) {
  const [title, setTitle] = useState("");
  const [layout, setLayout] = useState<"single" | "gallery">("single");
  const [rows, setRows] = useState<ImageRow[]>([{ url: "", alt: "" }]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialConfig?.title ?? "");
      setLayout(initialConfig?.layout ?? "single");
      setRows(
        initialConfig?.images.map((image) => ({
          url: image.url,
          alt: image.alt ?? "",
        })) ?? [{ url: "", alt: "" }],
      );
      setError(null);
    }
  }, [open, initialConfig]);

  const updateRow = (index: number, patch: Partial<ImageRow>) => {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const addRow = () => setRows((current) => [...current, { url: "", alt: "" }]);

  const removeRow = (index: number) =>
    setRows((current) =>
      current.length === 1 ? current : current.filter((_, i) => i !== index),
    );

  const handleSave = async () => {
    const images = rows
      .filter((row) => row.url.trim().length > 0)
      .map((row) => ({
        url: row.url.trim(),
        alt: row.alt.trim() || undefined,
      }));

    const parsed = imageBlockConfigSchema.safeParse({
      title: title.trim() || undefined,
      layout,
      images,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Add at least one image URL.");
      return;
    }

    await onSubmit(parsed.data);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialConfig ? "Edit image block" : "Add image block"}
      contentClassName="max-w-lg"
    >
      <div className="space-y-4">
        <Input
          id="image-block-title"
          label="Title (optional)"
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
        />

        <div>
          <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
            Layout
          </span>
          <div className="flex gap-2">
            {(["single", "gallery"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLayout(option)}
                className={[
                  "flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize transition",
                  layout === option
                    ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-500/60 dark:bg-violet-500/10 dark:text-violet-200"
                    : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800",
                ].join(" ")}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={index}
              className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Image {index + 1}
                </span>
                <Button
                  type="button"
                  variant="icon"
                  size="icon"
                  fullWidth={false}
                  aria-label={`Remove image ${index + 1}`}
                  disabled={rows.length === 1}
                  onClick={() => removeRow(index)}
                >
                  <FiTrash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <FileUpload
                label="Image"
                aspect="cover"
                value={row.url.trim() || null}
                onChange={(url) => updateRow(index, { url: url ?? "" })}
              />
              <Input
                id={`image-alt-${index}`}
                label="Alt text (optional)"
                value={row.alt}
                maxLength={200}
                onChange={(event) => updateRow(index, { alt: event.target.value })}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            disabled={rows.length >= 12}
            onClick={addRow}
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" />
            Add image
          </Button>
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
            disabled={isSubmitting}
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
