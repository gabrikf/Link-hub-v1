import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { ParsedResumeData, ResumeResponse } from "@repo/schemas";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { FiCheckCircle, FiLoader, FiUploadCloud } from "react-icons/fi";
import { applyResumeImport, parseResumeImport } from "../../../lib/auth-api";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import {
  LoadingLabel,
  Skeleton,
} from "../../../shared-components/skeleton";
import { TextArea } from "../../../shared-components/text-area";
import {
  buildApplyPayload,
  getResumeScalarFields,
  isResumeFieldEmpty,
  parsedValueFor,
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
  t: TFunction,
): ImportSelection {
  const resumeFields = new Set<ResumeScalarField>();

  for (const { key } of getResumeScalarFields(t)) {
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
  const { t } = useTranslation();

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
          t,
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
      title={t("resumeImport.title")}
      description={t("resumeImport.subtitle")}
      contentClassName="max-w-2xl"
    >
      {step === "input" ? (
        <div className="space-y-4">
          {/*
            The AI parse is by far the longest wait in the app (tens of
            seconds), so it gets more than a disabled button: the pick-a-file
            controls step aside for a progress banner plus a skeleton of the
            review screen that is about to replace it.
          */}
          {parseMutation.isPending ? (
            <ResumeParseProgress />
          ) : (
            <>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center transition hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/40">
                <FiUploadCloud className="h-7 w-7 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  {file ? file.name : t("resumeImport.clickToUpload")}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t("resumeImport.parsedByAi")}
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
                {t("resumeImport.orPasteText")}
                <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
              </div>

              <TextArea
                id="resume-paste"
                label={t("resumeImport.pasteResumeText")}
                rows={6}
                placeholder={t("resumeImport.pastePlaceholder")}
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
              />

              {parseMutation.isError ? (
                <FeedbackMessage
                  tone="error"
                  message={
                    parseMutation.error instanceof Error
                      ? parseMutation.error.message
                      : t("resumeImport.parseFailed")
                  }
                />
              ) : null}
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              fullWidth={false}
              onClick={resetAndClose}
            >
              {t("resumeImport.skipForNow")}
            </Button>
            <Button
              type="button"
              fullWidth={false}
              disabled={!canParse}
              isLoading={parseMutation.isPending}
              loadingLabel={t("resumeImport.readingResume")}
              onClick={handleParse}
            >
              {t("resumeImport.parseWithAi")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" && parsed ? (
        <div className="space-y-5">
          {/* `svh`, not `vh`: `vh` resolves against the LARGE viewport, so
              under mobile browser chrome this scroll area was taller than the
              space actually visible. */}
          <div className="max-h-[55svh] space-y-5 overflow-y-auto pr-1">
            <ReviewGroup title={t("resumeImport.profileBasics")}>
              {getResumeScalarFields(t).map(({ key, label }) => {
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
                    note={alreadyFilled ? t("resumeImport.alreadySet") : undefined}
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
                  label={t("resumeImport.displayName")}
                  value={parsed.profileName}
                  note={currentProfileName ? t("resumeImport.alreadySet") : undefined}
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
                  label={t("resumeImport.profileBio")}
                  value={parsed.profileDescription}
                  note={currentProfileDescription ? t("resumeImport.alreadySet") : undefined}
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
                  label={t("common.languages")}
                  value={parsed.spokenLanguages.join(", ")}
                />
              ) : null}
            </ReviewGroup>

            {parsed.titles && parsed.titles.length > 0 ? (
              <ReviewGroup title={t("common.titles")}>
                <ChipToggleList
                  items={parsed.titles}
                  selected={selection.titles}
                  onToggle={(value) => toggleSetItem("titles", value)}
                />
              </ReviewGroup>
            ) : null}

            {parsed.skills && parsed.skills.length > 0 ? (
              <ReviewGroup title={t("common.skills")}>
                <ChipToggleList
                  items={parsed.skills}
                  selected={selection.skills}
                  onToggle={(value) => toggleSetItem("skills", value)}
                />
              </ReviewGroup>
            ) : null}

            {parsed.workExperiences && parsed.workExperiences.length > 0 ? (
              <ReviewGroup title={t("common.workHistory")}>
                <div className="space-y-2">
                  {parsed.workExperiences.map((entry, index) => (
                    <CheckboxRow
                      key={`${entry.title}-${entry.companyName}-${index}`}
                      checked={selection.workIndexes.has(index)}
                      onToggle={() => toggleWork(index)}
                      label={`${entry.title} · ${entry.companyName}`}
                      value={
                        [
                          entry.startDate,
                          entry.isCurrent ? t("common.present") : entry.endDate,
                        ]
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
                  : t("resumeImport.saveFailed")
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
              {t("common.back")}
            </Button>
            <Button
              type="button"
              fullWidth={false}
              isLoading={applyMutation.isPending}
              loadingLabel={t("common.saving")}
              onClick={handleApply}
            >
              {t("resumeImport.applySelected")}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "applied" && result ? (
        <div className="space-y-4 text-center">
          <FiCheckCircle className="mx-auto h-10 w-10 text-emerald-500" />
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {t("resumeImport.profileUpdated")}
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {t("resumeImport.appliedSummary", {
                skillsAdded: result.skillsAdded,
                titlesAdded: result.titlesAdded,
                workExperiencesAdded: result.workExperiencesAdded,
              })}
            </p>
          </div>
          <Button type="button" fullWidth={false} onClick={resetAndClose}>
            {t("common.done")}
          </Button>
        </div>
      ) : null}
    </Dialog>
  );
}

/**
 * What the user looks at while the AI reads their resume.
 *
 * The banner sets an expectation (this is slow, and closing loses it); the
 * skeleton below it is a structural preview of the `review` step that replaces
 * this one — same `ReviewGroup` heading + `space-y-1.5` body, same
 * `CheckboxRow` box (`p-2.5`, 16px checkbox, label line + value line) and the
 * same `px-2.5 py-1` chip rows.
 *
 * The counts are necessarily a guess: how many titles, skills and roles a
 * resume yields is exactly what the parse is about to tell us. They are sized
 * to a typical result so the review step lands near the same scroll height
 * rather than exactly on it.
 */
function ResumeParseProgress() {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-500/30 dark:bg-violet-500/10">
        <p className="flex items-center gap-2.5 text-sm font-medium text-violet-900 dark:text-violet-100">
          <FiLoader
            className="h-4 w-4 shrink-0 animate-spin"
            aria-hidden="true"
          />
          {t("resumeImport.readingYourResume")}
        </p>
        <p className="mt-1 text-xs text-violet-800/80 dark:text-violet-200/80">
          {t("resumeImport.readingDetail")}
        </p>
        <div
          aria-hidden="true"
          className="anim-sheen mt-3 h-1.5 rounded-full bg-violet-200/80 dark:bg-violet-500/25"
        />
      </div>

      <div className="space-y-5 pr-1">
        <ReviewGroupSkeleton>
          <CheckboxRowSkeleton />
          <CheckboxRowSkeleton />
          <CheckboxRowSkeleton />
        </ReviewGroupSkeleton>

        <ReviewGroupSkeleton>
          <ChipRowSkeleton widths={[64, 92, 78]} />
        </ReviewGroupSkeleton>

        <ReviewGroupSkeleton>
          <ChipRowSkeleton widths={[70, 54, 96, 62, 84, 58, 102, 74]} />
        </ReviewGroupSkeleton>

        <ReviewGroupSkeleton>
          <CheckboxRowSkeleton />
          <CheckboxRowSkeleton />
        </ReviewGroupSkeleton>
      </div>

      {/*
        Last, not first: `sr-only` is `position: absolute`, but it is still a
        `space-y-5` sibling, so leading with it would push the banner down by
        a phantom 20px.
      */}
      <LoadingLabel>{t("resumeImport.readingUpToAMinute")}</LoadingLabel>
    </div>
  );
}

/** `<ReviewGroup>` with its heading and body stubbed out. */
function ReviewGroupSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {/* the `mb-2 text-xs` group heading */}
      <div className="mb-2 flex h-4 items-center">
        <Skeleton shape="text" height={10} width={104} />
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

/** `<CheckboxRow>` with a label line and a value line. */
function CheckboxRowSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900">
      <Skeleton height={16} width={16} className="mt-0.5 shrink-0 rounded" />
      <div className="min-w-0 flex-1">
        <div className="flex h-5 items-center">
          <Skeleton shape="text" height={12} width="32%" />
        </div>
        <div className="mt-0.5 flex h-5 items-center">
          <Skeleton shape="text" height={12} width="74%" />
        </div>
      </div>
    </div>
  );
}

/**
 * `<ChipToggleList>` at rest. Hand-rolled rather than `SkeletonChips` so the
 * pills land on the real 26px height (`py-1` + `text-xs` + border) and the real
 * `gap-1.5`.
 */
function ChipRowSkeleton({ widths }: { widths: number[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {widths.map((width, index) => (
        <Skeleton key={index} shape="circle" height={26} width={width} />
      ))}
    </div>
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
