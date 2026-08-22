import {
  createPostSchemaInput,
  updatePostSchemaInput,
  type CreatePostInput,
  type Post,
  type PostStatus,
  type UpdatePostInput,
} from "@repo/schemas";
import { useEffect, useState } from "react";
import { FiEye, FiEyeOff, FiPlus, FiTrash2 } from "react-icons/fi";
import { reportError } from "../../../lib/report-error";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { FileUpload } from "../../../shared-components/file-upload";
import { Input } from "../../../shared-components/input";
import { Markdown } from "../lib/markdown";
import { TagInput } from "./tag-input";

type PostComposerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPost?: Post | null;
  isSubmitting?: boolean;
  onSubmit: (input: CreatePostInput | UpdatePostInput) => Promise<void> | void;
};

const EMPTY_IMAGE_ROW = "";

export function PostComposerDialog({
  open,
  onOpenChange,
  initialPost,
  isSubmitting = false,
  onSubmit,
}: PostComposerDialogProps) {
  const isEditing = Boolean(initialPost);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [images, setImages] = useState<string[]>([EMPTY_IMAGE_ROW]);
  const [tags, setTags] = useState<string[]>([]);
  const [externalUrl, setExternalUrl] = useState("");
  const [status, setStatus] = useState<PostStatus>("published");
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle(initialPost?.title ?? "");
    setBody(initialPost?.body ?? "");
    setCoverImageUrl(initialPost?.coverImageUrl ?? "");
    setImages(
      initialPost?.images && initialPost.images.length > 0
        ? [...initialPost.images]
        : [EMPTY_IMAGE_ROW],
    );
    setTags(initialPost?.tags ?? []);
    setExternalUrl(initialPost?.externalUrl ?? "");
    setStatus(initialPost?.status ?? "published");
    setShowPreview(false);
    setError(null);
  }, [open, initialPost]);

  // A post waiting for review can only move forward to "published" (the server
  // rejects `pending_review -> draft`), so "draft" is not offered for one.
  const statusOptions: PostStatus[] =
    initialPost?.status === "pending_review"
      ? ["pending_review", "published"]
      : ["draft", "published"];

  const updateImage = (index: number, url: string) =>
    setImages((current) => current.map((row, i) => (i === index ? url : row)));

  const addImage = () =>
    setImages((current) => [...current, EMPTY_IMAGE_ROW]);

  const removeImage = (index: number) =>
    setImages((current) =>
      current.length === 1 ? current : current.filter((_, i) => i !== index),
    );

  const handleSave = async () => {
    setError(null);

    const cleanedImages = images
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    const draft = {
      title: title.trim() ? title.trim() : null,
      body: body.trim(),
      coverImageUrl: coverImageUrl.trim() ? coverImageUrl.trim() : null,
      images: cleanedImages.length > 0 ? cleanedImages : null,
      tags: tags.length > 0 ? tags : null,
      status,
      externalUrl: externalUrl.trim() ? externalUrl.trim() : null,
    };

    const parsed = isEditing
      ? updatePostSchemaInput.safeParse(draft)
      : createPostSchemaInput.safeParse({ ...draft, source: "manual" });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please review the form.");
      return;
    }

    // A *server* failure used to reject straight through this function: the
    // dialog stayed open with no explanation, the spinner stopped, and clicking
    // Publish again re-fired the same failing request against 200 words the
    // user could not see a reason for losing.
    try {
      await onSubmit(parsed.data);
    } catch (cause) {
      reportError(cause, {
        action: isEditing ? "posts.update" : "posts.create",
        extra: { status },
      });
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : isEditing
            ? "Could not save your changes. Please try again."
            : "Could not publish your post. Please try again.",
      );
      return;
    }

    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Edit post" : "Write a post"}
      contentClassName="max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      <div className="space-y-4">
        <Input
          id="post-title"
          label="Title (optional)"
          value={title}
          maxLength={160}
          placeholder="An optional headline"
          onChange={(event) => setTitle(event.target.value)}
        />

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label
              htmlFor="post-body"
              className="text-sm text-zinc-700 dark:text-zinc-300"
            >
              Body (markdown)
            </label>
            <button
              type="button"
              onClick={() => setShowPreview((value) => !value)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-500/10"
            >
              {showPreview ? (
                <>
                  <FiEyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </>
              ) : (
                <>
                  <FiEye className="h-3.5 w-3.5" aria-hidden="true" />
                  Preview
                </>
              )}
            </button>
          </div>
          {showPreview ? (
            <div className="min-h-[10rem] rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
              {body.trim() ? (
                <Markdown>{body}</Markdown>
              ) : (
                <p className="text-sm text-zinc-400">Nothing to preview yet.</p>
              )}
            </div>
          ) : (
            <textarea
              id="post-body"
              value={body}
              rows={10}
              placeholder={"Write your story in **markdown**.\n\n- Lists, `code`, [links](https://example.com) and headings all work."}
              onChange={(event) => setBody(event.target.value)}
              className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          )}
        </div>

        <FileUpload
          label="Cover image (optional)"
          aspect="cover"
          value={coverImageUrl.trim() || null}
          onChange={(url) => setCoverImageUrl(url ?? "")}
        />

        <div className="space-y-2">
          <span className="block text-sm text-zinc-700 dark:text-zinc-300">
            Inline images (optional)
          </span>
          {images.map((url, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1">
                <FileUpload
                  aspect="cover"
                  value={url.trim() || null}
                  onChange={(next) => updateImage(index, next ?? "")}
                />
              </div>
              <Button
                type="button"
                variant="icon"
                size="icon"
                fullWidth={false}
                aria-label={`Remove image ${index + 1}`}
                disabled={images.length === 1}
                onClick={() => removeImage(index)}
              >
                <FiTrash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            fullWidth={false}
            onClick={addImage}
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" />
            Add image
          </Button>
        </div>

        <TagInput id="post-tags" label="Tags" value={tags} onChange={setTags} />

        <Input
          id="post-external"
          label="External link (optional)"
          value={externalUrl}
          placeholder="https://..."
          onChange={(event) => setExternalUrl(event.target.value)}
        />

        <div>
          <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
            Status
          </span>
          <div className="flex gap-2">
            {statusOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatus(option)}
                className={[
                  "flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize transition",
                  status === option
                    ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-500/60 dark:bg-violet-500/10 dark:text-violet-200"
                    : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800",
                ].join(" ")}
              >
                {option.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

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
            loadingLabel={isEditing ? "Saving..." : "Publishing..."}
            onClick={handleSave}
          >
            {isEditing ? "Save changes" : "Publish"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
