import type {
  Control,
  FieldErrors,
  FieldPath,
  SubmitHandler,
  UseFormHandleSubmit,
  UseFormRegister,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiGlobe, FiPlusCircle, FiSave, FiX } from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import { Input } from "../../../shared-components/input";
import { SelectField } from "../../../shared-components/select";
import { SURFACE_INSET } from "../../../shared-components/surface";
import type {
  LinkFormValues,
  LinkIconSelectOption,
} from "../lib/link-form-schema";

export type { LinkFormValues, LinkIconSelectOption };

type DashboardLinkFormProps = {
  register: UseFormRegister<LinkFormValues>;
  control: Control<LinkFormValues>;
  handleSubmit: UseFormHandleSubmit<LinkFormValues>;
  onSubmit: SubmitHandler<LinkFormValues>;
  errors: FieldErrors<LinkFormValues>;
  isSubmitting: boolean;
  isEditing: boolean;
  onCancel: () => void;
  linkIconOptions: LinkIconSelectOption[];
};

export function DashboardLinkForm({
  register,
  control,
  handleSubmit,
  onSubmit,
  errors,
  isSubmitting,
  isEditing,
  onCancel,
  linkIconOptions,
}: DashboardLinkFormProps) {
  const { t } = useTranslation();

  return (
    <form
      className={`grid gap-3 p-4 ${SURFACE_INSET}`}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      <Input
        id="link-title"
        label={t("common.title")}
        placeholder={t("links.titlePlaceholder")}
        error={errors.title?.message}
        {...register("title")}
      />
      <Input
        id="link-url"
        label={t("common.url")}
        type="url"
        placeholder={t("links.urlExample")}
        error={errors.url?.message}
        {...register("url")}
      />
      <div className="grid gap-1">
        <SelectField
          id="link-icon"
          label={t("common.iconOptional")}
          className="w-full"
          name={"iconOption" as FieldPath<LinkFormValues>}
          control={control}
          options={linkIconOptions}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t("links.iconAutoDetected")}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <FiGlobe className="h-4 w-4" aria-hidden="true" />
        <input type="checkbox" {...register("isPublic")} />
        {t("links.publicLink")}
      </label>
      <div className="flex gap-2">
        <Button
          className="w-auto"
          type="submit"
          isLoading={isSubmitting}
          loadingLabel={
            isEditing ? t("links.updatingLink") : t("links.creatingLink")
          }
        >
          {isEditing ? (
            <>
              <FiSave className="h-4 w-4" aria-hidden="true" />
              {t("links.updateLink")}
            </>
          ) : (
            <>
              <FiPlusCircle className="h-4 w-4" aria-hidden="true" />
              {t("links.createLink")}
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
            {t("common.cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
