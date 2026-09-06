import type {
  LinkResponse,
  ProfileAppearance,
  ProfileLayout,
  ProfileViewport,
  PublicWorkExperienceResponse,
  ResumeResponse,
  WorkExperienceResponse,
} from "@repo/schemas";
import { useTranslation } from "react-i18next";
import { FiEye } from "react-icons/fi";
import type { PublicResumeResponse } from "../../../lib/auth-api";
import { SURFACE_PROFILE_GLASS } from "../../../shared-components/surface";
import { ProfileBackground } from "./profile-background";
import { ProfileBlocks } from "./profile-blocks";
import { ProfileCover } from "./profile-cover";
import {
  getProfileThemeProps,
  safeImageUrl,
  type Persona,
  type ThemePreset,
} from "./profile-theme";

type PublicProfilePreviewProps = Readonly<{
  layout: ProfileLayout;
  viewport: ProfileViewport;
  profile: {
    name: string;
    username: string;
    description: string | null;
    userPhoto: string | null;
    // Appearance fields — optional so callers that only know the core identity
    // (e.g. the layout studio) keep working unchanged.
    bannerImageUrl?: string | null;
    backgroundImageUrl?: string | null;
    themeAccent?: string | null;
    themePreset?: ThemePreset | null;
    openToWork?: boolean;
    location?: string | null;
    persona?: Persona | null;
    /** The owner's own words for their role, when `persona` is "other". */
    personaOther?: string | null;
    /**
     * Banner / background placement and the background's veil and blur.
     *
     * Optional for the same reason the two image URLs are: the layout studio
     * knows only the core identity. Absent renders as the documented default.
     */
    appearance?: ProfileAppearance | null;
  };
  links: LinkResponse[];
  resume: ResumeResponse | PublicResumeResponse | null;
  workExperiences: Array<WorkExperienceResponse | PublicWorkExperienceResponse>;
  resumeLoading?: boolean;
  workLoading?: boolean;
  linksLoading?: boolean;
  /**
   * Nominal device-screen width in pixels. When set, the preview renders inside
   * a centred phone mock at most this wide instead of the fluid
   * `w-full`/`max-w-sm` behaviour — used by the layout studio's preview modal
   * to show a realistic phone width for mobile and a wide frame for desktop.
   * Optional so existing callers keep working unchanged.
   *
   * A MAXIMUM, not a fixed width: the mock shrinks to whatever room the parent
   * gives it. It has to, because the parent is a 96vw modal and this number is
   * 390 — on a 375px phone the mock is wider than the dialog that holds it.
   */
  frameWidth?: number;
  /**
   * Profile-level "show tabs" switch, forwarded straight to `ProfileBlocks` so
   * the editor's live preview loses its tab strip the moment the owner flips
   * the switch — the preview is the only place they can see the consequence
   * before publishing.
   */
  tabsEnabled?: boolean;
}>;

export function PublicProfilePreview({
  layout,
  viewport,
  profile,
  links,
  resume,
  workExperiences,
  resumeLoading = false,
  workLoading = false,
  linksLoading = false,
  frameWidth,
  tabsEnabled = true,
}: PublicProfilePreviewProps) {
  const { t } = useTranslation();
  const theme = getProfileThemeProps(profile);
  const framed = frameWidth !== undefined;
  // A realistic phone mock is only used when the caller explicitly frames a
  // mobile preview (the layout studio). Desktop framed previews fill the wide
  // modal, and unframed callers keep the fluid inline card.
  const isPhone = framed && viewport === "mobile";
  /*
   * The preview card IS the page here, so it keeps its opaque ground and the
   * background photo is painted INSIDE it. What has to be mirrored is the
   * layer the published page puts between the photo and the blocks: with a
   * background set, the profile card there turns to frosted glass. Without
   * this the preview would show the blocks sitting straight on the photograph
   * — a different picture from the one it is previewing.
   */
  // `safeImageUrl`, the same rule the renderer applies: a url that will never
  // load must not frost the card over a photograph that is not there.
  const hasBackground = Boolean(safeImageUrl(profile.backgroundImageUrl));
  // The same constant the published page uses. It carries colour and blur only,
  // so as an inner layer here it needs nothing removed.
  const cardSurface = hasBackground ? SURFACE_PROFILE_GLASS : "";

  // The profile "screen": cover + blocks with the resolved theme. Shared by all
  // three presentations so they stay pixel-identical apart from the chrome.
  const screen = (
    <>
      {/*
        The background photograph, which this preview used to accept as a prop
        and then never draw. That gap IS the "I set a background and nothing
        happened" report: the only place it rendered was the published page, so
        the one screen built to show the owner their result showed everything
        except it.

        `relative` + `z-0` rather than the page's negative z-index: this sits
        inside a scroll container with its own stacking context, and a `-z-20`
        child would slide behind the preview card's own background and vanish
        again.
      */}
      <ProfileBackground
        imageUrl={profile.backgroundImageUrl}
        appearance={profile.appearance}
        className="absolute inset-0 z-0 overflow-hidden"
      />

      {/* The frosted profile card, mirroring the published page's stack:
          photo, then this, then the blocks. */}
      <div className={`relative z-10 ${cardSurface}`}>
        <ProfileCover
          compact
          bannerImageUrl={profile.bannerImageUrl ?? null}
          bannerPlacement={profile.appearance?.bannerPlacement ?? null}
          location={profile.location ?? null}
          persona={profile.persona ?? null}
          personaOther={profile.personaOther ?? null}
        />

        {/*
          `relative z-10`: the blocks are pulled 40px up so the avatar straddles
          the cover's lower edge, but `ProfileCover`'s strip is `relative` with
          `z-index: auto` and therefore paints in the positioned-descendant
          step — after this static row. Without a paint position of its own the
          banner covered the top half of the avatar. See the same note in
          `dashboard-profile-form.tsx`.
        */}
        <div className="relative z-10 -mt-10 p-4">
          <ProfileBlocks
            variant="preview"
            layout={layout}
            viewport={viewport}
            profile={profile}
            links={links}
            resume={resume}
            workExperiences={workExperiences}
            resumeLoading={resumeLoading}
            workLoading={workLoading}
            linksLoading={linksLoading}
            tabsEnabled={tabsEnabled}
          />
        </div>
      </div>
    </>
  );

  if (isPhone) {
    /*
     * Realistic phone: dark bezel, notch, home indicator, centred. The screen
     * scrolls inside the device.
     *
     * `width` is the ASK and `maxWidth: 100%` is the rule that wins, so the
     * mock never exceeds the box it was handed. That clamp only works while
     * this component's own root can shrink — hence `w-full` on the wrapper
     * rather than letting it size to the 410px mock. Inside a shrink-to-fit
     * parent (a centred flex item, an `inline-block`) `100%` resolves against
     * the mock's own max-content width, the clamp becomes a no-op, and the
     * mock bleeds off BOTH sides of a 375px modal — the lateral cropping this
     * `w-full` exists to prevent.
     *
     * `min-w-0` for the same reason: a flex item defaults to `min-width: auto`
     * and refuses to shrink below its content, which would re-create the bug
     * for any caller that does put this in a flex row.
     */
    const screenWidth = frameWidth ?? 390;
    return (
      <div className="w-full min-w-0 space-y-3">
        <div
          className="mx-auto rounded-[2.75rem] border border-zinc-300 bg-linear-to-b from-zinc-800 to-zinc-950 p-1.5 shadow-2xl ring-1 ring-black/10 sm:p-2.5 dark:border-zinc-700"
          style={{ width: screenWidth + 20, maxWidth: "100%" }}
        >
          <div className="relative overflow-hidden rounded-[2.2rem] bg-black">
            {/* Notch */}
            <div className="pointer-events-none absolute left-1/2 top-0 z-20 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-black" />
            {/* Home indicator */}
            <div className="pointer-events-none absolute bottom-1.5 left-1/2 z-20 h-1 w-24 -translate-x-1/2 rounded-full bg-white/40" />

            <div
              className={[
                theme.className,
                // `pt-6` (= the z-20 notch height) keeps the banner top / top
                // badges from hiding under the notch when scrolled to the top.
                // `svh`, not `vh`: `vh` resolves against the LARGE viewport, so
                // on a phone the bottom of the preview sat under the browser
                // chrome inside an already body-scroll-locked dialog.
                // `relative`: the background layer is `absolute inset-0`, and
                // without a positioned ancestor here it would resolve against
                // whatever dialog happens to hold the preview.
                "relative max-h-[70svh] overflow-y-auto pt-6 bg-linear-to-b from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-900",
              ].join(" ")}
              style={theme.style}
            >
              {screen}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-3">
      {framed ? null : (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
          <FiEye className="h-3.5 w-3.5" aria-hidden="true" />
          {t("common.livePreview")}
        </span>
      )}

      <div
        className={[
          theme.className,
          // `svh` over `vh` — see the phone branch above. `relative` anchors
          // the `absolute inset-0` background layer to this card.
          "relative mx-auto max-h-[70svh] overflow-hidden overflow-y-auto rounded-3xl border-2 border-zinc-200 bg-linear-to-b from-white to-zinc-50 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-900",
          framed ? "max-h-[72svh] w-full shadow-xl" : "w-full",
        ].join(" ")}
        // `frameWidth` is a maximum here too, so a desktop preview renders at
        // the canvas width a real visitor gets instead of stretching to fill a
        // modal wider than any layout the editor can produce.
        style={{ ...theme.style, maxWidth: frameWidth }}
      >
        {screen}
      </div>
    </div>
  );
}
