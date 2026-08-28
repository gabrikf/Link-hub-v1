import type { Post } from "@repo/schemas";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FiCheck, FiLink, FiX } from "react-icons/fi";
import { useUpdatePost } from "../../../lib/post-queries";
import { reportError } from "../../../lib/report-error";
import { Button } from "../../../shared-components/button";
import { FOCUS_RING_FIELD } from "../../../shared-components/surface";
import { isSafeHttpUrl } from "../lib/markdown";

/**
 * The ONE mutable field on a machine-authored post: `externalUrl`.
 *
 * The body stays frozen — locking the text is what makes a generated post
 * verifiable — but a link to the PR, release or demo it describes is
 * provenance, not content, so the API allows attaching one after the fact.
 * This control is that single affordance: a small "Add link" that expands to
 * an inline URL field, never an editor.
 */
export function AttachLinkControl({ post }: { post: Post }) {
  const { t } = useTranslation();
  const updatePost = useUpdatePost();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = url.trim();
    if (!isSafeHttpUrl(trimmed)) {
      setError(t("posts.invalidUrl"));
      return;
    }
    setError(null);
    try {
      await updatePost.mutateAsync({
        postId: post.id,
        patch: { externalUrl: trimmed },
      });
      setEditing(false);
      setUrl("");
    } catch (error) {
      reportError(error, {
        action: "posts.attach-link",
        extra: { postId: post.id },
      });
      setError(t("posts.attachLinkFailed"));
    }
  };

  const cancel = () => {
    setEditing(false);
    setUrl("");
    setError(null);
  };

  if (!editing) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        fullWidth={false}
        onClick={() => setEditing(true)}
      >
        <FiLink className="h-3.5 w-3.5" aria-hidden="true" />
        {t("posts.addLink")}
      </Button>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label htmlFor={`attach-link-${post.id}`} className="sr-only">
        {t("posts.linkUrl")}
      </label>
      <input
        id={`attach-link-${post.id}`}
        type="url"
        placeholder={t("posts.linkUrlPlaceholder")}
        value={url}
        autoFocus
        onChange={(event) => {
          setUrl(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            handleSave();
          }
        }}
        className={`h-9 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${FOCUS_RING_FIELD}`}
      />
      <Button
        type="button"
        size="sm"
        fullWidth={false}
        isLoading={updatePost.isPending}
        loadingLabel={t("common.saving")}
        onClick={handleSave}
      >
        <FiCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {t("common.save")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        fullWidth={false}
        aria-label={t("posts.cancelAddingLink")}
        onClick={cancel}
      >
        <FiX className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      {error ? (
        <p role="alert" className="w-full text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
