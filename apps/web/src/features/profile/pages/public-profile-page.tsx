import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import axios from "axios";
import { FiExternalLink, FiLink2, FiLogIn, FiUser } from "react-icons/fi";
import {
  fetchPublicProfile,
  fetchPublicResume,
  fetchPublicWorkExperiences,
} from "../../../lib/auth-api";
import { getLinkIconOption } from "../../../lib/link-icons";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Avatar } from "../../../shared-components/avatar";
import { ResumeReadOnlyCard } from "../../resume/components/resume-read-only-card";
import { WorkHistoryReadOnly } from "../../work-history/components/work-history-read-only";

export function PublicProfilePage() {
  const { username } = useParams({ from: "/profile/$username" });
  const userInfo = useUserInfoStore((state) => state.userInfo);

  const profileQuery = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => fetchPublicProfile(username),
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
  const hasLinks = profile.links.length > 0;

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center gap-5 overflow-hidden px-4 py-10">
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

      <div className="anim-blur-in w-full rounded-3xl border border-zinc-200 bg-linear-to-b from-white to-zinc-50 p-8 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-900">
        <header className="flex flex-col items-center gap-4 text-center">
          <div className="anim-glow-pulse anim-scale-in rounded-full">
            <Avatar
              name={profile.name}
              imageUrl={profile.userPhoto}
              size={92}
              className="ring-2 ring-violet-400/60 shadow-lg dark:ring-violet-500/50"
            />
          </div>

          <div className="anim-fade-up anim-delay-1 min-w-0 text-center">
            <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
              <FiUser className="h-5 w-5 text-violet-500 dark:text-violet-300" />
              <span className="truncate">{profile.name}</span>
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              @{profile.username}
            </p>
            {profile.description ? (
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {profile.description}
              </p>
            ) : (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                No profile description yet.
              </p>
            )}
          </div>
        </header>

        <section className="mt-8 space-y-3">
          {hasLinks ? (
            profile.links.map((link, index) => {
              const selectedIcon = getLinkIconOption(link.icon);

              return (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ animationDelay: `${0.15 + index * 0.07}s` }}
                  className="anim-fade-up group block rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_0_24px_-4px_rgba(139,92,246,0.55)] dark:border-zinc-700 dark:bg-zinc-900/70 dark:hover:border-violet-500/70"
                >
                  <p className="inline-flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100">
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full shadow-sm"
                      style={{
                        color: selectedIcon?.color,
                        background:
                          selectedIcon?.backgroundColor ??
                          "linear-gradient(135deg, #0EA5E9, #14B8A6)",
                      }}
                    >
                      {selectedIcon ? (
                        <selectedIcon.Icon
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      ) : (
                        <FiLink2
                          className="h-3.5 w-3.5 text-white"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className="truncate">{link.title}</span>
                    <FiExternalLink className="h-4 w-4 text-zinc-400 transition group-hover:text-zinc-700 dark:group-hover:text-zinc-200" />
                  </p>
                  <p className="mt-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
                    {link.url}
                  </p>
                </a>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
              No public links yet.
            </div>
          )}
        </section>

        <section className="anim-fade-up anim-delay-4 mt-8">
          <ResumeReadOnlyCard
            resume={resumeQuery.data ?? null}
            isLoading={resumeQuery.isLoading}
            title="Resume"
            subtitle="Professional summary"
            emptyMessage="This user has not published resume details yet."
          />
        </section>

        {workExperiencesQuery.isLoading ||
        (workExperiencesQuery.data?.length ?? 0) > 0 ? (
          <section className="anim-fade-up anim-delay-5 mt-8">
            <WorkHistoryReadOnly
              workExperiences={workExperiencesQuery.data ?? []}
              isLoading={workExperiencesQuery.isLoading}
              subtitle="Professional experience"
            />
          </section>
        ) : null}
      </div>
    </main>
  );
}
