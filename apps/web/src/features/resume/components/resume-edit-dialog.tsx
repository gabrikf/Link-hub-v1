import type { ResumeResponse } from "@repo/schemas";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
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

const booleanOptions: BooleanOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const seniorityOptions: SelectOption[] = [
  { value: "intern", label: "Intern" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "staff", label: "Staff" },
  { value: "principal", label: "Principal" },
];

const workModelOptions: SelectOption[] = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on-site", label: "On-site" },
];

const contractOptions: SelectOption[] = [
  { value: "clt", label: "CLT" },
  { value: "pj", label: "PJ" },
  { value: "freelance", label: "Freelance" },
  { value: "contract", label: "Contract" },
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
];

const defaultBooleanOption = booleanOptions[1];

const commonLanguageOptions: SelectOption[] = [
  { value: "Portuguese", label: "Portuguese" },
  { value: "English", label: "English" },
  { value: "Spanish", label: "Spanish" },
  { value: "French", label: "French" },
  { value: "German", label: "German" },
  { value: "Italian", label: "Italian" },
  { value: "Japanese", label: "Japanese" },
  { value: "Mandarin", label: "Mandarin" },
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);

  const baseForm = useForm<ResumeFormValues>({
    defaultValues: getBaseDefaultValues(resume),
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    baseForm.reset(getBaseDefaultValues(resume));
  }, [open, resume, baseForm]);

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

    commonLanguageOptions.forEach(addOption);
    (resume?.spokenLanguages ?? []).forEach((item) => {
      addOption({ value: item, label: item });
    });
    (selectedLanguages ?? []).forEach(addOption);

    return Array.from(optionsByKey.values());
  }, [resume?.spokenLanguages, selectedLanguages]);

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

    setSuccessMessage("Resume, skills, and titles saved successfully.");
    baseForm.reset(values);
  });

  const handleSave = async () => {
    try {
      await persistEverything();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save resume right now.",
      );
    }
  };

  const handleSaveAndClose = async () => {
    try {
      await persistEverything();
      setIsCloseConfirmOpen(false);
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save resume right now.",
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

      setSuccessMessage("Custom skill created and selected.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create skill.",
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

      setSuccessMessage("Custom title created and selected.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create title.",
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

    baseForm.setValue("skills", nextRows, { shouldDirty: true, shouldTouch: true });
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

    baseForm.setValue("titles", nextRows, { shouldDirty: true, shouldTouch: true });
  };

  const isSavingAny = isSavingResume || isSavingSkills || isSavingTitles;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Edit Resume"
        description="Select multiple skills/titles, adjust years and primary title, then save everything together."
        contentClassName="!w-[96vw] !max-w-none max-h-[92vh] overflow-y-auto xl:!w-[1400px]"
        buttons={
          <>
            <Button
              type="button"
              variant="outline"
              fullWidth={false}
              onClick={requestClose}
            >
              <FiX className="h-4 w-4" aria-hidden="true" />
              Close
            </Button>
            <Button
              type="button"
              fullWidth={false}
              onClick={handleSave}
              disabled={isSavingAny}
            >
              <FiSave className="h-4 w-4" aria-hidden="true" />
              {isSavingAny ? "Saving..." : "Save resume"}
            </Button>
          </>
        }
      >
        <div className="space-y-5 pt-2">
          <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Base information
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                id="resume-headline"
                label="Headline title"
                {...baseForm.register("headlineTitle")}
              />
              <Input
                id="resume-location"
                label="Location"
                {...baseForm.register("location")}
              />
              <Input
                id="resume-total-years"
                label="Total years experience"
                type="number"
                min={0}
                max={60}
                {...baseForm.register("totalYearsExperience")}
              />
              <Input
                id="resume-notice"
                label="Notice period"
                {...baseForm.register("noticePeriod")}
              />
              <Input
                id="resume-salary-min"
                label="Salary expectation min"
                type="number"
                min={0}
                {...baseForm.register("salaryExpectationMin")}
              />
              <Input
                id="resume-salary-max"
                label="Salary expectation max"
                type="number"
                min={0}
                {...baseForm.register("salaryExpectationMax")}
              />
            </div>

            <TextArea
              id="resume-summary"
              label="Summary"
              rows={4}
              {...baseForm.register("summary")}
            />

            <SelectField
              id="resume-languages"
              label="Spoken languages"
              name="spokenLanguages"
              control={baseForm.control}
              options={languageOptions}
              isMulti
              isCreatable
              onCreateOption={handleCreateLanguageOption}
              closeMenuOnSelect={false}
              placeholder="Select or type languages"
              helperText="Pick multiple languages. Type a new one and press enter to add it."
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectField
                id="resume-seniority"
                label="Seniority"
                name="seniorityLevel"
                control={baseForm.control}
                options={seniorityOptions}
                isClearable
              />
              <SelectField
                id="resume-work-model"
                label="Work model"
                name="workModel"
                control={baseForm.control}
                options={workModelOptions}
                isClearable
              />
              <SelectField
                id="resume-contract"
                label="Contract type"
                name="contractType"
                control={baseForm.control}
                options={contractOptions}
                isClearable
              />
              <SelectField
                id="resume-relocation"
                label="Open to relocation"
                name="openToRelocation"
                control={baseForm.control}
                options={booleanOptions}
              />
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Skills
            </h4>
            <SelectField
              id="resume-skills-multi"
              label="Select skills"
              name="selectedSkillOptions"
              control={baseForm.control}
              options={skillOptions}
              placeholder="Select one or more skills"
              isCreatable
              isMulti
              closeMenuOnSelect={false}
              onCreateOption={handleCreateSkillOption}
              helperText="After selecting, each skill appears below with +/- controls for years of experience."
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
                        aria-label={`Decrease ${row.skillName} years`}
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
                        aria-label={`Increase ${row.skillName} years`}
                      >
                        <FiPlus className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No skills selected.
              </p>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Titles
            </h4>
            <SelectField
              id="resume-titles-multi"
              label="Select titles"
              name="selectedTitleOptions"
              control={baseForm.control}
              options={titleOptions}
              placeholder="Select one or more titles"
              isCreatable
              isMulti
              closeMenuOnSelect={false}
              onCreateOption={handleCreateTitleOption}
              helperText="After selecting, titles appear below and you can toggle one as primary."
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
                      {row.isPrimary ? "Primary" : "Set primary"}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No titles selected.
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
        title="Unsaved changes"
        description="If you close now, your unsaved resume, skills, and titles changes will be lost."
        buttons={
          <>
            <Button
              type="button"
              variant="outline"
              fullWidth={false}
              onClick={() => setIsCloseConfirmOpen(false)}
            >
              Keep editing
            </Button>
            <Button
              type="button"
              variant="soft"
              fullWidth={false}
              onClick={handleSaveAndClose}
              disabled={isSavingAny}
            >
              Save and close
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
              Close without saving
            </Button>
          </>
        }
      />
    </>
  );
}

function getBaseDefaultValues(resume: ResumeResponse | null): ResumeFormValues {
  return {
    headlineTitle: resume?.headlineTitle ?? "",
    summary: resume?.summary ?? "",
    totalYearsExperience:
      resume?.totalYearsExperience !== null &&
      resume?.totalYearsExperience !== undefined
        ? String(resume.totalYearsExperience)
        : "",
    location: resume?.location ?? "",
    seniorityLevel: toOption(resume?.seniorityLevel, seniorityOptions),
    workModel: toOption(resume?.workModel, workModelOptions),
    contractType: toOption(resume?.contractType, contractOptions),
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
    openToRelocation: resume?.openToRelocation
      ? booleanOptions[0]
      : defaultBooleanOption,
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
