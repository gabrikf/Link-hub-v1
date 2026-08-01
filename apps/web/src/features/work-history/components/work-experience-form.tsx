import { useState, type FormEvent } from "react";
import type {
  CreateWorkExperienceInput,
  WorkExperienceResponse,
} from "@repo/schemas";
import { Button } from "../../../shared-components/button";
import { Input } from "../../../shared-components/input";
import { TextArea } from "../../../shared-components/text-area";

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "freelance", label: "Freelance" },
  { value: "internship", label: "Internship" },
  { value: "temporary", label: "Temporary" },
] as const;

const WORK_MODEL_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on-site", label: "On-site" },
] as const;

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
  submitLabel = "Save experience",
  onSubmit,
  onCancel,
}: WorkExperienceFormProps) {
  const [state, setState] = useState<FormState>(() =>
    buildInitialState(initialValue),
  );
  const [error, setError] = useState<string | null>(null);

  const update = <Key extends keyof FormState>(
    key: Key,
    value: FormState[Key],
  ) => {
    setState((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!state.title.trim() || !state.companyName.trim()) {
      setError("Title and company name are required.");
      return;
    }

    const startDate = state.startMonth ? `${state.startMonth}-01` : null;
    const endDate =
      state.isCurrent || !state.endMonth ? null : `${state.endMonth}-01`;

    if (startDate && endDate && startDate > endDate) {
      setError("Start date must be before the end date.");
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
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          id="work-title"
          label="Title *"
          placeholder="Senior Software Engineer"
          value={state.title}
          onChange={(event) => update("title", event.target.value)}
        />
        <Input
          id="work-company"
          label="Company *"
          placeholder="Acme Inc."
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
            Employment type
          </label>
          <select
            id="work-employment-type"
            className={selectClassName}
            value={state.employmentType}
            onChange={(event) => update("employmentType", event.target.value)}
          >
            <option value="">Not specified</option>
            {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
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
            Work model
          </label>
          <select
            id="work-model"
            className={selectClassName}
            value={state.workModel}
            onChange={(event) => update("workModel", event.target.value)}
          >
            <option value="">Not specified</option>
            {WORK_MODEL_OPTIONS.map((option) => (
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
          label="City"
          placeholder="Lisbon"
          value={state.locationCity}
          onChange={(event) => update("locationCity", event.target.value)}
        />
        <Input
          id="work-state"
          label="State / Region"
          placeholder="Lisbon"
          value={state.locationState}
          onChange={(event) => update("locationState", event.target.value)}
        />
        <Input
          id="work-country"
          label="Country"
          placeholder="Portugal"
          value={state.locationCountry}
          onChange={(event) => update("locationCountry", event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          id="work-start"
          label="Start date"
          type="month"
          value={state.startMonth}
          onChange={(event) => update("startMonth", event.target.value)}
        />
        <Input
          id="work-end"
          label="End date"
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
        I currently work here
      </label>

      <TextArea
        id="work-description"
        label="Description / achievements"
        rows={4}
        placeholder="What you built, owned, and achieved..."
        value={state.description}
        onChange={(event) => update("description", event.target.value)}
      />

      <Input
        id="work-stack"
        label="Main stack (comma separated)"
        placeholder="TypeScript, React, Node.js, PostgreSQL"
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
            Cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          fullWidth={false}
          isLoading={isSubmitting}
          loadingLabel="Saving..."
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
