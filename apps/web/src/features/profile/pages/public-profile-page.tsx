import type { ProfileBlock } from "@repo/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { FiLogIn } from "react-icons/fi";
import {
  fetchPublicProfile,
  fetchPublicResume,
  fetchPublicWorkExperiences,
} from "../../../lib/auth-api";
import { reportError, reportHandled } from "../../../lib/report-error";
import { useUserInfoStore } from "../../../lib/user-info-store";
import {
  pickViewport,
  resolveViewportLayout,
} from "../../profile-layout/grid-utils";
import { ProfileBlocks } from "../components/profile-blocks";
import { ProfileCover } from "../components/profile-cover";
import { getProfileThemeProps, safeImageUrl } from "../components/profile-theme";
import { PublicProfileSkeleton } from "../components/public-profile-skeleton";

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
          reportHandled(error, { action: "profile.fetch-public" });
          return null;
        }
        reportError(error, { action: "profile.fetch-public" });
        throw error;
      }
    },
  });

  // While the profile is in flight the page shell below still renders, with a
  // profile-shaped skeleton in the card. Only a settled-but-empty response is
  // "not found".
  const profile = profileQuery.data ?? null;
  const viewport = pickViewport(isMobile);

  // Memoized: for legacy profiles (no stored layout) `resolveViewportLayout`
  // returns a FRESH `buildDefaultLayout(viewport)` object on every call, which
  // broke both compaction memos inside `ProfileBlocks` — they recomputed on
  // every render because their `layout.blocks` dependency was a new array each
  // time. Profiles that DO have a layout returned a stable reference and were
  // unaffected, which is why this only showed up on legacy profiles.
  const chosenLayout = useMemo(
    () => (profile ? resolveViewportLayout(profile.layout, viewport) : null),
    [profile, viewport],
  );

  // Only fetch what the layout actually renders. A profile whose layout has no
  // resume block (or has it hidden) used to fetch the resume anyway, on every
  // visit.
  const rendersBlock = (kind: ProfileBlock["kind"]) =>
    chosenLayout?.blocks.some(
      (block) => block.kind === kind && block.isVisible,
    ) ?? false;

  const resumeQuery = useQuery({
    queryKey: ["public-resume", username],
    retry: false,
    enabled: rendersBlock("resume"),
    queryFn: async () => {
      try {
        return await fetchPublicResume(username);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          // This profile simply has no public resume.
          reportHandled(error, { action: "profile.fetch-public-resume" });
          return null;
        }

        reportError(error, { action: "profile.fetch-public-resume" });
        throw error;
      }
    },
  });

  const workExperiencesQuery = useQuery({
    queryKey: ["public-work-experiences", username],
    enabled: rendersBlock("work_experiences"),
    queryFn: () => fetchPublicWorkExperiences(username),
  });

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

  if (!profileQuery.isLoading && !profile) {
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

  const theme = getProfileThemeProps(profile ?? {});
  const backgroundImage = safeImageUrl(profile?.backgroundImageUrl);
  const shareUrl =
    typeof window !== "undefined" ? window.location.href : `/profile/${username}`;

  return (
    // The theme (`profile-root` + the `--profile-accent` presets) is applied
    // HERE rather than on the card, because the ambient blobs below sit outside
    // the card and were hard-coded violet — pick "Forest" and the page stayed
    // violet. With the variables on `<main>` they inherit the accent too.
    //
    // Width: `max-w-3xl` gave the published 12-column grid 670px, i.e. 44.8px
    // per column, while the editor's canvas was ~1169px. `max-w-6xl` at the pc
    // viewport leaves 1056px of card interior, which is what the shared
    // `PROFILE_CANVAS_WIDTH.pc` (1024px) clamp needs to hit exactly. The mobile
    // viewport gets a phone-shaped `max-w-md` for the same reason — its grid is
    // only 4 columns wide and looked absurd stretched across a tablet.
    //
    // No `overflow-hidden`: it turned any overflow into SILENT clipping (it is
    // why the clipped profile name produced no scrollbar). The two ambient
    // layers below carry their own `overflow-hidden` wrappers already.
    <main
      className={`${theme.className} relative mx-auto flex min-h-screen w-full ${
        viewport === "pc" ? "max-w-6xl" : "max-w-md"
      } flex-col items-center gap-5 px-4 py-10`}
      style={theme.style}
    >
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
        {/*
          Both blobs are derived from `--profile-accent` instead of the old
          hard-coded violet/cyan, so every preset recolours the whole page and
          not just the card interior. The second uses `--profile-accent-fg`
          (already tuned per theme: darkened in light mode, lightened in dark)
          to keep the two-tone depth the violet/cyan pair used to give.
        */}
        <div
          className="anim-float absolute -top-24 left-1/4 h-72 w-72 rounded-full blur-3xl"
          style={{
            background:
              "color-mix(in srgb, var(--profile-accent), transparent 80%)",
          }}
        />
        <div
          className="anim-float absolute top-40 right-1/4 h-64 w-64 rounded-full blur-3xl"
          style={{
            animationDelay: "1.5s",
            background:
              "color-mix(in srgb, var(--profile-accent-fg), transparent 84%)",
          }}
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

      {/* `dark:to-zinc-950`: the dark gradient used to run zinc-900 -> zinc-900,
          i.e. two identical stops — a gradient that rendered as a flat fill. */}
      <div className="anim-blur-in w-full overflow-hidden rounded-3xl border border-zinc-200 bg-linear-to-b from-white to-zinc-50 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
        {profile && chosenLayout ? (
          <>
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
          </>
        ) : (
          <PublicProfileSkeleton />
        )}
      </div>
    </main>
  );
}
