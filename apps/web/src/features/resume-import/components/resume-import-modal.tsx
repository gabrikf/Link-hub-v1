import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { ParsedResumeData, ResumeResponse } from "@repo/schemas";
import { FiCheckCircle, FiUploadCloud } from "react-icons/fi";
import { applyResumeImport, parseResumeImport } from "../../../lib/auth-api";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { TextArea } from "../../../shared-components/text-area";
import {
  buildApplyPayload,
  isResumeFieldEmpty,
  parsedValueFor,
  RESUME_SCALAR_FIELDS,
  type ImportSelection,
  type ResumeScalarField,
} from "../utils/build-apply-payload";

type ResumeImportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentResume: ResumeResponse | null;
  currentProfileName: string;
  currentProfileDescription: string | null;
  onApplied: () => void;
};

type ApplyResult = {
  skillsAdded: number;
  titlesAdded: number;
  workExperiencesAdded: number;
};

const ACCEPTED_TYPES = ".pdf,.doc,.docx,.txt";

function emptySelection(): ImportSelection {
  return {
    resumeFields: new Set(),
    includeLanguages: false,
    includeProfileName: false,
    includeProfileDescription: false,
    skills: new Set(),
    titles: new Set(),
    workIndexes: new Set(),
  };
}

function buildDefaultSelection(
  parsed: ParsedResumeData,
  currentResume: ResumeResponse | null,
  currentProfileName: string,
  currentProfileDescription: string | null,
): ImportSelection {
  const resumeFields = new Set<ResumeScalarField>();

  for (const { key } of RESUME_SCALAR_FIELDS) {
    const hasValue = parsedValueFor(parsed, key) !== null;
    if (hasValue && isResumeFieldEmpty(currentResume, key)) {
      resumeFields.add(key);
    }
  }

  return {
    resumeFields,
    includeLanguages:
      (parsed.spokenLanguages?.length ?? 0) > 0 &&
      (currentResume?.spokenLanguages.length ?? 0) === 0,
    includeProfileName:
      Boolean(parsed.profileName) && currentProfileName.trim().length === 0,
    includeProfileDescription:
      Boolean(parsed.profileDescription) &&
      (currentProfileDescription ?? "").trim().length === 0,
    skills: new Set(parsed.skills ?? []),
    titles: new Set(parsed.titles ?? []),
    workIndexes: new Set((parsed.workExperiences ?? []).map((_, i) => i)),
  };
}

function displayValue(value: string | number | null): string {
  if (value === null) {
    return "";
  }
  return String(value);
}

export function ResumeImportModal({
  open,
  onOpenChange,
  currentResume,
  currentProfileName,
  currentProfileDescription,
  onApplied,
}: ResumeImportModalProps) {
  const [step, setStep] = useState<"input" | "review" | "applied">("input");
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<ParsedResumeData | null>(null);
  const [selection, setSelection] = useState<ImportSelection>(emptySelection);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const parseMutation = useMutation({
    mutationFn: parseResumeImport,
    onSuccess: (response) => {
      setParsed(response.parsed);
      setSelection(
        buildDefaultSelection(
          response.parsed,
          currentResume,
          currentProfileName,
          currentProfileDescription,
        ),
      );
      setStep("review");
    },
  });

  const applyMutation = useMutation({
    mutationFn: applyResumeImport,
    onSuccess: (response) => {
      setResult(response);
      setStep("applied");
      onApplied();
    },
  });

  const resetAndClose = () => {
    onOpenChange(false);
    // Defer reset so the closing animation doesn't flash empty content.
    window.setTimeout(() => {
      setStep("input");
      setFile(null);
      setPasteText("");
      setParsed(null);
      setSelection(emptySelection());
      setResult(null);
      parseMutation.reset();
      applyMutation.reset();
    }, 200);
  };

  const canParse = Boolean(file) || pasteText.trim().length >= 20;

  const handleParse = () => {
    parseMutation.mutate({
      file: file ?? undefined,
      resumeText: pasteText.trim() || undefined,
    });
  };

  const handleApply = () => {
    if (!parsed) {
      return;
    }
    applyMutation.mutate(buildApplyPayload(parsed, selection));
  };

  const toggleResumeField = (key: ResumeScalarField) => {
    setSelection((previous) => {
      const next = new Set(previous.resumeFields);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return { ...previous, resumeFields: next };
    });
  };

  const toggleSetItem = (
    bucket: "skills" | "titles",
    value: string,
  ) => {
    setSelection((previous) => {
      const next = new Set(previous[bucket]);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return { ...previous, [bucket]: next };
    });
  };

  const toggleWork = (index: number) => {
    setSelection((previous) => {
      const next = new Set(previous.workIndexes);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return { ...previous, workIndexes: next };
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          resetAndClose();
        } else {
          onOpenChange(true);
        }
      }}
      title="Fill profile from your resume"
      description="Upload or paste your resume and let AI pre-fill your profile. You review everything before it's saved."
      contentClassName="max-w-2xl"
    >
      {step === "input" ? (
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center transition hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/40">
            <FiUploadCloud className="h-7 w-7 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {file ? file.name : "Click to upload a PDF, DOCX or TXT"}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Your resume is parsed by AI to extract a structured profile.
            </span>
            <input
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>

          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
            or paste text
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
          </div>

          <TextArea
            id="resume-paste"
            label="Paste resume text"
            rows={6}
            placeholder="Paste the content of your resume here..."
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
          />

          {parseMutation.isError ? (
            <FeedbackMessage
              tone="error"
              message={
                parseMutation.error instanceof Error
                  ? parseMutation.error.message
                  : "Could not parse the resume. Try another file."
              }
            />
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              fullWidth={false}
              onClick={resetAndClose}
            >
              Skip for now
            </Button>
            <Button
              type="button"
              fullWidth={false}
              disabled={!canParse || parseMutation.isPending}
              onClick={handleParse}
            >
              {parseMutation.isPending ? "Reading resume..." : "Parse with AI"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" && parsed ? (
        <div className="space-y-5">
          <div className="max-h-[55vh] space-y-5 overflow-y-auto pr-1">
            <ReviewGroup title="Profile basics">
              {RESUME_SCALAR_FIELDS.map(({ key, label }) => {
                const value = parsedValueFor(parsed, key);
                if (value === null) {
                  return null;
                }
                const alreadyFilled = !isResumeFieldEmpty(currentResume, key);
                return (
                  <CheckboxRow
                    key={key}
                    checked={selection.resumeFields.has(key)}
                    onToggle={() => toggleResumeField(key)}
                    label={label}
                    value={displayValue(value)}
                    note={alreadyFilled ? "already set" : undefined}
                  />
                );
              })}

              {parsed.profileName ? (
                <CheckboxRow
                  checked={selection.includeProfileName}
                  onToggle={() =>
                    setSelection((p) => ({
                      ...p,
                      includeProfileName: !p.includeProfileName,
                    }))
                  }
                  label="Display name"
                  value={parsed.profileName}
                  note={currentProfileName ? "already set" : undefined}
                />
              ) : null}

              {parsed.profileDescription ? (
                <CheckboxRow
                  checked={selection.includeProfileDescription}
                  onToggle={() =>
                    setSelection((p) => ({
                      ...p,
                      includeProfileDescription: !p.includeProfileDescription,
                    }))
                  }
                  label="Profile bio"
                  value={parsed.profileDescription}
                  note={currentProfileDescription ? "already set" : undefined}
                />
              ) : null}

              {parsed.spokenLanguages && parsed.spokenLanguages.length > 0 ? (
                <CheckboxRow
                  checked={selection.includeLanguages}
                  onToggle={() =>
                    setSelection((p) => ({
                      ...p,
                      includeLanguages: !p.includeLanguages,
                    }))
                  }
                  label="Languages"
                  value={parsed.spokenLanguages.join(", ")}
                />
              ) : null}
            </ReviewGroup>

            {parsed.titles && parsed.titles.length > 0 ? (
              <ReviewGroup title="Titles">
                <ChipToggleList
                  items={parsed.titles}
                  selected={selection.titles}
                  onToggle={(value) => toggleSetItem("titles", value)}
                />
              </ReviewGroup>
            ) : null}

            {parsed.skills && parsed.skills.length > 0 ? (
              <ReviewGroup title="Skills">
                <ChipToggleList
                  items={parsed.skills}
                  selected={selection.skills}
                  onToggle={(value) => toggleSetItem("skills", value)}
                />
              </ReviewGroup>
            ) : null}

            {parsed.workExperiences && parsed.workExperiences.length > 0 ? (
              <ReviewGroup title="Work history">
                <div className="space-y-2">
                  {parsed.workExperiences.map((entry, index) => (
                    <CheckboxRow
                      key={`${entry.title}-${entry.companyName}-${index}`}
                      checked={selection.workIndexes.has(index)}
                      onToggle={() => toggleWork(index)}
                      label={`${entry.title} · ${entry.companyName}`}
                      value={
                        [entry.startDate, entry.isCurrent ? "Present" : entry.endDate]
                          .filter(Boolean)
                          .join(" — ") || ""
                      }
                    />
                  ))}
                </div>
              </ReviewGroup>
            ) : null}
          </div>

          {applyMutation.isError ? (
            <FeedbackMessage
              tone="error"
              message={
                applyMutation.error instanceof Error
                  ? applyMutation.error.message
                  : "Could not save the imported data."
              }
            />
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              fullWidth={false}
              onClick={() => setStep("input")}
            >
              Back
            </Button>
            <Button
              type="button"
              fullWidth={false}
              disabled={applyMutation.isPending}
              onClick={handleApply}
            >
              {applyMutation.isPending
                ? "Saving..."
                : "Apply selected to my profile"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "applied" && result ? (
        <div className="space-y-4 text-center">
          <FiCheckCircle className="mx-auto h-10 w-10 text-emerald-500" />
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Your profile has been updated.
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Added {result.skillsAdded} skill(s), {result.titlesAdded} title(s)
              and {result.workExperiencesAdded} work experience(s). Profile
              fields were filled where empty.
            </p>
          </div>
          <Button type="button" fullWidth={false} onClick={resetAndClose}>
            Done
          </Button>
        </div>
      ) : null}
    </Dialog>
  );
}

function ReviewGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function CheckboxRow({
  checked,
  onToggle,
  label,
  value,
  note,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-white p-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-zinc-600"
        checked={checked}
        onChange={onToggle}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">
            {label}
          </span>
          {note ? (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              {note}
            </span>
          ) : null}
        </span>
        {value ? (
          <span className="mt-0.5 block whitespace-pre-line break-words text-zinc-600 dark:text-zinc-400">
            {value}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function ChipToggleList({
  items,
  selected,
  onToggle,
}: {
  items: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const isSelected = selected.has(item);
        return (
          <button
            key={item}
            type="button"
            onClick={() => onToggle(item)}
            className={[
              "rounded-full border px-2.5 py-1 text-xs font-medium transition",
              isSelected
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                : "border-zinc-300 bg-white text-zinc-500 line-through dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500",
            ].join(" ")}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}
