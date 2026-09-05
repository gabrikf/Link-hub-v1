import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { FiX } from "react-icons/fi";

type TagInputProps = Readonly<{
  id: string;
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  max?: number;
}>;

export function TagInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  max = 12,
}: TagInputProps) {
  const { t } = useTranslation();
  const effectivePlaceholder = placeholder ?? t("posts.addTagPlaceholder");
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const tag = raw.trim().replace(/^#/, "");
    if (tag.length === 0 || value.length >= max) {
      setDraft("");
      return;
    }
    if (
      !value.some((existing) => existing.toLowerCase() === tag.toLowerCase())
    ) {
      onChange([...value, tag]);
    }
    setDraft("");
  };

  const removeAt = (index: number) =>
    onChange(value.filter((_, i) => i !== index));

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(draft);
    } else if (
      event.key === "Backspace" &&
      draft.length === 0 &&
      value.length > 0
    ) {
      removeAt(value.length - 1);
    }
  };

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-zinc-300 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
        {value.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"
          >
            #{tag}
            <button
              type="button"
              aria-label={t("posts.removeTag", { tag })}
              onClick={() => removeAt(index)}
              className="text-violet-500 hover:text-violet-800 dark:hover:text-violet-100"
            >
              <FiX className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={
            value.length >= max
              ? t("posts.tagLimitReached")
              : effectivePlaceholder
          }
          disabled={value.length >= max}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => commit(draft)}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-zinc-900 outline-none disabled:cursor-not-allowed dark:text-zinc-100"
        />
      </div>
    </div>
  );
}
