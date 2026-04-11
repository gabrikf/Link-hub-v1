import type { LinkIcon } from "@repo/schemas";
import type { ReactNode } from "react";
import type {
  Control,
  FieldPath,
  SubmitHandler,
  UseFormHandleSubmit,
  UseFormRegister,
} from "react-hook-form";
import { FiGlobe, FiPlusCircle, FiSave, FiX } from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import { Input } from "../../../shared-components/input";
import { SelectField } from "../../../shared-components/select";

type LinkIconSelectOption = {
  value: LinkIcon | "";
  label: string;
  icon?: ReactNode;
};

export type LinkFormValues = {
  title: string;
  url: string;
  iconOption: LinkIconSelectOption;
  isPublic: boolean;
  editingLinkId: string | null;
};

type DashboardLinkFormProps = {
  register: UseFormRegister<LinkFormValues>;
  control: Control<LinkFormValues>;
  handleSubmit: UseFormHandleSubmit<LinkFormValues>;
  onSubmit: SubmitHandler<LinkFormValues>;
  isEditing: boolean;
  onCancel: () => void;
  linkIconOptions: LinkIconSelectOption[];
};

export function DashboardLinkForm({
  register,
  control,
  handleSubmit,
  onSubmit,
  isEditing,
  onCancel,
  linkIconOptions,
}: DashboardLinkFormProps) {
  return (
    <form
      className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40"
      onSubmit={handleSubmit(onSubmit)}
    >
      <Input
        id="link-title"
        label="Title"
        placeholder="My website"
        {...register("title")}
      />
      <Input
        id="link-url"
        label="URL"
        placeholder="https://example.com"
        {...register("url")}
      />
      <div className="grid gap-1">
        <SelectField
          id="link-icon"
          label="Icon (optional)"
          className="w-full"
          name={"iconOption" as FieldPath<LinkFormValues>}
          control={control}
          options={linkIconOptions}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Icon is auto-detected from title and URL.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <FiGlobe className="h-4 w-4" aria-hidden="true" />
        <input type="checkbox" {...register("isPublic")} />
        Public link
      </label>
      <div className="flex gap-2">
        <Button className="w-auto" type="submit">
          {isEditing ? (
            <>
              <FiSave className="h-4 w-4" aria-hidden="true" />
              Update link
            </>
          ) : (
            <>
              <FiPlusCircle className="h-4 w-4" aria-hidden="true" />
              Create link
            </>
          )}
        </Button>
        {isEditing ? (
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            className="px-3"
            onClick={onCancel}
          >
            <FiX className="h-4 w-4" aria-hidden="true" />
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
