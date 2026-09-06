import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { useTranslation } from "react-i18next";
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

type SearchMandatoryFiltersProps = Readonly<{
  control: Control<AdvancedSearchFormValues>;
  register: UseFormRegister<AdvancedSearchFormValues>;
  errors: FieldErrors<AdvancedSearchFormValues>;
  isOpen: boolean;
  onToggle: () => void;
}>;

export function SearchMandatoryFilters({
  control,
  register,
  errors,
  isOpen,
  onToggle,
}: SearchMandatoryFiltersProps) {
  const { t } = useTranslation();

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
        {t("search.mandatoryFilters")}
      </button>

      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {t("search.mandatoryFiltersHelp")}
      </p>

      {isOpen ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            id="filter-contract-types"
            label={t("common.contractType")}
            name="contractTypes"
            control={control}
            isMulti
            closeMenuOnSelect={false}
            options={CONTRACT_TYPE_OPTIONS.map((item) => ({
              value: item,
              label: t(`enum.contractType.${item}`),
            }))}
          />

          <SelectField
            id="filter-seniority"
            label={t("common.seniority")}
            name="seniorityLevels"
            control={control}
            isMulti
            closeMenuOnSelect={false}
            options={SENIORITY_OPTIONS.map((item) => ({
              value: item,
              label: t(`enum.seniority.${item}`),
            }))}
          />

          <SelectField
            id="filter-work-model"
            label={t("common.workModel")}
            name="workModels"
            control={control}
            isMulti
            closeMenuOnSelect={false}
            options={WORK_MODEL_OPTIONS.map((item) => ({
              value: item,
              label: t(`enum.workModel.${item}`),
            }))}
          />

          <SelectField
            id="filter-open-to-relocation"
            label={t("common.openToRelocation")}
            name="openToRelocation"
            control={control}
            options={OPEN_TO_RELOCATION_OPTIONS.map((option) => ({
              value: option.value,
              label: t(`common.${option.value}`),
            }))}
          />

          <Input
            id="filter-min-years"
            label={t("search.minYears")}
            placeholder="0"
            inputMode="numeric"
            error={errors.minYearsExperience?.message}
            {...register("minYearsExperience")}
          />

          <Input
            id="filter-max-years"
            label={t("search.maxYears")}
            placeholder="20"
            inputMode="numeric"
            error={errors.maxYearsExperience?.message}
            {...register("maxYearsExperience")}
          />

          <SelectField
            id="filter-locations"
            label={t("search.locations")}
            name="locations"
            control={control}
            options={LOCATION_OPTIONS}
            isMulti
            isCreatable
            closeMenuOnSelect={false}
            helperText={t("search.selectLocationsPlaceholder")}
            className="sm:col-span-2 lg:col-span-3"
          />

          <SelectField
            id="filter-languages"
            label={t("common.languages")}
            name="spokenLanguages"
            control={control}
            options={LANGUAGE_OPTIONS.map((option) => ({
              value: option.value,
              label: t(`enum.language.${option.value.toLowerCase()}`),
            }))}
            isMulti
            isCreatable
            closeMenuOnSelect={false}
            helperText={t("search.selectLanguagesPlaceholder")}
          />

          <SelectField
            id="filter-notice-period"
            label={t("common.noticePeriod")}
            name="noticePeriods"
            control={control}
            options={NOTICE_PERIOD_OPTIONS}
            isMulti
            isCreatable
            closeMenuOnSelect={false}
          />

          <SelectField
            id="filter-mandatory-skills"
            label={t("common.skills")}
            name="mandatorySkills"
            control={control}
            options={SKILL_OPTIONS}
            isMulti
            isCreatable
            closeMenuOnSelect={false}
            helperText={t("search.mandatoryHelper")}
          />

          <SelectField
            id="filter-mandatory-titles"
            label={t("common.titles")}
            name="mandatoryTitles"
            control={control}
            options={TITLE_OPTIONS}
            isMulti
            isCreatable
            closeMenuOnSelect={false}
            helperText={t("search.mandatoryHelper")}
          />

          <Input
            id="filter-min-salary"
            label={t("search.minSalary")}
            placeholder="3000"
            inputMode="numeric"
            error={errors.minSalary?.message}
            {...register("minSalary")}
          />

          <Input
            id="filter-max-salary"
            label={t("search.maxSalary")}
            placeholder="8000"
            inputMode="numeric"
            error={errors.maxSalary?.message}
            {...register("maxSalary")}
          />

          <Input
            id="filter-name-contains"
            label={t("search.nameContains")}
            placeholder={t("search.namePlaceholder")}
            {...register("nameContains")}
          />

          <Input
            id="filter-username-contains"
            label={t("search.usernameContains")}
            placeholder="ana.dev"
            {...register("usernameContains")}
          />

          <Input
            id="filter-profile-text-contains"
            label={t("search.profileTextContains")}
            placeholder={t("search.profileTextPlaceholder")}
            className="sm:col-span-2 lg:col-span-3"
            {...register("profileTextContains")}
          />
        </div>
      ) : null}
    </div>
  );
}
