import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import axios from "axios";
import { useEffect, useState } from "react";
import { FiLogIn } from "react-icons/fi";
import {
  fetchPublicProfile,
  fetchPublicResume,
  fetchPublicWorkExperiences,
} from "../../../lib/auth-api";
import { useUserInfoStore } from "../../../lib/user-info-store";
import {
  pickViewport,
  resolveViewportLayout,
} from "../../profile-layout/grid-utils";
import { ProfileBlocks } from "../components/profile-blocks";
import { ProfileCover } from "../components/profile-cover";
import { getProfileThemeProps, safeImageUrl } from "../components/profile-theme";

const MOBILE_QUERY = "(max-width: 1023px)";

export function PublicProfilePage() {
  const { username } = useParams({ from: "/profile/$username" });
  const userInfo = useUserInfoStore((state) => state.userInfo);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(MOBILE_QUERY).matches
      : false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const handleChange = (event: MediaQueryListEvent) =>
      setIsMobile(event.matches);
    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const profileQuery = useQuery({
    queryKey: ["public-profile", username],
    retry: false,
    queryFn: async () => {
      try {
        return await fetchPublicProfile(username);
      } catch (error) {
        // A genuine 404 means "no such profile" — treat it as an empty success
        // so it renders as "not found" rather than a transient error.
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return null;
        }
        throw error;
      }
    },
  });

  const resumeQuery = useQuery({
    queryKey: ["public-resume", username],
    retry: false,
    queryFn: async () => {
      try {
        return await fetchPublicResume(username);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return null;
        }

        throw error;
      }
    },
  });

  const workExperiencesQuery = useQuery({
    queryKey: ["public-work-experiences", username],
    queryFn: () => fetchPublicWorkExperiences(username),
  });

  if (profileQuery.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-zinc-600 dark:text-zinc-400">Loading profile...</p>
      </main>
    );
  }

  if (profileQuery.isError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-zinc-700 dark:text-zinc-200">
          Couldn&apos;t load this profile. Please try again.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => profileQuery.refetch()}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Retry
          </button>
          <Link
            to="/"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            Back to login
          </Link>
        </div>
      </main>
    );
  }

  if (!profileQuery.data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-zinc-700 dark:text-zinc-200">Profile not found.</p>
        <Link
          to="/"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          Back to login
        </Link>
      </main>
    );
  }

  const profile = profileQuery.data;
  const viewport = pickViewport(isMobile);
  const chosenLayout = resolveViewportLayout(profile.layout, viewport);

  const theme = getProfileThemeProps(profile);
  const backgroundImage = safeImageUrl(profile.backgroundImageUrl);
  const shareUrl =
    typeof window !== "undefined" ? window.location.href : `/profile/${username}`;

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center gap-5 overflow-hidden px-4 py-10">
      {/* Optional full-bleed background image (behind the ambient blobs) */}
      {backgroundImage ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-20 overflow-hidden"
        >
          <img
            src={backgroundImage}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-zinc-100/82 backdrop-blur-sm dark:bg-zinc-950/85" />
        </div>
      ) : null}

      {/* Ambient futuristic backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="anim-grid-bg absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="anim-float absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl dark:bg-violet-500/15" />
        <div
          className="anim-float absolute top-40 right-1/4 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl dark:bg-cyan-400/10"
          style={{ animationDelay: "1.5s" }}
        />
      </div>

      {!userInfo ? (
        <Link
          to="/"
          className="anim-fade-in inline-flex items-center gap-2 self-end rounded-full border border-zinc-300 bg-white/70 px-3 py-2 text-sm shadow-sm backdrop-blur transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/70 dark:hover:bg-zinc-900"
        >
          <FiLogIn className="h-4 w-4" aria-hidden="true" />
          Login
        </Link>
      ) : null}

      <div
        className={`${theme.className} anim-blur-in w-full overflow-hidden rounded-3xl border border-zinc-200 bg-linear-to-b from-white to-zinc-50 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-900`}
        style={theme.style}
      >
        <ProfileCover
          bannerImageUrl={profile.bannerImageUrl}
          openToWork={profile.openToWork}
          location={profile.location}
          persona={profile.persona}
          share={{ url: shareUrl, name: profile.name }}
        />

        {/* Pull the block stack up so the centered avatar overlaps the cover. */}
        <div className="-mt-14 px-6 pb-8 sm:px-8">
          <ProfileBlocks
            layout={chosenLayout}
            viewport={viewport}
            profile={profile}
            links={profile.links}
            resume={resumeQuery.data ?? null}
            workExperiences={workExperiencesQuery.data ?? []}
            resumeLoading={resumeQuery.isLoading}
            workLoading={workExperiencesQuery.isLoading}
          />
        </div>
      </div>
    </main>
  );
}
