import { FiPaperclip, FiSearch, FiX } from "react-icons/fi";
import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared-components/button";
import { FOCUS_RING } from "../../../shared-components/surface";
import { SelectField } from "../../../shared-components/select";
import { TextArea } from "../../../shared-components/text-area";
import type { AdvancedSearchFormValues } from "../types/advanced-search";
import { SKILL_OPTIONS, TITLE_OPTIONS } from "../types/advanced-search";

type SearchChatComposerProps = {
  control: Control<AdvancedSearchFormValues>;
  register: UseFormRegister<AdvancedSearchFormValues>;
  errors: FieldErrors<AdvancedSearchFormValues>;
  isBusy: boolean;
  attachmentFile: File | null;
  onPickFile: () => void;
  onRemoveFile: () => void;
};

export function SearchChatComposer({
  control,
  register,
  errors,
  isBusy,
  attachmentFile,
  onPickFile,
  onRemoveFile,
}: SearchChatComposerProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
      <TextArea
        id="advanced-search-chat-prompt"
        label={t("search.prompt")}
        placeholder={t("search.promptHelp")}
        rows={7}
        className="resize-y rounded-xl border-zinc-300 bg-white/90 px-4 py-3 leading-relaxed shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
        {...register("chatPrompt")}
      />

      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        {t("search.promptTip")}
      </p>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            onClick={onPickFile}
          >
            <FiPaperclip className="h-4 w-4" aria-hidden="true" />
            {t("search.attachJd")}
          </Button>

          {attachmentFile ? (
            /* Capped and truncated: a long filename pushed the remove-X past
               the container edge at 375px, so the file could not be removed. */
            <span
              title={attachmentFile.name}
              className="inline-flex max-w-[60%] items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <span className="truncate">{attachmentFile.name}</span>
              <button
                type="button"
                aria-label={t("search.removeAttachment")}
                className={`shrink-0 rounded p-0.5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 ${FOCUS_RING}`}
                onClick={onRemoveFile}
              >
                <FiX className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          ) : null}
        </div>

        <Button
          type="submit"
          className="h-11"
          fullWidth={false}
          disabled={isBusy}
        >
          <FiSearch className="h-4 w-4" aria-hidden="true" />
          {isBusy ? t("common.processing") : t("search.searchTop50")}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SelectField
          id="semantic-skills"
          label={t("search.semanticSkills")}
          name="semanticSkills"
          control={control}
          options={SKILL_OPTIONS}
          isMulti
          isCreatable
          closeMenuOnSelect={false}
          helperText={t("search.semanticHelp")}
        />

        <SelectField
          id="semantic-titles"
          label={t("search.semanticTitles")}
          name="semanticTitles"
          control={control}
          options={TITLE_OPTIONS}
          isMulti
          isCreatable
          closeMenuOnSelect={false}
          helperText={t("search.semanticHelp")}
        />
      </div>

      {errors.chatPrompt?.message ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {errors.chatPrompt.message}
        </p>
      ) : null}
    </div>
  );
}
