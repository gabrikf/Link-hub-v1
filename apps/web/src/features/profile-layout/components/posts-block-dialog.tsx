import { postsBlockConfigSchema, type PostsBlockConfig } from "@repo/schemas";
import { useEffect, useState } from "react";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { Input } from "../../../shared-components/input";

type PostsBlockDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig?: PostsBlockConfig | null;
  isSubmitting?: boolean;
  onSubmit: (config: PostsBlockConfig) => Promise<void> | void;
};

export function PostsBlockDialog({
  open,
  onOpenChange,
  initialConfig,
  isSubmitting = false,
  onSubmit,
}: PostsBlockDialogProps) {
  const [title, setTitle] = useState("");
  const [limit, setLimit] = useState(5);
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [tag, setTag] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialConfig?.title ?? "");
      setLimit(initialConfig?.limit ?? 5);
      setLayout(initialConfig?.layout ?? "list");
      setTag(initialConfig?.tag ?? "");
      setError(null);
    }
  }, [open, initialConfig]);

  const handleSave = async () => {
    const parsed = postsBlockConfigSchema.safeParse({
      title: title.trim() || undefined,
      limit,
      layout,
      tag: tag.trim() || undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please review the options.");
      return;
    }

    await onSubmit(parsed.data);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialConfig ? "Edit posts block" : "Add posts block"}
      contentClassName="max-w-md"
    >
      <div className="space-y-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This block shows your published posts. Manage the posts themselves from
          the Posts page.
        </p>

        <Input
          id="posts-block-title"
          label="Heading (optional)"
          value={title}
          maxLength={120}
          placeholder="e.g. Latest posts"
          onChange={(event) => setTitle(event.target.value)}
        />

        <Input
          id="posts-block-limit"
          label="Number of posts"
          type="number"
          min={1}
          max={20}
          value={limit}
          onChange={(event) => {
            const next = Number(event.target.value);
            setLimit(Number.isNaN(next) ? 1 : next);
          }}
        />

        <div>
          <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
            Layout
          </span>
          <div className="flex gap-2">
            {(["list", "grid"] as const).map((option) => (
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

        <Input
          id="posts-block-tag"
          label="Filter by tag (optional)"
          value={tag}
          maxLength={60}
          placeholder="e.g. changelog"
          onChange={(event) => setTag(event.target.value)}
        />

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
