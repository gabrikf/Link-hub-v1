import type { ProfileBlock } from "@repo/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchPublicProfile,
  fetchPublicResume,
  fetchPublicWorkExperiences,
} from "../../../lib/auth-api";
import { reportError, reportHandled } from "../../../lib/report-error";
import {
  MOBILE_VIEWPORT_QUERY,
  pickViewport,
  resolveViewportLayout,
} from "../../profile-layout/grid-utils";
import { ProfileBlocks } from "../components/profile-blocks";
import { ProfileCover } from "../components/profile-cover";
import {
  getProfileThemeProps,
  safeImageUrl,
} from "../components/profile-theme";
import { PublicProfileSkeleton } from "../components/public-profile-skeleton";

export function PublicProfilePage() {
  const { t } = useTranslation();
  const { username } = useParams({ from: "/$username" });

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
      : false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY);
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
          {t("profile.loadFailed")}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => profileQuery.refetch()}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {t("common.retry")}
          </button>
          <Link
            to="/"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            {t("auth.backToLogin")}
          </Link>
        </div>
      </main>
    );
  }

  if (!profileQuery.isLoading && !profile) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-zinc-700 dark:text-zinc-200">
          {t("profile.notFound")}
        </p>
        <Link
          to="/"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          {t("auth.backToLogin")}
        </Link>
      </main>
    );
  }

  const theme = getProfileThemeProps(profile ?? {});
  const backgroundImage = safeImageUrl(profile?.backgroundImageUrl);
  // `/${username}` is the short URL — `/profile/:username` was removed. The
  // window branch is what actually ships (it carries the origin); the fallback
  // only exists for a non-browser render and must not name the dead path.
  const shareUrl =
    typeof window !== "undefined" ? window.location.href : `/${username}`;

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
    //
    // Horizontal padding NESTS on this page: this `<main>`, then the block
    // stack below (`px-6`), then every block's own `p-4`. At 375px that was
    // 16 + 24 + 16 = 56px of chrome PER SIDE (58 with the two hairline
    // borders), leaving a 259px reading column inside a 375px phone — the text
    // read as a compressed ribbon down the middle.
    //
    // Below `sm` the outer gutter shrinks to 8px: enough that the card's
    // `rounded-3xl` corners and its border still read as a card floating on the
    // page, and no more. `sm:px-4` restores the previous 16px from 640px up, so
    // desktop is byte-for-byte what it was.
    //
    // Vertical: `pt-3` where this used to be `py-10`. `TopBarNav` is a `sticky
    // top-0` bar with its own bottom border, so 40px of page above the card
    // read as a gap between two things rather than as one page — the card now
    // starts 12px under the header's rule and the profile is the first thing on
    // screen. `pb-10` is the old bottom padding, unchanged.
    <main
      className={`${theme.className} relative mx-auto flex min-h-screen w-full ${
        viewport === "pc" ? "max-w-6xl" : "max-w-md"
      } flex-col items-center gap-5 px-2 pb-10 pt-3 sm:px-4`}
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

      {/*
        The sign-in CTA lives in `TopBarNav` now, next to the language and theme
        controls, as siblings in one flex row.

        It used to be an in-flow `self-end` pill right here, carrying an `mt-3`
        whose only job was to duck under the `fixed right-4 top-3 z-40` toggle
        cluster in `App.tsx` — a pixel guess against an element on a higher
        layer that this page could neither see nor control. The cluster is gone,
        so the duplicate pill and the margin that dodged it are gone with it.
      */}

      {/* `dark:to-zinc-950`: the dark gradient used to run zinc-900 -> zinc-900,
          i.e. two identical stops — a gradient that rendered as a flat fill. */}
      <div className="anim-blur-in w-full overflow-hidden rounded-3xl border border-zinc-200 bg-linear-to-b from-white to-zinc-50 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
        {profile && chosenLayout ? (
          <>
            <ProfileCover
              bannerImageUrl={profile.bannerImageUrl}
              persona={profile.persona}
              personaOther={profile.personaOther}
              share={{ url: shareUrl, name: profile.name }}
            />

            {/*
              Pull the block stack up so the centered avatar overlaps the cover.

              `px-1.5` below `sm` — the second of the three nested gutters (see
              the note on `<main>`). Every block already carries its own `p-4`
              and its own border, so this level only has to keep the blocks off
              the card's inner edge; 6px does that. `sm:px-8` is the original
              value from 640px up, so desktop spacing is unchanged. `pb-8` and
              `-mt-14` are vertical and stay exactly as they were.

              Total at 375px: 8 (main) + 1 (card border) + 6 (here) + 16 (block
              padding) + 1 (block border) = 32px per side.
            */}
            <div className="-mt-14 px-1.5 pb-8 sm:px-8">
              <ProfileBlocks
                layout={chosenLayout}
                viewport={viewport}
                profile={profile}
                links={profile.links}
                resume={resumeQuery.data ?? null}
                workExperiences={workExperiencesQuery.data ?? []}
                resumeLoading={resumeQuery.isLoading}
                workLoading={workExperiencesQuery.isLoading}
                // Per viewport, and read off the layout that is actually being
                // rendered: a profile can keep its tab strip on desktop and
                // publish one scrolling list on a phone.
                tabsEnabled={chosenLayout.tabsEnabled}
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
