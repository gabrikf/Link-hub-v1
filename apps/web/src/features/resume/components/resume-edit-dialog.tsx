import type { ResumeResponse } from "@repo/schemas";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiMinus, FiPlus, FiSave, FiX } from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { Input } from "../../../shared-components/input";
import { SelectField } from "../../../shared-components/select";
import { TextArea } from "../../../shared-components/text-area";
import type {
  BulkResumeSkillsInput,
  BulkResumeTitlesInput,
  CatalogItem,
  UpsertResumeInput,
} from "../../../lib/auth-api";
import { reportError } from "../../../lib/report-error";
import type { TFunction } from "i18next";

type SelectOption = {
  value: string;
  label: string;
};

type BooleanOption = {
  value: "yes" | "no";
  label: string;
};

type SkillRow = {
  skillId: string;
  skillName: string;
  yearsExperience: number;
};

type TitleRow = {
  titleId: string;
  titleName: string;
  isPrimary: boolean;
};

type ResumeFormValues = {
  headlineTitle: string;
  summary: string;
  totalYearsExperience: string;
  location: string;
  seniorityLevel: SelectOption | null;
  workModel: SelectOption | null;
  contractType: SelectOption | null;
  salaryExpectationMin: string;
  salaryExpectationMax: string;
  spokenLanguages: SelectOption[];
  noticePeriod: string;
  openToRelocation: BooleanOption;
  selectedSkillOptions: SelectOption[];
  selectedTitleOptions: SelectOption[];
  skills: SkillRow[];
  titles: TitleRow[];
};

type ResumeEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resume: ResumeResponse | null;
  skillsCatalog: CatalogItem[];
  titlesCatalog: CatalogItem[];
  isSavingResume: boolean;
  isSavingSkills: boolean;
  isSavingTitles: boolean;
  onSaveResume: (payload: UpsertResumeInput) => Promise<void>;
  onSaveSkillsBulk: (payload: BulkResumeSkillsInput) => Promise<void>;
  onSaveTitlesBulk: (payload: BulkResumeTitlesInput) => Promise<void>;
  onCreateSkillCatalogItem: (name: string) => Promise<CatalogItem>;
  onCreateTitleCatalogItem: (name: string) => Promise<CatalogItem>;
};

/*
 * These catalogues take `t` rather than closing over the i18next singleton.
 *
 * An earlier version called `t()` at module scope, which resolves once at
 * import time: after a language switch the option lists — and, worse, the label
 * carried on the value react-hook-form already holds — stayed in the old
 * language until a full reload. Threading `t` through keeps both sides live.
 */
const getBooleanOptions = (t: TFunction): BooleanOption[] => [
  { value: "yes", label: t("common.yes") },
  { value: "no", label: t("common.no") },
];

const getSeniorityOptions = (t: TFunction): SelectOption[] => [
  { value: "intern", label: t("enum.seniority.intern") },
  { value: "junior", label: t("enum.seniority.junior") },
  { value: "mid", label: t("enum.seniority.mid") },
  { value: "senior", label: t("enum.seniority.senior") },
  { value: "staff", label: t("enum.seniority.staff") },
  { value: "principal", label: t("enum.seniority.principal") },
];

const getWorkModelOptions = (t: TFunction): SelectOption[] => [
  { value: "remote", label: t("enum.workModel.remote") },
  { value: "hybrid", label: t("enum.workModel.hybrid") },
  { value: "on-site", label: t("enum.workModel.on-site") },
];

const getContractOptions = (t: TFunction): SelectOption[] => [
  { value: "clt", label: t("enum.contractType.clt") },
  { value: "pj", label: t("enum.contractType.pj") },
  { value: "freelance", label: t("enum.contractType.freelance") },
  { value: "contract", label: t("enum.contractType.contract") },
  { value: "full-time", label: t("enum.contractType.full-time") },
  { value: "part-time", label: t("enum.contractType.part-time") },
];

const getCommonLanguageOptions = (t: TFunction): SelectOption[] => [
  { value: "Portuguese", label: t("enum.language.portuguese") },
  { value: "English", label: t("enum.language.english") },
  { value: "Spanish", label: t("enum.language.spanish") },
  { value: "French", label: t("enum.language.french") },
  { value: "German", label: t("enum.language.german") },
  { value: "Italian", label: t("enum.language.italian") },
  { value: "Japanese", label: t("enum.language.japanese") },
  { value: "Mandarin", label: t("enum.language.mandarin") },
];

export function ResumeEditDialog({
  open,
  onOpenChange,
  resume,
  skillsCatalog,
  titlesCatalog,
  isSavingResume,
  isSavingSkills,
  isSavingTitles,
  onSaveResume,
  onSaveSkillsBulk,
  onSaveTitlesBulk,
  onCreateSkillCatalogItem,
  onCreateTitleCatalogItem,
}: ResumeEditDialogProps) {
  const { t } = useTranslation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);

  const baseForm = useForm<ResumeFormValues>({
    defaultValues: getBaseDefaultValues(resume, t),
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    baseForm.reset(getBaseDefaultValues(resume, t));
    // `t` is a dependency on purpose: switching language has to re-label the
    // option the form is already holding, not just the list it offers.
  }, [open, resume, baseForm, t]);

  const selectedSkillOptions = useWatch({
    control: baseForm.control,
    name: "selectedSkillOptions",
  });
  const selectedTitleOptions = useWatch({
    control: baseForm.control,
    name: "selectedTitleOptions",
  });
  const selectedLanguages = useWatch({
    control: baseForm.control,
    name: "spokenLanguages",
  });
  const skillRows = useWatch({
    control: baseForm.control,
    name: "skills",
  });
  const titleRows = useWatch({
    control: baseForm.control,
    name: "titles",
  });

  useEffect(() => {
    const currentRows = baseForm.getValues("skills");
    const nextRows = selectedSkillOptions.map((option) => {
      const existing = currentRows.find((row) => row.skillId === option.value);

      return (
        existing ?? {
          skillId: option.value,
          skillName: option.label,
          yearsExperience: 0,
        }
      );
    });

    if (!isSameSkillRows(currentRows, nextRows)) {
      baseForm.setValue("skills", nextRows, {
        shouldDirty: true,
        shouldTouch: true,
      });
    }
  }, [baseForm, selectedSkillOptions]);

  useEffect(() => {
    const currentRows = baseForm.getValues("titles");
    const nextRows = selectedTitleOptions.map((option) => {
      const existing = currentRows.find((row) => row.titleId === option.value);

      return (
        existing ?? {
          titleId: option.value,
          titleName: option.label,
          isPrimary: false,
        }
      );
    });

    if (!isSameTitleRows(currentRows, nextRows)) {
      baseForm.setValue("titles", nextRows, {
        shouldDirty: true,
        shouldTouch: true,
      });
    }
  }, [baseForm, selectedTitleOptions]);

  const skillOptions = useMemo(() => {
    const optionsByKey = new Map<string, SelectOption>();

    skillsCatalog.forEach((item) => {
      optionsByKey.set(item.id, {
        value: item.id,
        label: item.name,
      });
    });

    selectedSkillOptions.forEach((item) => {
      optionsByKey.set(item.value, item);
    });

    return Array.from(optionsByKey.values());
  }, [selectedSkillOptions, skillsCatalog]);

  const titleOptions = useMemo(() => {
    const optionsByKey = new Map<string, SelectOption>();

    titlesCatalog.forEach((item) => {
      optionsByKey.set(item.id, {
        value: item.id,
        label: item.name,
      });
    });

    selectedTitleOptions.forEach((item) => {
      optionsByKey.set(item.value, item);
    });

    return Array.from(optionsByKey.values());
  }, [selectedTitleOptions, titlesCatalog]);

  const languageOptions = useMemo(() => {
    const optionsByKey = new Map<string, SelectOption>();

    const addOption = (option: SelectOption) => {
      const key = option.value.trim().toLowerCase();

      if (!key || optionsByKey.has(key)) {
        return;
      }

      optionsByKey.set(key, option);
    };

    getCommonLanguageOptions(t).forEach(addOption);
    (resume?.spokenLanguages ?? []).forEach((item) => {
      addOption({ value: item, label: item });
    });
    (selectedLanguages ?? []).forEach(addOption);

    return Array.from(optionsByKey.values());
  }, [resume?.spokenLanguages, selectedLanguages, t]);

  const requestClose = () => {
    if (baseForm.formState.isDirty) {
      setIsCloseConfirmOpen(true);
      return;
    }

    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setErrorMessage(null);
      setSuccessMessage(null);
      onOpenChange(true);
      return;
    }

    requestClose();
  };

  const persistEverything = baseForm.handleSubmit(async (values) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    await onSaveResume({
      headlineTitle: toNullIfEmpty(values.headlineTitle),
      summary: toNullableText(values.summary),
      totalYearsExperience: toNullableInt(values.totalYearsExperience),
      location: toNullIfEmpty(values.location),
      seniorityLevel: values.seniorityLevel
        ? (values.seniorityLevel.value as UpsertResumeInput["seniorityLevel"])
        : null,
      workModel: values.workModel
        ? (values.workModel.value as UpsertResumeInput["workModel"])
        : null,
      contractType: values.contractType
        ? (values.contractType.value as UpsertResumeInput["contractType"])
        : null,
      salaryExpectationMin: toNullableInt(values.salaryExpectationMin),
      salaryExpectationMax: toNullableInt(values.salaryExpectationMax),
      spokenLanguages: values.spokenLanguages
        .map((item) => item.value.trim())
        .filter(Boolean),
      noticePeriod: toNullIfEmpty(values.noticePeriod),
      openToRelocation: values.openToRelocation.value === "yes",
    });

    await onSaveSkillsBulk({
      items: values.skills.map((item) => ({
        skillId: item.skillId,
        yearsExperience: item.yearsExperience,
      })),
    });

    await onSaveTitlesBulk({
      items: values.titles.map((item) => ({
        titleId: item.titleId,
        isPrimary: item.isPrimary,
      })),
    });

    setSuccessMessage(t("resume.saved"));
    baseForm.reset(values);
  });

  const handleSave = async () => {
    try {
      await persistEverything();
    } catch (error) {
      reportError(error, { action: "resume.save" });
      setErrorMessage(
        error instanceof Error ? error.message : t("resume.saveFailed"),
      );
    }
  };

  const handleSaveAndClose = async () => {
    try {
      await persistEverything();
      setIsCloseConfirmOpen(false);
      onOpenChange(false);
    } catch (error) {
      reportError(error, { action: "resume.save-and-close" });
      setErrorMessage(
        error instanceof Error ? error.message : t("resume.saveFailed"),
      );
    }
  };

  const handleCreateLanguageOption = (inputValue: string) => {
    const normalized = inputValue.trim();

    if (!normalized) {
      return;
    }

    const current = baseForm.getValues("spokenLanguages");
    const alreadyExists = current.some(
      (item) => item.value.toLowerCase() === normalized.toLowerCase(),
    );

    if (alreadyExists) {
      return;
    }

    baseForm.setValue(
      "spokenLanguages",
      [...current, { value: normalized, label: normalized }],
      { shouldDirty: true, shouldTouch: true },
    );
  };

  const handleCreateSkillOption = async (inputValue: string) => {
    const normalized = inputValue.trim();

    if (!normalized) {
      return;
    }

    try {
      const created = await onCreateSkillCatalogItem(normalized);
      const current = baseForm.getValues("selectedSkillOptions");
      const exists = current.some((item) => item.value === created.id);

      if (!exists) {
        baseForm.setValue(
          "selectedSkillOptions",
          [...current, { value: created.id, label: created.name }],
          { shouldDirty: true, shouldTouch: true },
        );
      }

      setSuccessMessage(t("resume.skillCreated"));
      setErrorMessage(null);
    } catch (error) {
      reportError(error, { action: "resume.create-skill-option" });
      setErrorMessage(
        error instanceof Error ? error.message : t("resume.skillCreateFailed"),
      );
    }
  };

  const handleCreateTitleOption = async (inputValue: string) => {
    const normalized = inputValue.trim();

    if (!normalized) {
      return;
    }

    try {
      const created = await onCreateTitleCatalogItem(normalized);
      const current = baseForm.getValues("selectedTitleOptions");
      const exists = current.some((item) => item.value === created.id);

      if (!exists) {
        baseForm.setValue(
          "selectedTitleOptions",
          [...current, { value: created.id, label: created.name }],
          { shouldDirty: true, shouldTouch: true },
        );
      }

      setSuccessMessage(t("resume.titleCreated"));
      setErrorMessage(null);
    } catch (error) {
      reportError(error, { action: "resume.create-title-option" });
      setErrorMessage(
        error instanceof Error ? error.message : t("resume.titleCreateFailed"),
      );
    }
  };

  const updateSkillYears = (skillId: string, delta: number) => {
    const rows = baseForm.getValues("skills");
    const nextRows = rows.map((row) => {
      if (row.skillId !== skillId) {
        return row;
      }

      return {
        ...row,
        yearsExperience: Math.max(0, Math.min(60, row.yearsExperience + delta)),
      };
    });

    baseForm.setValue("skills", nextRows, {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const togglePrimaryTitle = (titleId: string) => {
    const rows = baseForm.getValues("titles");
    const clicked = rows.find((row) => row.titleId === titleId);

    if (!clicked) {
      return;
    }

    const shouldBePrimary = !clicked.isPrimary;

    const nextRows = rows.map((row) => {
      if (row.titleId === titleId) {
        return { ...row, isPrimary: shouldBePrimary };
      }

      return shouldBePrimary ? { ...row, isPrimary: false } : row;
    });

    baseForm.setValue("titles", nextRows, {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const isSavingAny = isSavingResume || isSavingSkills || isSavingTitles;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
        title={t("resume.editResume")}
        description={t("resume.editSubtitle")}
        contentClassName="!w-[96vw] !max-w-none max-h-[92svh] xl:!w-[1400px]"
        buttons={
          <>
            <Button
              type="button"
              variant="outline"
              fullWidth={false}
              onClick={requestClose}
            >
              <FiX className="h-4 w-4" aria-hidden="true" />
              {t("common.close")}
            </Button>
            <Button
              type="button"
              fullWidth={false}
              onClick={handleSave}
              isLoading={isSavingAny}
              loadingLabel={t("common.saving")}
            >
              <FiSave className="h-4 w-4" aria-hidden="true" />
              {t("resume.saveResume")}
            </Button>
          </>
        }
      >
        <div className="space-y-5 pt-2">
          <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t("resume.baseInformation")}
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                id="resume-headline"
                label={t("resume.headlineTitle")}
                {...baseForm.register("headlineTitle")}
              />
              <Input
                id="resume-location"
                label={t("common.location")}
                {...baseForm.register("location")}
              />
              <Input
                id="resume-total-years"
                label={t("resume.totalYears")}
                type="number"
                min={0}
                max={60}
                {...baseForm.register("totalYearsExperience")}
              />
              <Input
                id="resume-notice"
                label={t("common.noticePeriod")}
                {...baseForm.register("noticePeriod")}
              />
              <Input
                id="resume-salary-min"
                label={t("resume.salaryMin")}
                type="number"
                min={0}
                {...baseForm.register("salaryExpectationMin")}
              />
              <Input
                id="resume-salary-max"
                label={t("resume.salaryMax")}
                type="number"
                min={0}
                {...baseForm.register("salaryExpectationMax")}
              />
            </div>

            <TextArea
              id="resume-summary"
              label={t("common.summary")}
              rows={4}
              {...baseForm.register("summary")}
            />

            <SelectField
              id="resume-languages"
              label={t("resume.spokenLanguages")}
              name="spokenLanguages"
              control={baseForm.control}
              options={languageOptions}
              isMulti
              isCreatable
              onCreateOption={handleCreateLanguageOption}
              closeMenuOnSelect={false}
              placeholder={t("resume.selectLanguagesPlaceholder")}
              helperText={t("resume.languagesHelp")}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectField
                id="resume-seniority"
                label={t("common.seniority")}
                name="seniorityLevel"
                control={baseForm.control}
                options={getSeniorityOptions(t)}
                isClearable
              />
              <SelectField
                id="resume-work-model"
                label={t("common.workModel")}
                name="workModel"
                control={baseForm.control}
                options={getWorkModelOptions(t)}
                isClearable
              />
              <SelectField
                id="resume-contract"
                label={t("common.contractType")}
                name="contractType"
                control={baseForm.control}
                options={getContractOptions(t)}
                isClearable
              />
              <SelectField
                id="resume-relocation"
                label={t("common.openToRelocation")}
                name="openToRelocation"
                control={baseForm.control}
                options={getBooleanOptions(t)}
              />
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t("common.skills")}
            </h4>
            <SelectField
              id="resume-skills-multi"
              label={t("resume.selectSkills")}
              name="selectedSkillOptions"
              control={baseForm.control}
              options={skillOptions}
              placeholder={t("resume.selectSkillsPlaceholder")}
              isCreatable
              isMulti
              closeMenuOnSelect={false}
              onCreateOption={handleCreateSkillOption}
              helperText={t("resume.skillsHelp")}
            />

            {skillRows.length > 0 ? (
              <div className="space-y-2">
                {skillRows.map((row) => (
                  <div
                    key={row.skillId}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {row.skillName}
                    </span>
                    <div className="inline-flex items-center gap-2">
                      <Button
                        type="button"
                        variant="icon"
                        size="icon"
                        fullWidth={false}
                        onClick={() => updateSkillYears(row.skillId, -1)}
                        aria-label={t("resume.decreaseYears", {
                          skillName: row.skillName,
                        })}
                      >
                        <FiMinus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <span className="w-10 text-center text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {row.yearsExperience}
                      </span>
                      <Button
                        type="button"
                        variant="icon"
                        size="icon"
                        fullWidth={false}
                        onClick={() => updateSkillYears(row.skillId, 1)}
                        aria-label={t("resume.increaseYears", {
                          skillName: row.skillName,
                        })}
                      >
                        <FiPlus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {t("resume.noSkillsSelected")}
              </p>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t("common.titles")}
            </h4>
            <SelectField
              id="resume-titles-multi"
              label={t("resume.selectTitles")}
              name="selectedTitleOptions"
              control={baseForm.control}
              options={titleOptions}
              placeholder={t("resume.selectTitlesPlaceholder")}
              isCreatable
              isMulti
              closeMenuOnSelect={false}
              onCreateOption={handleCreateTitleOption}
              helperText={t("resume.titlesHelp")}
            />

            {titleRows.length > 0 ? (
              <div className="space-y-2">
                {titleRows.map((row) => (
                  <div
                    key={row.titleId}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {row.titleName}
                    </span>
                    <Button
                      type="button"
                      variant={row.isPrimary ? "primary" : "outline"}
                      size="sm"
                      fullWidth={false}
                      onClick={() => togglePrimaryTitle(row.titleId)}
                    >
                      {row.isPrimary
                        ? t("common.primary")
                        : t("resume.setPrimary")}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {t("resume.noTitlesSelected")}
              </p>
            )}
          </section>

          {errorMessage ? (
            <FeedbackMessage tone="error" message={errorMessage} />
          ) : null}
          {successMessage ? (
            <FeedbackMessage tone="success" message={successMessage} />
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={isCloseConfirmOpen}
        onOpenChange={setIsCloseConfirmOpen}
        title={t("resume.unsavedChanges")}
        description={t("resume.unsavedChangesBody")}
        buttons={
          <>
            <Button
              type="button"
              variant="outline"
              fullWidth={false}
              onClick={() => setIsCloseConfirmOpen(false)}
            >
              {t("common.keepEditing")}
            </Button>
            <Button
              type="button"
              variant="soft"
              fullWidth={false}
              onClick={handleSaveAndClose}
              isLoading={isSavingAny}
              loadingLabel={t("common.saving")}
            >
              {t("resume.saveAndClose")}
            </Button>
            <Button
              type="button"
              variant="danger"
              fullWidth={false}
              onClick={() => {
                setIsCloseConfirmOpen(false);
                onOpenChange(false);
              }}
            >
              {t("resume.closeWithoutSaving")}
            </Button>
          </>
        }
      />
    </>
  );
}

function getBaseDefaultValues(
  resume: ResumeResponse | null,
  t: TFunction,
): ResumeFormValues {
  return {
    headlineTitle: resume?.headlineTitle ?? "",
    summary: resume?.summary ?? "",
    totalYearsExperience:
      resume?.totalYearsExperience !== null &&
      resume?.totalYearsExperience !== undefined
        ? String(resume.totalYearsExperience)
        : "",
    location: resume?.location ?? "",
    seniorityLevel: toOption(resume?.seniorityLevel, getSeniorityOptions(t)),
    workModel: toOption(resume?.workModel, getWorkModelOptions(t)),
    contractType: toOption(resume?.contractType, getContractOptions(t)),
    salaryExpectationMin:
      resume?.salaryExpectationMin !== null &&
      resume?.salaryExpectationMin !== undefined
        ? String(resume.salaryExpectationMin)
        : "",
    salaryExpectationMax:
      resume?.salaryExpectationMax !== null &&
      resume?.salaryExpectationMax !== undefined
        ? String(resume.salaryExpectationMax)
        : "",
    spokenLanguages: (resume?.spokenLanguages ?? []).map((item) => ({
      value: item,
      label: item,
    })),
    noticePeriod: resume?.noticePeriod ?? "",
    openToRelocation: getBooleanOptions(t)[resume?.openToRelocation ? 0 : 1],
    selectedSkillOptions: (resume?.skills ?? []).map((item) => ({
      value: item.skillId,
      label: item.skillName,
    })),
    selectedTitleOptions: (resume?.titles ?? []).map((item) => ({
      value: item.titleId,
      label: item.titleName,
    })),
    skills: (resume?.skills ?? []).map((item) => ({
      skillId: item.skillId,
      skillName: item.skillName,
      yearsExperience: item.yearsExperience ?? 0,
    })),
    titles: (resume?.titles ?? []).map((item) => ({
      titleId: item.titleId,
      titleName: item.titleName,
      isPrimary: item.isPrimary,
    })),
  };
}

function toOption(value: string | null | undefined, options: SelectOption[]) {
  if (!value) {
    return null;
  }

  return options.find((option) => option.value === value) ?? null;
}

function toNullIfEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableInt(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSameSkillRows(current: SkillRow[], next: SkillRow[]) {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((row, index) => {
    const other = next[index];

    return (
      row.skillId === other.skillId &&
      row.skillName === other.skillName &&
      row.yearsExperience === other.yearsExperience
    );
  });
}

function isSameTitleRows(current: TitleRow[], next: TitleRow[]) {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((row, index) => {
    const other = next[index];

    return (
      row.titleId === other.titleId &&
      row.titleName === other.titleName &&
      row.isPrimary === other.isPrimary
    );
  });
}
