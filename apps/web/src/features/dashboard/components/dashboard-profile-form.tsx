import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiRotateCcw, FiSave } from "react-icons/fi";
import { Avatar } from "../../../shared-components/avatar";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { FileUpload } from "../../../shared-components/file-upload";
import { Input } from "../../../shared-components/input";
import { SURFACE_INSET } from "../../../shared-components/surface";
import { TextArea } from "../../../shared-components/text-area";
import { ProfileCover } from "../../profile/components/profile-cover";
import {
  accentForPreset,
  getProfileThemeProps,
  PERSONA_VALUES,
  THEME_PRESETS,
  type Persona,
  type ThemePreset,
} from "../../profile/components/profile-theme";

export type ProfileFormValues = {
  username: string;
  name: string;
  description: string;
  /** Avatar URL. Empty string means "fall back to the OAuth photo". */
  userPhoto: string;
  bannerImageUrl: string;
  backgroundImageUrl: string;
  themePreset: ThemePreset;
  /** Custom hex accent. Empty string means "use the selected preset". */
  themeAccent: string;
  openToWork: boolean;
  location: string;
  persona: Persona | "";
};

type DashboardProfileFormProps = {
  initialValues: ProfileFormValues;
  onSubmit: (data: ProfileFormValues) => Promise<void>;
  avatarUrl?: string | null;
  /**
   * Save failure (e.g. a duplicate-username 409). Rendered next to the submit
   * button — it used to live in the page's `<aside>`, i.e. underneath the Radix
   * overlay, so a rejected save just made the modal refuse to close.
   */
  errorMessage?: string | null;
  isSaving?: boolean;
  /** Reports dirtiness up so the dialog can guard against discarding edits. */
  onDirtyChange?: (isDirty: boolean) => void;
};

export function DashboardProfileForm({
  initialValues,
  onSubmit,
  avatarUrl,
  errorMessage,
  isSaving = false,
  onDirtyChange,
}: DashboardProfileFormProps) {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isDirty },
  } = useForm<ProfileFormValues>({
    defaultValues: initialValues,
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

  const watched = watch();
  const effectiveAccent =
    watched.themeAccent.trim() || accentForPreset(watched.themePreset);
  const theme = getProfileThemeProps({
    themePreset: watched.themePreset,
    themeAccent: watched.themeAccent.trim() || null,
  });

  const selectPreset = (preset: ThemePreset) => {
    setValue("themePreset", preset, { shouldDirty: true });
    // Presets take over the accent — drop any lingering custom hex.
    setValue("themeAccent", "", { shouldDirty: true });
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      {/* Avatars are the only always-circular surface, so they're the only
          upload that previews as a circle and goes through the crop dialog. */}
      <FileUpload
        label={t("dashboard.profilePicture")}
        variant="avatar"
        cropToCircle
        value={watched.userPhoto.trim() || null}
        onChange={(url) =>
          setValue("userPhoto", url ?? "", { shouldDirty: true })
        }
        helperText={t("dashboard.avatarHelp")}
      />
      <Input
        id="profile-username"
        label={t("common.username")}
        {...register("username")}
      />
      <Input id="profile-name" label={t("common.name")} {...register("name")} />
      <TextArea
        id="profile-description"
        label={t("common.description")}
        rows={5}
        {...register("description")}
      />

      {/* ----------------------------------------------------------- */}
      {/* Appearance                                                   */}
      {/* ----------------------------------------------------------- */}
      <div className={`space-y-4 p-4 ${SURFACE_INSET}`}>
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {t("common.appearance")}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {t("dashboard.appearanceSubtitle")}
          </p>
        </div>

        {/* Live preview */}
        <div
          className={`${theme.className} isolate rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900`}
          style={theme.style}
        >
          {/* Cover keeps its own clip so its top corners stay rounded; the card
              itself must NOT clip, so the avatar can straddle the cover edge. */}
          <div className="overflow-hidden rounded-t-2xl">
            <ProfileCover
              compact
              bannerImageUrl={watched.bannerImageUrl.trim() || null}
              openToWork={watched.openToWork}
              location={watched.location.trim() || null}
              persona={watched.persona || null}
            />
          </div>
          <div className="relative z-10 -mt-10 flex flex-col items-center gap-1 px-4 pb-4 text-center">
            <span
              className="inline-flex rounded-full bg-white shadow-md ring-2 dark:bg-zinc-900"
              style={{ ["--tw-ring-color" as string]: "var(--profile-accent)" }}
            >
              <Avatar
                name={watched.name || initialValues.name}
                imageUrl={watched.userPhoto.trim() || avatarUrl}
                size={56}
              />
            </span>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {watched.name ||
                initialValues.name ||
                t("dashboard.namePlaceholder")}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              @
              {watched.username ||
                initialValues.username ||
                t("dashboard.usernamePlaceholder")}
            </p>
          </div>
        </div>

        <FileUpload
          label={t("dashboard.bannerLabel")}
          aspect="banner"
          value={watched.bannerImageUrl.trim() || null}
          onChange={(url) =>
            setValue("bannerImageUrl", url ?? "", { shouldDirty: true })
          }
          helperText={t("dashboard.bannerHelp")}
        />
        <FileUpload
          label={t("dashboard.backgroundLabel")}
          aspect="cover"
          value={watched.backgroundImageUrl.trim() || null}
          onChange={(url) =>
            setValue("backgroundImageUrl", url ?? "", { shouldDirty: true })
          }
          helperText={t("dashboard.backgroundHelp")}
        />

        {/* Theme picker */}
        <div>
          <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
            {t("common.theme")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {THEME_PRESETS.map((preset) => {
              const isActive =
                !watched.themeAccent.trim() &&
                watched.themePreset === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => selectPreset(preset.value)}
                  aria-pressed={isActive}
                  title={t(`enum.themePreset.${preset.value}`)}
                  className={[
                    "h-8 w-8 rounded-full border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900",
                    isActive
                      ? "scale-110 border-zinc-900 dark:border-white"
                      : "border-transparent hover:scale-105",
                  ].join(" ")}
                  style={{
                    backgroundColor: preset.accent,
                    ["--tw-ring-color" as string]: preset.accent,
                  }}
                >
                  <span className="sr-only">
                    {t(`enum.themePreset.${preset.value}`)}
                  </span>
                </button>
              );
            })}

            <span className="mx-1 h-6 w-px bg-zinc-300 dark:bg-zinc-700" />

            <label
              className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300"
              title={t("dashboard.customAccentColor")}
            >
              <span
                className="inline-block h-8 w-8 overflow-hidden rounded-full border-2"
                style={{
                  backgroundColor: effectiveAccent,
                  borderColor: watched.themeAccent.trim()
                    ? "#18181b"
                    : "transparent",
                }}
              >
                <input
                  type="color"
                  value={effectiveAccent}
                  onChange={(event) =>
                    setValue("themeAccent", event.target.value, {
                      shouldDirty: true,
                    })
                  }
                  className="h-full w-full cursor-pointer opacity-0"
                  aria-label={t("dashboard.customAccentColor")}
                />
              </span>
              {t("common.custom")}
            </label>

            {watched.themeAccent.trim() ? (
              <button
                type="button"
                onClick={() =>
                  setValue("themeAccent", "", { shouldDirty: true })
                }
                className="inline-flex items-center gap-1 text-xs text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                <FiRotateCcw className="h-3 w-3" aria-hidden="true" />
                {t("common.reset")}
              </button>
            ) : null}
          </div>
        </div>

        {/* Open to work */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p
              id="profile-open-to-work-label"
              className="text-sm text-zinc-700 dark:text-zinc-300"
            >
              {t("common.openToWork")}
            </p>
            <p
              id="profile-open-to-work-hint"
              className="text-xs text-zinc-500 dark:text-zinc-400"
            >
              {t("dashboard.openToWorkHelp")}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={watched.openToWork}
            aria-labelledby="profile-open-to-work-label"
            aria-describedby="profile-open-to-work-hint"
            onClick={() =>
              setValue("openToWork", !watched.openToWork, {
                shouldDirty: true,
              })
            }
            className={[
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900",
              watched.openToWork
                ? "bg-emerald-500"
                : "bg-zinc-300 dark:bg-zinc-700",
            ].join(" ")}
          >
            <span
              className={[
                "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
                watched.openToWork ? "translate-x-5" : "translate-x-0.5",
              ].join(" ")}
            />
          </button>
        </div>

        <Input
          id="profile-location"
          label={t("common.location")}
          placeholder={t("dashboard.locationPlaceholder")}
          maxLength={120}
          {...register("location")}
        />

        {/* Persona */}
        <div>
          <label
            className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
            htmlFor="profile-persona"
          >
            {t("common.role")}
          </label>
          <select
            id="profile-persona"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            {...register("persona")}
          >
            <option value="">{t("dashboard.noRole")}</option>
            {PERSONA_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`enum.persona.${value}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMessage ? (
        <FeedbackMessage tone="error" message={errorMessage} />
      ) : null}

      <Button
        className="w-auto"
        type="submit"
        isLoading={isSaving}
        loadingLabel={t("dashboard.savingProfile")}
      >
        <FiSave className="h-4 w-4" aria-hidden="true" />
        {t("dashboard.saveProfile")}
      </Button>
    </form>
  );
}
