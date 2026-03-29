import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { FiGrid, FiLogIn, FiUser } from "react-icons/fi";
import { fetchPublicProfile } from "../../../lib/auth-api";
import { useUserInfoStore } from "../../../lib/user-info-store";

export function PublicProfilePage() {
  const { username } = useParams({ from: "/profile/$username" });
  const userInfo = useUserInfoStore((state) => state.userInfo);

  const profileQuery = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => fetchPublicProfile(username),
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center gap-4 px-4 py-10">
      {userInfo ? (
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 self-end rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          <FiGrid className="h-4 w-4" aria-hidden="true" />
          Dashboard
        </Link>
      ) : (
        <Link
          to="/"
          className="inline-flex items-center gap-2 self-end rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          <FiLogIn className="h-4 w-4" aria-hidden="true" />
          Login
        </Link>
      )}

      <div className="w-full rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {profile.userPhoto ? (
          <img
            src={profile.userPhoto}
            alt={profile.name}
            className="mx-auto h-24 w-24 rounded-full border border-zinc-200 object-cover dark:border-zinc-700"
          />
        ) : null}

        <h1 className="mt-4 inline-flex items-center gap-2 text-2xl font-bold">
          <FiUser className="h-5 w-5 text-zinc-500 dark:text-zinc-300" />
          {profile.name}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">@{profile.username}</p>
        {profile.description ? (
          <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-700 dark:text-zinc-300">
            {profile.description}
          </p>
        ) : null}

        <div className="mt-8 space-y-3">
          {profile.links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:bg-zinc-800"
            >
              <p className="inline-flex items-center gap-2 font-medium">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-teal-500 text-white">
                  <FiGrid className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                {link.title}
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {link.url}
              </p>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
