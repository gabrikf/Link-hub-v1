// `SubmitEvent`, not the deprecated `FormEvent`: @types/react 19.2 marks
// `FormEvent`/`FormEventHandler` deprecated ("FormEvent doesn't actually
// exist") and types `<form onSubmit>` as `SubmitEventHandler`.
import { useState, type SubmitEvent } from "react";
import type {
  CreateWorkExperienceInput,
  WorkExperienceResponse,
} from "@repo/schemas";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "../../../shared-components/button";
import { Input } from "../../../shared-components/input";
import { TextArea } from "../../../shared-components/text-area";

const getEmploymentTypeOptions = (
  t: TFunction,
): ReadonlyArray<{ value: string; label: string }> => [
  { value: "full-time", label: t("enum.contractType.full-time") },
  { value: "part-time", label: t("enum.contractType.part-time") },
  { value: "contract", label: t("enum.contractType.contract") },
  { value: "freelance", label: t("enum.contractType.freelance") },
  { value: "internship", label: t("enum.contractType.internship") },
  { value: "temporary", label: t("enum.contractType.temporary") },
];

const getWorkModelOptions = (
  t: TFunction,
): ReadonlyArray<{ value: string; label: string }> => [
  { value: "remote", label: t("enum.workModel.remote") },
  { value: "hybrid", label: t("enum.workModel.hybrid") },
  { value: "on-site", label: t("enum.workModel.on-site") },
];

type FormState = {
  title: string;
  companyName: string;
  employmentType: string;
  workModel: string;
  locationCity: string;
  locationState: string;
  locationCountry: string;
  startMonth: string;
  endMonth: string;
  isCurrent: boolean;
  description: string;
  mainStackText: string;
};

function toMonthInput(value: string | null): string {
  return value ? value.slice(0, 7) : "";
}

function buildInitialState(
  initialValue?: WorkExperienceResponse | null,
): FormState {
  return {
    title: initialValue?.title ?? "",
    companyName: initialValue?.companyName ?? "",
    employmentType: initialValue?.employmentType ?? "",
    workModel: initialValue?.workModel ?? "",
    locationCity: initialValue?.locationCity ?? "",
    locationState: initialValue?.locationState ?? "",
    locationCountry: initialValue?.locationCountry ?? "",
    startMonth: toMonthInput(initialValue?.startDate ?? null),
    endMonth: toMonthInput(initialValue?.endDate ?? null),
    isCurrent: initialValue?.isCurrent ?? false,
    description: initialValue?.description ?? "",
    mainStackText: initialValue?.mainStack?.join(", ") ?? "",
  };
}

const selectClassName =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

type WorkExperienceFormProps = {
  initialValue?: WorkExperienceResponse | null;
  isSubmitting?: boolean;
  submitLabel?: string;
  onSubmit: (payload: CreateWorkExperienceInput) => Promise<void> | void;
  onCancel?: () => void;
};

export function WorkExperienceForm({
  initialValue,
  isSubmitting = false,
  submitLabel,
  onSubmit,
  onCancel,
}: Readonly<WorkExperienceFormProps>) {
  const { t } = useTranslation();
  const [state, setState] = useState<FormState>(() =>
    buildInitialState(initialValue),
  );
  const [error, setError] = useState<string | null>(null);

  const resolvedSubmitLabel = submitLabel ?? t("work.saveExperience");
  const employmentTypeOptions = getEmploymentTypeOptions(t);
  const workModelOptions = getWorkModelOptions(t);

  const update = <Key extends keyof FormState>(
    key: Key,
    value: FormState[Key],
  ) => {
    setState((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!state.title.trim() || !state.companyName.trim()) {
      setError(t("work.requiredFields"));
      return;
    }

    const startDate = state.startMonth ? `${state.startMonth}-01` : null;
    const endDate =
      state.isCurrent || !state.endMonth ? null : `${state.endMonth}-01`;

    if (startDate && endDate && startDate > endDate) {
      setError(t("work.dateOrder"));
      return;
    }

    const mainStack = state.mainStackText
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    await onSubmit({
      title: state.title.trim(),
      companyName: state.companyName.trim(),
      employmentType: state.employmentType
        ? (state.employmentType as CreateWorkExperienceInput["employmentType"])
        : null,
      workModel: state.workModel
        ? (state.workModel as CreateWorkExperienceInput["workModel"])
        : null,
      locationCity: state.locationCity.trim() || null,
      locationState: state.locationState.trim() || null,
      locationCountry: state.locationCountry.trim() || null,
      startDate,
      endDate,
      isCurrent: state.isCurrent,
      description: state.description.trim() || null,
      mainStack,
    });
  };

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          id="work-title"
          label={t("work.titleRequired")}
          placeholder={t("work.titlePlaceholder")}
          value={state.title}
          onChange={(event) => update("title", event.target.value)}
        />
        <Input
          id="work-company"
          label={t("work.companyRequired")}
          placeholder={t("work.companyPlaceholder")}
          value={state.companyName}
          onChange={(event) => update("companyName", event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="work-employment-type"
            className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
          >
            {t("work.employmentType")}
          </label>
          <select
            id="work-employment-type"
            className={selectClassName}
            value={state.employmentType}
            onChange={(event) => update("employmentType", event.target.value)}
          >
            <option value="">{t("common.notSpecified")}</option>
            {employmentTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="work-model"
            className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
          >
            {t("common.workModel")}
          </label>
          <select
            id="work-model"
            className={selectClassName}
            value={state.workModel}
            onChange={(event) => update("workModel", event.target.value)}
          >
            <option value="">{t("common.notSpecified")}</option>
            {workModelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          id="work-city"
          label={t("work.city")}
          placeholder={t("work.cityPlaceholder")}
          value={state.locationCity}
          onChange={(event) => update("locationCity", event.target.value)}
        />
        <Input
          id="work-state"
          label={t("work.stateRegion")}
          placeholder={t("work.cityPlaceholder")}
          value={state.locationState}
          onChange={(event) => update("locationState", event.target.value)}
        />
        <Input
          id="work-country"
          label={t("work.country")}
          placeholder={t("work.countryPlaceholder")}
          value={state.locationCountry}
          onChange={(event) => update("locationCountry", event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          id="work-start"
          label={t("work.startDate")}
          type="month"
          value={state.startMonth}
          onChange={(event) => update("startMonth", event.target.value)}
        />
        <Input
          id="work-end"
          label={t("work.endDate")}
          type="month"
          value={state.endMonth}
          disabled={state.isCurrent}
          onChange={(event) => update("endMonth", event.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
          checked={state.isCurrent}
          onChange={(event) => update("isCurrent", event.target.checked)}
        />
        {t("work.currentlyWorkHere")}
      </label>

      {/*
        Eight rows, not four: this field holds a bulleted achievement list, and
        four rows meant a three-bullet entry was already scrolling while you
        wrote it. The hint is there because the line breaks used to be thrown
        away on render, so people had learned not to trust them.
      */}
      <div>
        <TextArea
          id="work-description"
          label={t("work.achievements")}
          rows={8}
          placeholder={t("work.achievementsPlaceholder")}
          aria-describedby="work-description-hint"
          value={state.description}
          onChange={(event) => update("description", event.target.value)}
        />
        <p
          id="work-description-hint"
          className="mt-1 text-xs text-zinc-500 dark:text-zinc-400"
        >
          {t("work.achievementsHint")}
        </p>
      </div>

      <Input
        id="work-stack"
        label={t("work.mainStack")}
        placeholder={t("work.mainStackPlaceholder")}
        value={state.mainStackText}
        onChange={(event) => update("mainStackText", event.target.value)}
      />

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            onClick={onCancel}
          >
            {t("common.cancel")}
          </Button>
        ) : null}
        <Button
          type="submit"
          fullWidth={false}
          isLoading={isSubmitting}
          loadingLabel={t("common.saving")}
        >
          {resolvedSubmitLabel}
        </Button>
      </div>
    </form>
  );
}
