import { useTranslation } from "react-i18next";
import { FiBriefcase, FiEdit2, FiMapPin } from "react-icons/fi";
import { Avatar } from "../../../shared-components/avatar";
import { Button } from "../../../shared-components/button";
import {
  accentForPreset,
  THEME_PRESETS,
  type Persona,
  type ThemePreset,
} from "../../profile/components/profile-theme";

type DashboardProfileDisplayProps = {
  name: string;
  username: string;
  description: string | null;
  avatarUrl: string | null;
  bannerImageUrl: string | null;
  backgroundImageUrl: string | null;
  themePreset: ThemePreset | null;
  themeAccent: string | null;
  openToWork: boolean;
  location: string | null;
  persona: Persona | null;
  onEdit: () => void;
};

function ImageThumb({ label, url }: { label: string; url: string | null }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-1">
      <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      {url ? (
        <img
          src={url}
          alt={t("image.labelPreview", { label })}
          className="h-16 w-full rounded-lg border border-zinc-200 object-cover dark:border-zinc-700"
        />
      ) : (
        <div className="flex h-16 w-full items-center justify-center rounded-lg border border-dashed border-zinc-200 text-[11px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          {t("common.notSet")}
        </div>
      )}
    </div>
  );
}

/**
 * Read-only presentation of the user's public profile. Editing happens in the
 * modal opened via {@link onEdit}; this only reflects the saved values.
 */
export function DashboardProfileDisplay({
  name,
  username,
  description,
  avatarUrl,
  bannerImageUrl,
  backgroundImageUrl,
  themePreset,
  themeAccent,
  openToWork,
  location,
  persona,
  onEdit,
}: DashboardProfileDisplayProps) {
  const { t } = useTranslation();
  const accent = themeAccent?.trim() || accentForPreset(themePreset);
  const matchedPreset = THEME_PRESETS.find(
    (preset) => preset.value === themePreset,
  );
  const themeLabel = matchedPreset
    ? t(`enum.themePreset.${matchedPreset.value}`)
    : t("common.custom");

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Avatar name={name} imageUrl={avatarUrl} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {name || t("dashboard.namePlaceholder")}
          </p>
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
            @{username || t("dashboard.usernamePlaceholder")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          fullWidth={false}
          className="shrink-0 rounded-full"
          onClick={onEdit}
        >
          <FiEdit2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t("dashboard.editProfile")}
        </Button>
      </div>

      {description?.trim() ? (
        <p className="whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-300">
          {description}
        </p>
      ) : (
        <p className="text-sm italic text-zinc-400 dark:text-zinc-500">
          {t("dashboard.noDescriptionYet")}
        </p>
      )}

      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {t("common.appearance")}
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <ImageThumb label={t("dashboard.banner")} url={bannerImageUrl} />
          <ImageThumb
            label={t("dashboard.background")}
            url={backgroundImageUrl}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            <span
              className="h-3 w-3 rounded-full ring-1 ring-black/5 dark:ring-white/10"
              style={{ backgroundColor: accent }}
              aria-hidden="true"
            />
            {themeLabel}
          </span>

          {openToWork ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <FiBriefcase className="h-3 w-3" aria-hidden="true" />
              {t("common.openToWork")}
            </span>
          ) : null}

          {location?.trim() ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              <FiMapPin className="h-3 w-3" aria-hidden="true" />
              {location}
            </span>
          ) : null}

          {persona ? (
            <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
              {t(`enum.persona.${persona}`)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
