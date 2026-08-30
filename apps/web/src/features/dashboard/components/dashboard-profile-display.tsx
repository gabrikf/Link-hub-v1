import type { ImagePlacement, ProfileAppearance } from "@repo/schemas";
import { useTranslation } from "react-i18next";
import { FiBriefcase, FiEdit2, FiEyeOff, FiMapPin } from "react-icons/fi";
import { Avatar } from "../../../shared-components/avatar";
import { PlacedImage } from "../../../shared-components/placed-image";
import { Button } from "../../../shared-components/button";
import { BADGE, SURFACE_INSET } from "../../../shared-components/surface";
import {
  accentForPreset,
  resolvePersonaLabel,
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
  /**
   * Placement + background treatment. Nullable because this panel also renders
   * from a `/me` response that predates the field.
   */
  appearance: ProfileAppearance | null;
  themePreset: ThemePreset | null;
  themeAccent: string | null;
  openToWork: boolean;
  location: string | null;
  persona: Persona | null;
  /** The user's own words, used only when `persona` is "other". */
  personaOther: string | null;
  onEdit: () => void;
};

/**
 * The thumbnail honours the stored focal point. A thumbnail that showed the
 * MIDDLE of the photo while the profile showed the chosen part would quietly
 * contradict the editor the owner just used.
 */
function ImageThumb({
  label,
  url,
  placement,
}: {
  label: string;
  url: string | null;
  placement: ImagePlacement | null;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-1">
      <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      {url ? (
        <div className="h-16 w-full overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
          <PlacedImage
            src={url}
            placement={placement}
            alt={t("image.labelPreview", { label })}
          />
        </div>
      ) : (
        <div className="flex h-16 w-full items-center justify-center rounded-lg border border-dashed border-zinc-200 text-[11px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          {t("common.notSet")}
        </div>
      )}
    </div>
  );
}

/**
 * Tells the user their profile is not in recruiter search, and how to change
 * that.
 *
 * Recruiter search is gated on `openToWork`, and that gate is invisible from
 * every screen a candidate looks at: the public profile renders identically,
 * the dashboard renders identically, and a recruiter searching for them simply
 * gets an empty page. New accounts are open to work by default now, but the
 * accounts that already exist were NOT backfilled — turning someone's
 * visibility on without asking is not a decision this app gets to make for
 * them. So the people affected by the old default are told, once, in the place
 * where they can act on it.
 *
 * Deliberately not a nag: it states the fact, says the public profile link is
 * unaffected, and offers the switch. No countdown, no repeated prompt, no
 * "dismiss" that would let it be lost — it disappears the moment the setting
 * changes, which is the only honest way for it to go away.
 */
function NotDiscoverableNotice({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation();

  return (
    /*
      LAYOUT, and why it is not `sm:flex-row`.

      This notice lives in the dashboard's right-hand panel, which is
      `lg:w-1/3` of a `max-w-6xl` page — about 316px wide at a 1440px viewport.
      `sm:` is a VIEWPORT breakpoint, so at 1440 it switched this to a row
      inside that 316px column and then handed 32px to the icon, 168px to a
      `shrink-0` button and whatever was left — 58px, eight characters — to the
      prose. The body ran 500px tall down a ribbon one word wide. The narrow
      viewport was never the broken case; the WIDE one was, which is exactly
      the failure mode a viewport breakpoint cannot see.

      `flex-wrap` + a real minimum on the text answers the question the layout
      is actually asking ("is there room for the button beside the text?") at
      every width, with no breakpoint at all. The icon and the text are one
      flex item so the icon can never be orphaned onto its own line, that item
      is `basis-64` (256px — comfortably past the ~28-character floor even
      after the icon takes its 32px), and the button is the only thing allowed
      to wrap below.
    */
    <div className={`${SURFACE_INSET} flex flex-wrap items-start gap-3 p-4`}>
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
        {/* `info`, not `warning`: nothing is broken and nobody is late. The
            account is simply set to private, which is a state, not a problem. */}
        <span
          className={`${BADGE.info} flex h-8 w-8 shrink-0 items-center justify-center rounded-full`}
          aria-hidden="true"
        >
          <FiEyeOff className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {t("dashboard.notDiscoverableTitle")}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {t("dashboard.notDiscoverableBody")}
          </p>
        </div>
      </div>

      {/* Last in the DOM as well as last on screen, so the reading order a
          screen reader announces is icon → heading → body → action either way
          — whether the button sits beside the text or wraps under it. */}
      <Button
        type="button"
        variant="soft"
        size="sm"
        fullWidth={false}
        className="shrink-0"
        onClick={onEdit}
      >
        {t("dashboard.notDiscoverableAction")}
      </Button>
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
  appearance,
  themePreset,
  themeAccent,
  openToWork,
  location,
  persona,
  personaOther,
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

      {openToWork ? null : <NotDiscoverableNotice onEdit={onEdit} />}

      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {t("common.appearance")}
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <ImageThumb
            label={t("dashboard.banner")}
            url={bannerImageUrl}
            placement={appearance?.bannerPlacement ?? null}
          />
          <ImageThumb
            label={t("dashboard.background")}
            url={backgroundImageUrl}
            placement={appearance?.backgroundPlacement ?? null}
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
              {resolvePersonaLabel(t, persona, personaOther)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
