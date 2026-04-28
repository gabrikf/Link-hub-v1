import { FiPaperclip, FiSearch, FiX } from "react-icons/fi";
import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { Button } from "../../../shared-components/button";
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
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
      <TextArea
        id="advanced-search-chat-prompt"
        label="Who are you looking for?"
        placeholder="Paste the job description, upload a file, or describe the ideal candidate in your own words."
        rows={7}
        className="resize-y rounded-xl border-zinc-300 bg-white/90 px-4 py-3 leading-relaxed shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
        {...register("chatPrompt")}
      />

      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Tip: you can search with only the text, only the uploaded file, or both.
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
            Attach JD file
          </Button>

          {attachmentFile ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              {attachmentFile.name}
              <button
                type="button"
                aria-label="Remove attached file"
                className="rounded p-0.5 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
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
          {isBusy ? "Processing..." : "Search Top 50"}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SelectField
          id="semantic-skills"
          label="Semantic skills (optional)"
          name="semanticSkills"
          control={control}
          options={SKILL_OPTIONS}
          isMulti
          isCreatable
          closeMenuOnSelect={false}
          helperText="Used only to improve semantic understanding"
        />

        <SelectField
          id="semantic-titles"
          label="Semantic titles (optional)"
          name="semanticTitles"
          control={control}
          options={TITLE_OPTIONS}
          isMulti
          isCreatable
          closeMenuOnSelect={false}
          helperText="Used only to improve semantic understanding"
        />
      </div>

      {errors.chatPrompt?.message ? (
        <p className="mt-2 text-sm text-red-600">{errors.chatPrompt.message}</p>
      ) : null}
    </div>
  );
}
