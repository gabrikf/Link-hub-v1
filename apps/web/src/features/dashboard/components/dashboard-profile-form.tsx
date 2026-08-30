import { zodResolver } from "@hookform/resolvers/zod";
import {
  DEFAULT_PROFILE_APPEARANCE,
  isReservedUsername,
  personaOtherSchema,
  personaSchema,
  profileAppearanceSchema,
  themePresetSchema,
  type ImagePlacement,
  type ProfileAppearance,
} from "@repo/schemas";
import type { TFunction } from "i18next";
import { useEffect, useMemo, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  FiAlertCircle,
  FiCheck,
  FiDroplet,
  FiLoader,
  FiRotateCcw,
  FiSave,
  FiSun,
} from "react-icons/fi";
import { z } from "zod/v4";
import { Avatar } from "../../../shared-components/avatar";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { FileUpload } from "../../../shared-components/file-upload";
import { Input } from "../../../shared-components/input";
import {
  FOCUS_RING_FIELD,
  SURFACE,
  SURFACE_INSET,
  SURFACE_PROFILE_GLASS,
} from "../../../shared-components/surface";
import { TextArea } from "../../../shared-components/text-area";
import { ProfileBackground } from "../../profile/components/profile-background";
import { ProfileCover } from "../../profile/components/profile-cover";
import {
  useUsernameAvailability,
  type UsernameStatus,
} from "../hooks/use-username-availability";
import {
  accentForPreset,
  getProfileThemeProps,
  PERSONA_VALUES,
  safeImageUrl,
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
  /**
   * Placement + background treatment, carried through the form as the SAME
   * object the API takes. It is not decomposed into four form fields because
   * nothing edits one of them in isolation: the position editor writes a whole
   * placement, and the two sliders write one number each into a copy.
   */
  appearance: ProfileAppearance;
  themePreset: ThemePreset;
  /** Custom hex accent. Empty string means "use the selected preset". */
  themeAccent: string;
  openToWork: boolean;
  location: string;
  persona: Persona | "";
  /**
   * The user's own words for their role, used when `persona` is "other".
   * Empty string means "not set" — the form works in strings, and the page
   * turns it into the `null` the API takes.
   *
   * OPTIONAL rather than required: `ProfileFormValues` is a public shape that
   * callers and fixtures build by hand, and making a new field mandatory turns
   * every one of them into a compile error and an `undefined.trim()` at
   * runtime. Absent reads exactly like empty everywhere below.
   */
  personaOther?: string;
};

/**
 * The shapes the two images are actually PUBLISHED at.
 *
 * Measured, not guessed. The cover strip is a fixed `h-44` (176px) across a
 * card whose width is the viewport's: 1120px inside `max-w-6xl` minus its
 * gutters on a desktop, 374px inside `max-w-md` on a 390px phone. That is
 * 6.36:1 and 2.13:1 — the SAME banner, re-cropped by `object-fit: cover` for
 * each, and nowhere near the 3:1 this used to claim.
 *
 * The editor drags in the TALLER shape and draws the wider one over it as a
 * safe area (see `safeAreaRect`). Dragging in one shape and publishing in the
 * other is the original bug one step downstream: a face centred in a 3:1 frame
 * is cropped clean out of a 6.36:1 cover.
 *
 * The background's frame is the viewport itself — 16:9 on a laptop, roughly
 * 0.46:1 held upright — so the same treatment applies with a far wider spread.
 */
const BANNER_ASPECT = 374 / 176;
const BANNER_WIDEST_ASPECT = 1120 / 176;
const BACKGROUND_ASPECT = 16 / 9;
const BACKGROUND_NARROWEST_ASPECT = 390 / 844;

/** The bound the API enforces, read off the shared schema rather than retyped. */
const PERSONA_OTHER_MAX_LENGTH = personaOtherSchema.maxLength ?? 60;

/**
 * The form's rules, in the user's language.
 *
 * TWO rules are expressed here, and both are rules a single field cannot state
 * on its own in a language the user reads.
 *
 * The first: "Other" is not an answer, so picking it means saying which.
 *
 * The second: a username that is a reserved word is refused. That one arrived
 * with the short profile URL — `/:username` is now the only public profile
 * path, so a username that collides with an application route is an account
 * whose profile can never be opened. It is NOT the form deciding to
 * client-validate usernames in general: the rule and the list both come from
 * `@repo/schemas`, the API enforces exactly the same thing, and everything
 * else on this form is still declared permissively on purpose. The fields are
 * listed rather than left out because `zodResolver` hands `handleSubmit` the
 * PARSED object, and anything missing from the schema would be stripped out of
 * the payload on save.
 *
 * The role rule itself is NOT retyped: `personaOtherSchema` from
 * `@repo/schemas` is the same trimmed, 1..60 rule the API validates against, so
 * the browser can never accept a label the server would reject (or the
 * reverse). Only the WORDING is local, because only the browser knows which
 * language to say it in.
 */
const buildProfileFormSchema = (t: TFunction) =>
  z
    .object({
      username: z.string(),
      name: z.string(),
      description: z.string(),
      userPhoto: z.string(),
      bannerImageUrl: z.string(),
      backgroundImageUrl: z.string(),
      // The shared schema, not a local copy: the bounds the API enforces are
      // the bounds the form enforces, and `zodResolver` hands `handleSubmit`
      // the PARSED object, so anything absent here would be stripped from the
      // payload on save.
      appearance: profileAppearanceSchema,
      themePreset: themePresetSchema,
      themeAccent: z.string(),
      openToWork: z.boolean(),
      location: z.string(),
      persona: z.union([personaSchema, z.literal("")]),
      personaOther: z.string().optional(),
    })
    .superRefine((values, ctx) => {
      /**
       * The reserved-username rule, stated in the user's language.
       *
       * The API rejects these too — the refinement lives on
       * `updateProfileSchemaInput` in `@repo/schemas`, so it is the same list
       * on both sides. Repeating it here is not a second source of truth: the
       * LIST comes from `isReservedUsername`, only the wording is local. What
       * it buys is the difference between a field-level sentence and a raw
       * `ZodError` blob — `lib/auth-api.ts` parses the payload through the
       * shared schema before it posts, so without this the rejection arrives
       * as serialised zod issues in the modal's error slot.
       */
      if (isReservedUsername(values.username)) {
        ctx.addIssue({
          code: "custom",
          path: ["username"],
          message: t("dashboard.usernameReserved"),
        });
      }

      if (values.persona !== "other") {
        return;
      }

      const result = personaOtherSchema.safeParse(values.personaOther ?? "");
      if (result.success) {
        return;
      }

      ctx.addIssue({
        code: "custom",
        path: ["personaOther"],
        message: result.error.issues.some((issue) => issue.code === "too_big")
          ? t("dashboard.customRoleTooLong", { max: PERSONA_OTHER_MAX_LENGTH })
          : t("dashboard.customRoleRequired"),
      });
    });

/**
 * Stable id rather than `useId()`: it is referenced from `aria-describedby` on
 * an input that `register()` spreads props onto, and there is exactly one
 * profile form on screen at a time.
 */
const USERNAME_STATUS_ID = "profile-username-status";

/**
 * The verdict, in the colours the rest of the app already uses for the same
 * three meanings. Renders NOTHING while idle, so an untouched form carries no
 * commentary — the reserved space above keeps the layout from jumping when a
 * message does arrive.
 */
function UsernameStatusMessage({
  status,
  username,
  t,
}: {
  status: UsernameStatus;
  username: string;
  t: TFunction;
}) {
  if (status.kind === "idle") {
    return null;
  }

  if (status.kind === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
        <FiLoader className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {t("dashboard.usernameChecking")}
      </span>
    );
  }

  if (status.kind === "available") {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
        <FiCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {t("dashboard.usernameAvailable", { username })}
      </span>
    );
  }

  /*
   * `unknown` is amber, not red: the check failed, which is not the same claim
   * as "you cannot have this name". The user is told the truth — we do not
   * know — and Save is left alone to be the authority it already is.
   */
  const isBlocked = status.kind === "taken" || status.kind === "reserved";
  const messageKey =
    status.kind === "taken"
      ? "dashboard.usernameTaken"
      : status.kind === "reserved"
        ? "dashboard.usernameUnavailableReserved"
        : "dashboard.usernameCheckFailed";

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${
        isBlocked
          ? "text-red-600 dark:text-red-400"
          : "text-amber-700 dark:text-amber-400"
      }`}
    >
      <FiAlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
      {t(messageKey, { username })}
    </span>
  );
}

/**
 * One labelled slider with a live numeric read-out.
 *
 * A native `range` rather than a custom drag handle: it comes with
 * arrows / Home / End / PageUp / PageDown, a real `aria-valuenow` and touch
 * support that nobody has to reimplement or test. The read-out matters as much
 * as the track — "veil 55%" is a value the owner can reason about and come
 * back to, where an unlabelled handle is a guess.
 */
function TuningSlider({
  id,
  label,
  icon,
  value,
  min,
  max,
  step,
  valueText,
  onChange,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  valueText: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300"
        >
          {icon}
          {label}
        </label>
        <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {valueText}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-violet-600 dark:bg-zinc-700 dark:accent-violet-400 ${FOCUS_RING_FIELD}`}
      />
    </div>
  );
}

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
  /**
   * The handle the account holds RIGHT NOW, straight from `/me` — not from the
   * form. It is what tells the availability check to stay quiet while the field
   * still says what it said when the dialog opened.
   */
  currentUsername?: string;
};

export function DashboardProfileForm({
  initialValues,
  onSubmit,
  avatarUrl,
  errorMessage,
  isSaving = false,
  onDirtyChange,
  currentUsername,
}: DashboardProfileFormProps) {
  const { t } = useTranslation();
  const formSchema = useMemo(() => buildProfileFormSchema(t), [t]);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

  const watched = watch();
  /*
   * The baseline is "the handle this form opened with", and it falls back to
   * `initialValues.username` when the caller does not pass the live one. Both
   * readings mean the same thing here — do not spend a request, or a verdict,
   * on a field nobody has touched.
   */
  const usernameStatus = useUsernameAvailability(
    watched.username,
    currentUsername ?? initialValues.username,
  );
  const effectiveAccent =
    watched.themeAccent.trim() || accentForPreset(watched.themePreset);
  const theme = getProfileThemeProps({
    themePreset: watched.themePreset,
    themeAccent: watched.themeAccent.trim() || null,
  });

  /**
   * `?? DEFAULT_PROFILE_APPEARANCE` is not defensive noise: `ProfileFormValues`
   * is a shape callers and fixtures build by hand, and several of them predate
   * this field. Reading through the default keeps them rendering the documented
   * behaviour instead of crashing on `undefined.backgroundOverlay`.
   */
  const appearance = watched.appearance ?? DEFAULT_PROFILE_APPEARANCE;

  const patchAppearance = (patch: Partial<ProfileAppearance>) =>
    setValue("appearance", { ...appearance, ...patch }, { shouldDirty: true });

  const setBannerPlacement = (placement: ImagePlacement | null) =>
    patchAppearance({ bannerPlacement: placement });

  const setBackgroundPlacement = (placement: ImagePlacement | null) =>
    patchAppearance({ backgroundPlacement: placement });

  /**
   * `safeImageUrl`, not a `.trim()` truthiness check — the same rule the
   * renderer applies. A `javascript:` url is not an image, and treating it as
   * one frosted the preview card over a photograph that was never going to
   * load.
   */
  const backgroundImage = safeImageUrl(watched.backgroundImageUrl);
  const hasBackground = Boolean(backgroundImage);
  /** The frosted material and the stronger metadata grey travel together. */
  const previewCardSurface = hasBackground ? SURFACE_PROFILE_GLASS : "";
  const previewMetaText = hasBackground
    ? "text-zinc-700 dark:text-zinc-200"
    : "text-zinc-500 dark:text-zinc-400";

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
      <div>
        <Input
          id="profile-username"
          label={t("common.username")}
          error={errors.username?.message}
          aria-describedby={USERNAME_STATUS_ID}
          {...register("username")}
        />
        {/*
          One live region, always in the DOM, so a screen reader announces the
          verdict as it changes instead of hearing a region appear and vanish.
          It sits OUTSIDE `Input`'s own error slot on purpose: a zod message
          ("that name is reserved") and this ("somebody has it") answer
          different questions and can both be true at once.
        */}
        <p
          id={USERNAME_STATUS_ID}
          aria-live="polite"
          className="mt-1 min-h-5 text-sm"
        >
          <UsernameStatusMessage
            status={usernameStatus}
            username={watched.username.trim()}
            t={t}
          />
        </p>
      </div>
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

        {/*
          Live preview. `relative` anchors the background layer; the layer
          carries its own rounding because the CARD must not clip (the avatar
          straddles the cover edge and its ring would be sliced off).

          `sticky top-0` is what makes "live" true. The veil and blur sliders
          sit ~370px further down this dialog, so at the moment the owner drags
          one, the preview they are supposedly watching is entirely off screen —
          a preview you cannot see while you tune is a preview in name only.
          Pinned to the top of the dialog's scroll container, it stays in view
          for every control below it.

          `bg-white`/`dark:bg-zinc-900` are load-bearing under `sticky`: the
          form scrolls UNDERNEATH this, and a transparent panel would smear the
          fields through the preview.

          `z-[5]` is squeezed between two real constraints, which is why it is
          not a round number.

          ABOVE the upload tiles: `FileUpload`'s drop zone is `relative` (it has
          absolutely-positioned children), so it is a positioned sibling with
          `z-index: auto` LATER in the DOM — and two such siblings paint in
          document order. With no z-index here the preview was covered by the
          background tile: 0% of it was visible at 1440px at the moment the veil
          slider came into view, which is the whole defect this sticky was
          added to fix.

          BELOW the dialog's close button, which carries `z-10`. Anything at 10
          or above would put this over the X — the primary way out of the modal
          on a phone.
        */}
        <div
          data-testid="profile-appearance-preview"
          className={`${theme.className} ${SURFACE} isolate sticky top-0 z-[5]`}
          style={theme.style}
        >
          {/* The background photo, previewed WHERE IT IS CONFIGURED. Tuning the
              veil or the blur two fields below repaints this immediately, which
              is the only way to choose those numbers without saving, reloading
              and looking at the public page. */}
          <ProfileBackground
            imageUrl={backgroundImage}
            appearance={appearance}
            className="absolute inset-0 z-0 overflow-hidden rounded-2xl"
          />

          {/*
            The frosted card, exactly as the published page builds it: photo,
            then this, then the content.

            Without it the name and handle were painted straight onto the
            photograph — 1.19:1 against a dark one — on the ONE screen the whole
            feature is tuned from. A preview that is less readable than the page
            it previews is worse than no preview: it is the thing the owner
            judges the veil slider against.

            Cover keeps its own clip so its top corners stay rounded; the card
            itself must NOT clip, so the avatar can straddle the cover edge.
          */}
          <div className={`relative z-10 ${previewCardSurface}`}>
            <div className="overflow-hidden rounded-t-2xl">
              <ProfileCover
                compact
                bannerImageUrl={watched.bannerImageUrl.trim() || null}
                bannerPlacement={appearance.bannerPlacement}
                location={watched.location.trim() || null}
                persona={watched.persona || null}
                personaOther={watched.personaOther?.trim() || null}
              />
            </div>
            {/*
              `relative z-10` is what makes the avatar VISIBLE, not decoration.

              This row is pulled 40px up so the avatar straddles the cover's
              lower edge. But the cover strip beside it is `relative` with
              `z-index: auto`, which puts it in the positioned-descendant paint
              step — and this row, being static, paints in the in-flow step
              BEFORE it. So the banner was painted straight over the top of the
              avatar and the owner saw a circle sliced clean in half at the
              cover's bottom edge. Giving the row its own stacking position
              moves it after the cover in paint order. Same fix, same reason, as
              in `public-profile-preview.tsx`.

              `z-10` is scoped by the `isolate` on the preview root, so it
              cannot reach past the dialog's own chrome.
            */}
            <div className="relative z-10 -mt-10 flex flex-col items-center gap-1 px-4 pb-4 text-center">
              <span
                className="inline-flex rounded-full bg-white shadow-md ring-2 dark:bg-zinc-900"
                style={{
                  ["--tw-ring-color" as string]: "var(--profile-accent)",
                }}
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
              <p className={`text-xs ${previewMetaText}`}>
                @
                {watched.username ||
                  initialValues.username ||
                  t("dashboard.usernamePlaceholder")}
              </p>
            </div>
          </div>
        </div>

        {/* `placementAspect` is a shape each image is PUBLISHED at, not the
            shape of the tile, and `placementSafeAreaAspect` is the OTHER one.
            Drag inside a frame shaped like neither and the chosen point is
            re-cropped away by both — see the constants at the top of this
            file for the measurements. */}
        <FileUpload
          testId="banner-upload"
          label={t("dashboard.bannerLabel")}
          aspect="banner"
          value={watched.bannerImageUrl.trim() || null}
          onChange={(url) =>
            setValue("bannerImageUrl", url ?? "", { shouldDirty: true })
          }
          helperText={t("dashboard.bannerHelp")}
          placement={appearance.bannerPlacement}
          onPlacementChange={setBannerPlacement}
          placementAspect={BANNER_ASPECT}
          placementSafeAreaAspect={BANNER_WIDEST_ASPECT}
          placementSafeAreaLabel={t("image.safeAreaDesktop")}
          placementTitle={t("dashboard.bannerPositionTitle")}
          placementDescription={t("dashboard.bannerPositionHelp")}
        />
        <FileUpload
          testId="background-upload"
          label={t("dashboard.backgroundLabel")}
          aspect="cover"
          value={watched.backgroundImageUrl.trim() || null}
          onChange={(url) =>
            setValue("backgroundImageUrl", url ?? "", { shouldDirty: true })
          }
          helperText={t("dashboard.backgroundHelp")}
          placement={appearance.backgroundPlacement}
          onPlacementChange={setBackgroundPlacement}
          placementAspect={BACKGROUND_ASPECT}
          placementSafeAreaAspect={BACKGROUND_NARROWEST_ASPECT}
          placementSafeAreaLabel={t("image.safeAreaPhone")}
          placementTitle={t("dashboard.backgroundPositionTitle")}
          placementDescription={t("dashboard.backgroundPositionHelp")}
        />

        {/* Rendered only with a background set. Two sliders that move nothing
            are worse than no sliders: they read as broken rather than as
            inapplicable. */}
        {hasBackground ? (
          <div
            data-testid="background-tuning"
            className={`anim-fade-in space-y-4 p-3 ${SURFACE_INSET}`}
          >
            <TuningSlider
              id="profile-background-overlay"
              label={t("dashboard.backgroundOverlayLabel")}
              icon={<FiDroplet className="h-3.5 w-3.5" aria-hidden="true" />}
              value={appearance.backgroundOverlay}
              min={0}
              max={100}
              step={1}
              valueText={t("common.percentValue", {
                value: Math.round(appearance.backgroundOverlay),
              })}
              onChange={(value) =>
                patchAppearance({ backgroundOverlay: value })
              }
            />
            <TuningSlider
              id="profile-background-blur"
              label={t("dashboard.backgroundBlurLabel")}
              icon={<FiSun className="h-3.5 w-3.5" aria-hidden="true" />}
              value={appearance.backgroundBlur}
              min={0}
              max={24}
              step={1}
              valueText={t("common.pixelValue", {
                value: Math.round(appearance.backgroundBlur),
              })}
              onChange={(value) => patchAppearance({ backgroundBlur: value })}
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {t("dashboard.backgroundTuningHelp")}
            </p>
          </div>
        ) : null}

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

        {/*
          "Other" used to be a dead end: the eight categories cover most people
          and nobody else, and a physiotherapist could only file themselves
          under a word that says nothing. Picking it now asks which, and that
          answer is what the profile and its banner show.
        */}
        {watched.persona === "other" ? (
          <div className="anim-fade-in">
            <Input
              id="profile-persona-other"
              label={t("dashboard.customRoleLabel")}
              placeholder={t("dashboard.customRolePlaceholder")}
              maxLength={PERSONA_OTHER_MAX_LENGTH}
              error={errors.personaOther?.message}
              aria-describedby="profile-persona-other-hint"
              {...register("personaOther")}
            />
            <p
              id="profile-persona-other-hint"
              className="mt-1 text-xs text-zinc-500 dark:text-zinc-400"
            >
              {t("dashboard.customRoleHelp")}
            </p>
          </div>
        ) : null}
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
