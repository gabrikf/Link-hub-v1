import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import axios from "axios";
import {
  FiExternalLink,
  FiGrid,
  FiLink2,
  FiLogIn,
  FiUser,
} from "react-icons/fi";
import { fetchPublicProfile, fetchPublicResume } from "../../../lib/auth-api";
import { getLinkIconOption } from "../../../lib/link-icons";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Avatar } from "../../../shared-components/avatar";
import { ResumeReadOnlyCard } from "../../resume/components/resume-read-only-card";

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
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center gap-5 px-4 py-10">
      {userInfo ? (
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 self-end rounded-full border border-zinc-300 bg-white/70 px-3 py-2 text-sm shadow-sm transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/70 dark:hover:bg-zinc-900"
        >
          <FiGrid className="h-4 w-4" aria-hidden="true" />
          Dashboard
        </Link>
      ) : (
        <Link
          to="/"
          className="inline-flex items-center gap-2 self-end rounded-full border border-zinc-300 bg-white/70 px-3 py-2 text-sm shadow-sm transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/70 dark:hover:bg-zinc-900"
        >
          <FiLogIn className="h-4 w-4" aria-hidden="true" />
          Login
        </Link>
      )}

      <div className="w-full rounded-3xl border border-zinc-200 bg-linear-to-b from-white to-zinc-50 p-8 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-900">
        <header className="flex flex-col items-center gap-4 text-center">
          <Avatar
            name={profile.name}
            imageUrl={profile.userPhoto}
            size={92}
            className="ring-2 ring-zinc-300/60 shadow-lg dark:ring-zinc-700/70"
          />

          <div className="min-w-0 text-center">
            <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
              <FiUser className="h-5 w-5 text-zinc-500 dark:text-zinc-300" />
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
            profile.links.map((link) => {
              const selectedIcon = getLinkIconOption(link.icon);

              return (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group block rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900/70 dark:hover:border-zinc-600"
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

        <section className="mt-8">
          <ResumeReadOnlyCard
            resume={resumeQuery.data ?? null}
            isLoading={resumeQuery.isLoading}
            title="Resume"
            subtitle="Professional summary"
            emptyMessage="This user has not published resume details yet."
          />
        </section>
      </div>
    </main>
  );
}
