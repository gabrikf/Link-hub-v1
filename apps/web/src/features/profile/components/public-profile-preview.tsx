import type {
  LinkResponse,
  ProfileLayout,
  ProfileViewport,
  PublicWorkExperienceResponse,
  ResumeResponse,
  WorkExperienceResponse,
} from "@repo/schemas";
import { FiEye } from "react-icons/fi";
import type { PublicResumeResponse } from "../../../lib/auth-api";
import { ProfileBlocks } from "./profile-blocks";
import { ProfileCover } from "./profile-cover";
import {
  getProfileThemeProps,
  type Persona,
  type ThemePreset,
} from "./profile-theme";

type PublicProfilePreviewProps = {
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
  };
  links: LinkResponse[];
  resume: ResumeResponse | PublicResumeResponse | null;
  workExperiences: Array<WorkExperienceResponse | PublicWorkExperienceResponse>;
  resumeLoading?: boolean;
  workLoading?: boolean;
  linksLoading?: boolean;
  /**
   * Explicit device-frame width in pixels. When set, the preview renders inside
   * a fixed-width (centred) frame instead of the fluid `w-full`/`max-w-sm`
   * behaviour — used by the layout studio's preview modal to show a realistic
   * phone width for mobile and a wide frame for desktop. Optional so existing
   * callers keep working unchanged.
   */
  frameWidth?: number;
};

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
}: PublicProfilePreviewProps) {
  const theme = getProfileThemeProps(profile);
  const framed = frameWidth !== undefined;
  // A realistic phone mock is only used when the caller explicitly frames a
  // mobile preview (the layout studio). Desktop framed previews fill the wide
  // modal, and unframed callers keep the fluid inline card.
  const isPhone = framed && viewport === "mobile";

  // The profile "screen": cover + blocks with the resolved theme. Shared by all
  // three presentations so they stay pixel-identical apart from the chrome.
  const screen = (
    <>
      <ProfileCover
        compact
        bannerImageUrl={profile.bannerImageUrl ?? null}
        openToWork={profile.openToWork ?? false}
        location={profile.location ?? null}
        persona={profile.persona ?? null}
      />

      <div className="-mt-10 p-4">
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
        />
      </div>
    </>
  );

  if (isPhone) {
    // Realistic phone: dark bezel, notch, home indicator, centred. The screen
    // scrolls inside the device. `maxWidth: 100%` keeps it inside the modal on
    // narrow viewports.
    const screenWidth = frameWidth ?? 390;
    return (
      <div className="space-y-3">
        <div
          className="mx-auto rounded-[2.75rem] border border-zinc-300 bg-linear-to-b from-zinc-800 to-zinc-950 p-2.5 shadow-2xl ring-1 ring-black/10 dark:border-zinc-700"
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
                "max-h-[70vh] overflow-y-auto pt-6 bg-linear-to-b from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-900",
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
    <div className="space-y-3">
      {framed ? null : (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
          <FiEye className="h-3.5 w-3.5" aria-hidden="true" />
          Live preview
        </span>
      )}

      <div
        className={[
          theme.className,
          "mx-auto max-h-[70vh] overflow-hidden overflow-y-auto rounded-3xl border-2 border-zinc-200 bg-linear-to-b from-white to-zinc-50 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-900",
          framed ? "max-h-[72vh] w-full shadow-xl" : "w-full",
        ].join(" ")}
        style={theme.style}
      >
        {screen}
      </div>
    </div>
  );
}
