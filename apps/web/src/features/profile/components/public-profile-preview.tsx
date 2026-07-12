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
  frameWidth,
}: PublicProfilePreviewProps) {
  const theme = getProfileThemeProps(profile);
  const framed = frameWidth !== undefined;

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
          framed
            ? "max-h-[72vh] shadow-xl"
            : viewport === "mobile"
              ? "w-full max-w-sm"
              : "w-full",
        ].join(" ")}
        style={
          framed
            ? { ...theme.style, width: frameWidth, maxWidth: "100%" }
            : theme.style
        }
      >
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
          />
        </div>
      </div>
    </div>
  );
}
