import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { FiGrid, FiLogOut, FiUser } from "react-icons/fi";
import { clearAuthTokens, getAuthTokens } from "../lib/auth-tokens";
import { useUserInfoStore } from "../lib/user-info-store";
import { Button } from "./button";

function getLinkClasses(isActive: boolean): string {
  return [
    "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition",
    isActive
      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
      : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900",
  ].join(" ");
}

export function TopBarNav() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const userInfo = useUserInfoStore((state) => state.userInfo);
  const clearUserInfo = useUserInfoStore((state) => state.clearUserInfo);

  const hasSession = Boolean(getAuthTokens() && userInfo?.login);

  if (!hasSession || !userInfo) {
    return null;
  }

  const logout = () => {
    clearAuthTokens();
    clearUserInfo();
    navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {userInfo.name}
        </p>

        <nav className="flex flex-wrap items-center justify-end gap-2">
          <Link
            to="/dashboard"
            className={getLinkClasses(pathname === "/dashboard")}
          >
            <FiGrid className="h-4 w-4" aria-hidden="true" />
            Dashboard
          </Link>

          <Link
            to="/profile/$username"
            params={{ username: userInfo.login }}
            className={getLinkClasses(pathname.startsWith("/profile/"))}
          >
            <FiUser className="h-4 w-4" aria-hidden="true" />
            Public profile
          </Link>

          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            onClick={logout}
          >
            <FiLogOut className="h-4 w-4" aria-hidden="true" />
            Logout
          </Button>
        </nav>
      </div>
    </header>
  );
}
