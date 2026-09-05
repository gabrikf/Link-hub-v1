import { postsBlockConfigSchema, type PostsBlockConfig } from "@repo/schemas";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { Input } from "../../../shared-components/input";

type PostsBlockDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConfig?: PostsBlockConfig | null;
  isSubmitting?: boolean;
  onSubmit: (config: PostsBlockConfig) => Promise<void> | void;
}>;

type PostsBlockFormProps = Omit<PostsBlockDialogProps, "open">;

/**
 * The fields live here, not on the dialog, and this form is mounted only while
 * the dialog is open. Every open therefore starts from `initialConfig` by
 * construction, instead of an effect copying props into state after the fact.
 */
function PostsBlockForm({
  onOpenChange,
  initialConfig,
  isSubmitting = false,
  onSubmit,
}: PostsBlockFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialConfig?.title ?? "");
  const [limit, setLimit] = useState(initialConfig?.limit ?? 5);
  const [layout, setLayout] = useState<"list" | "grid">(
    initialConfig?.layout ?? "list",
  );
  const [tag, setTag] = useState(initialConfig?.tag ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const parsed = postsBlockConfigSchema.safeParse({
      title: title.trim() || undefined,
      limit,
      layout,
      tag: tag.trim() || undefined,
    });

    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? t("layout.postsBlock.reviewOptions"),
      );
      return;
    }

    await onSubmit(parsed.data);
    onOpenChange(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("layout.postsBlock.help")}
      </p>

      <Input
        id="posts-block-title"
        label={t("layout.postsBlock.headingOptional")}
        value={title}
        maxLength={120}
        placeholder={t("layout.postsBlock.headingPlaceholder")}
        onChange={(event) => setTitle(event.target.value)}
      />

      <Input
        id="posts-block-limit"
        label={t("layout.postsBlock.numberOfPosts")}
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
          {t("common.layout")}
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
              {t(
                option === "list"
                  ? "layout.postsBlock.list"
                  : "layout.postsBlock.grid",
              )}
            </button>
          ))}
        </div>
      </div>

      <Input
        id="posts-block-tag"
        label={t("layout.postsBlock.filterByTag")}
        value={tag}
        maxLength={60}
        placeholder={t("layout.postsBlock.tagPlaceholder")}
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

export function PostsBlockDialog({
  open,
  onOpenChange,
  initialConfig,
  isSubmitting = false,
  onSubmit,
}: PostsBlockDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        initialConfig ? t("layout.postsBlock.edit") : t("layout.postsBlock.add")
      }
      contentClassName="max-w-md"
    >
      {open ? (
        <PostsBlockForm
          onOpenChange={onOpenChange}
          initialConfig={initialConfig}
          isSubmitting={isSubmitting}
          onSubmit={onSubmit}
        />
      ) : null}
    </Dialog>
  );
}
