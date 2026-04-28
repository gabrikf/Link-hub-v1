import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { Input } from "../../../shared-components/input";
import { SelectField } from "../../../shared-components/select";
import type { AdvancedSearchFormValues } from "../types/advanced-search";
import {
  CONTRACT_TYPE_OPTIONS,
  LANGUAGE_OPTIONS,
  LOCATION_OPTIONS,
  NOTICE_PERIOD_OPTIONS,
  OPEN_TO_RELOCATION_OPTIONS,
  SENIORITY_OPTIONS,
  SKILL_OPTIONS,
  TITLE_OPTIONS,
  WORK_MODEL_OPTIONS,
} from "../types/advanced-search";

type SearchMandatoryFiltersProps = {
  control: Control<AdvancedSearchFormValues>;
  register: UseFormRegister<AdvancedSearchFormValues>;
  errors: FieldErrors<AdvancedSearchFormValues>;
  isOpen: boolean;
  onToggle: () => void;
};

export function SearchMandatoryFilters({
  control,
  register,
  errors,
  isOpen,
  onToggle,
}: SearchMandatoryFiltersProps) {
  return (
    <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200"
      >
        {isOpen ? (
          <FiChevronUp className="h-4 w-4" aria-hidden="true" />
        ) : (
          <FiChevronDown className="h-4 w-4" aria-hidden="true" />
        )}
        Mandatory information (used in WHERE filters)
      </button>

      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        You can leave all fields empty. Any field you fill here becomes a strict
        candidate filter.
      </p>

      {isOpen ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            id="filter-contract-types"
            label="Contract type"
            name="contractTypes"
            control={control}
            isMulti
            closeMenuOnSelect={false}
            options={CONTRACT_TYPE_OPTIONS.map((item) => ({
              value: item,
              label: item,
            }))}
          />

          <SelectField
            id="filter-seniority"
            label="Seniority"
            name="seniorityLevels"
            control={control}
            isMulti
            closeMenuOnSelect={false}
            options={SENIORITY_OPTIONS.map((item) => ({
              value: item,
              label: item,
            }))}
          />

          <SelectField
            id="filter-work-model"
            label="Work model"
            name="workModels"
            control={control}
            isMulti
            closeMenuOnSelect={false}
            options={WORK_MODEL_OPTIONS.map((item) => ({
              value: item,
              label: item,
            }))}
          />

          <SelectField
            id="filter-open-to-relocation"
            label="Open to relocation"
            name="openToRelocation"
            control={control}
            options={OPEN_TO_RELOCATION_OPTIONS}
          />

          <Input
            id="filter-min-years"
            label="Min years experience"
            placeholder="0"
            inputMode="numeric"
            error={errors.minYearsExperience?.message}
            {...register("minYearsExperience")}
          />

          <Input
            id="filter-max-years"
            label="Max years experience"
            placeholder="20"
            inputMode="numeric"
            error={errors.maxYearsExperience?.message}
            {...register("maxYearsExperience")}
          />

          <SelectField
            id="filter-locations"
            label="Locations"
            name="locations"
            control={control}
            options={LOCATION_OPTIONS}
            isMulti
            isCreatable
            closeMenuOnSelect={false}
            helperText="Select multiple locations or type a new one"
            className="sm:col-span-2 lg:col-span-3"
          />

          <SelectField
            id="filter-languages"
            label="Languages"
            name="spokenLanguages"
            control={control}
            options={LANGUAGE_OPTIONS}
            isMulti
            isCreatable
            closeMenuOnSelect={false}
            helperText="Select multiple languages or type a new one"
          />

          <SelectField
            id="filter-notice-period"
            label="Notice period"
            name="noticePeriods"
            control={control}
            options={NOTICE_PERIOD_OPTIONS}
            isMulti
            isCreatable
            closeMenuOnSelect={false}
          />

          <SelectField
            id="filter-mandatory-skills"
            label="Skills"
            name="mandatorySkills"
            control={control}
            options={SKILL_OPTIONS}
            isMulti
            isCreatable
            closeMenuOnSelect={false}
            helperText="Strict filter in WHERE query"
          />

          <SelectField
            id="filter-mandatory-titles"
            label="Titles"
            name="mandatoryTitles"
            control={control}
            options={TITLE_OPTIONS}
            isMulti
            isCreatable
            closeMenuOnSelect={false}
            helperText="Strict filter in WHERE query"
          />

          <Input
            id="filter-min-salary"
            label="Min salary"
            placeholder="3000"
            inputMode="numeric"
            error={errors.minSalary?.message}
            {...register("minSalary")}
          />

          <Input
            id="filter-max-salary"
            label="Max salary"
            placeholder="8000"
            inputMode="numeric"
            error={errors.maxSalary?.message}
            {...register("maxSalary")}
          />

          <Input
            id="filter-name-contains"
            label="Name contains"
            placeholder="Ana"
            {...register("nameContains")}
          />

          <Input
            id="filter-username-contains"
            label="Username contains"
            placeholder="ana.dev"
            {...register("usernameContains")}
          />

          <Input
            id="filter-profile-text-contains"
            label="Profile text contains"
            placeholder="distributed systems"
            className="sm:col-span-2 lg:col-span-3"
            {...register("profileTextContains")}
          />
        </div>
      ) : null}
    </div>
  );
}
