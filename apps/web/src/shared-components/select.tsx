import Select, {
  type GroupBase,
  type Props as ReactSelectProps,
} from "react-select";
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import type { ReactElement } from "react";

type SelectFieldProps<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>,
  FormValues extends FieldValues = FieldValues,
> = {
  id: string;
  label: string;
  name: Path<FormValues>;
  control: Control<FormValues>;
  error?: string;
  className?: string;
} & Omit<
  ReactSelectProps<Option, IsMulti, Group>,
  "inputId" | "name" | "value" | "defaultValue" | "onChange" | "onBlur"
>;

type OptionWithIcon = {
  icon?: ReactElement;
  label?: string;
};

export function SelectField<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>,
  FormValues extends FieldValues = FieldValues,
>({
  id,
  label,
  name,
  control,
  error,
  className,
  ...selectProps
}: SelectFieldProps<Option, IsMulti, Group, FormValues>) {
  const { getOptionLabel } = selectProps;

  const defaultFormatOptionLabel = (option: Option) => {
    const optionWithIcon = option as OptionWithIcon;
    const label = getOptionLabel
      ? getOptionLabel(option)
      : (optionWithIcon.label ?? "");

    if (!optionWithIcon.icon) {
      return label;
    }

    return (
      <span className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700">
          {optionWithIcon.icon}
        </span>
        <span>{label}</span>
      </span>
    );
  };

  const renderSelect = (
    overrideProps?: Partial<ReactSelectProps<Option, IsMulti, Group>>,
  ) => (
    <Select
      inputId={id}
      unstyled
      classNames={{
        control: ({ isFocused, isDisabled }) =>
          [
            "w-full rounded-md border bg-white px-3 py-2 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100",
            isFocused
              ? "border-zinc-500 dark:border-zinc-500"
              : "border-zinc-300 dark:border-zinc-700",
            isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          ].join(" "),
        valueContainer: () => "gap-1 p-0",
        input: () => "m-0 p-0 text-zinc-900 dark:text-zinc-100",
        placeholder: () => "text-zinc-400 dark:text-zinc-500",
        singleValue: () => "text-zinc-900 dark:text-zinc-100",
        indicatorsContainer: () => "gap-1",
        clearIndicator: () =>
          "rounded text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
        dropdownIndicator: () =>
          "rounded text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
        indicatorSeparator: () => "hidden",
        menu: () =>
          "mt-1 overflow-hidden rounded-md border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900",
        menuList: () => "p-1",
        option: ({ isFocused, isSelected, isDisabled }) =>
          [
            "cursor-pointer rounded px-3 py-2 text-zinc-900 dark:text-zinc-100",
            isSelected ? "bg-zinc-200 dark:bg-zinc-700" : "",
            isFocused && !isSelected ? "bg-zinc-100 dark:bg-zinc-800" : "",
            isDisabled ? "cursor-not-allowed opacity-60" : "",
          ].join(" "),
        multiValue: () => "rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800",
        multiValueLabel: () => "text-zinc-900 dark:text-zinc-100",
        multiValueRemove: () =>
          "ml-1 rounded text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
        noOptionsMessage: () => "px-3 py-2 text-zinc-500 dark:text-zinc-400",
        loadingMessage: () => "px-3 py-2 text-zinc-500 dark:text-zinc-400",
      }}
      {...selectProps}
      formatOptionLabel={defaultFormatOptionLabel}
      {...overrideProps}
    />
  );

  return (
    <div className={className}>
      <label
        className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
        htmlFor={id}
      >
        {label}
      </label>

      <Controller
        control={control}
        name={name}
        render={({ field }) =>
          renderSelect({
            name: field.name,
            value: field.value,
            onBlur: field.onBlur,
            onChange: field.onChange,
          })
        }
      />

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
