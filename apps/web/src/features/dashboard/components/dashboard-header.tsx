import { Link } from "@tanstack/react-router";
import { FiExternalLink, FiLayout, FiLogOut } from "react-icons/fi";
import { Button } from "../../../shared-components/button";

type DashboardHeaderProps = {
  username?: string;
  onLogout: () => void;
};

export function DashboardHeader({ username, onLogout }: DashboardHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2 items-center">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-cyan-500 to-blue-500 text-white shadow-sm">
          <FiLayout className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col">
          <h1 className="flex items-center gap-1 text-lg font-semibold">
            Dashboard
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Manage your link collection.
          </p>
        </div>
      </div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
        {username ? (
          <Link
            to="/profile/$username"
            params={{ username }}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
          >
            <FiExternalLink className="h-4 w-4" aria-hidden="true" />
            Public profile
          </Link>
        ) : null}
        <Button
          type="button"
          variant="outline"
          fullWidth={false}
          onClick={onLogout}
          className="px-3"
        >
          <FiLogOut className="h-4 w-4" aria-hidden="true" />
          Logout
        </Button>
      </div>
    </header>
  );
}
