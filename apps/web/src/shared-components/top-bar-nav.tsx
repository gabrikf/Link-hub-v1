import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ComponentType } from "react";
import { FiGrid, FiLogOut, FiMenu, FiSearch, FiUser, FiX } from "react-icons/fi";
import { clearAuthTokens, getAuthTokens } from "../lib/auth-tokens";
import { useUserInfoStore } from "../lib/user-info-store";
import { BrandLogo } from "./brand-logo";
import { Button } from "./button";

type NavItem = {
  key: string;
  label: string;
  to: string;
  params?: Record<string, string>;
  icon: ComponentType<{ className?: string }>;
  isActive: (pathname: string) => boolean;
};

function linkClasses(isActive: boolean): string {
  return [
    "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition",
    isActive
      ? "bg-violet-700 text-white shadow-sm dark:bg-violet-600"
      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
  ].join(" ");
}

export function TopBarNav() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const userInfo = useUserInfoStore((state) => state.userInfo);
  const clearUserInfo = useUserInfoStore((state) => state.clearUserInfo);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const hasSession = Boolean(getAuthTokens() && userInfo?.login);

  if (!hasSession || !userInfo) {
    return null;
  }

  const logout = () => {
    setIsMobileMenuOpen(false);
    clearAuthTokens();
    clearUserInfo();
    navigate({ to: "/" });
  };

  const navItems: NavItem[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      to: "/dashboard",
      icon: FiGrid,
      isActive: (path) => path === "/dashboard",
    },
    {
      key: "search",
      label: "Recruiter search",
      to: "/dashboard/search",
      icon: FiSearch,
      isActive: (path) => path.startsWith("/dashboard/search"),
    },
    {
      key: "profile",
      label: "Public profile",
      to: "/profile/$username",
      params: { username: userInfo.login },
      icon: FiUser,
      isActive: (path) => path.startsWith("/profile/"),
    },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
      {/* Right padding on desktop reserves space for the floating theme toggle. */}
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:pr-28">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandLogo className="h-9 w-9 shrink-0 shadow-sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
              LinkHub
            </p>
            <p className="truncate text-xs leading-tight text-zinc-500 dark:text-zinc-400">
              {userInfo.name}
            </p>
          </div>
        </div>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              params={item.params}
              className={linkClasses(item.isActive(pathname))}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
          <span className="mx-1 h-6 w-px bg-zinc-200 dark:bg-zinc-700" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            fullWidth={false}
            className="rounded-full"
            onClick={logout}
          >
            <FiLogOut className="h-4 w-4" aria-hidden="true" />
            Logout
          </Button>
        </nav>

        {/* Mobile hamburger */}
        <Button
          type="button"
          variant="icon"
          size="icon"
          fullWidth={false}
          className="md:hidden"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((open) => !open)}
        >
          {isMobileMenuOpen ? (
            <FiX className="h-5 w-5" aria-hidden="true" />
          ) : (
            <FiMenu className="h-5 w-5" aria-hidden="true" />
          )}
        </Button>
      </div>

      {/* Mobile dropdown panel */}
      {isMobileMenuOpen ? (
        <nav className="border-t border-zinc-200 bg-white px-4 py-3 md:hidden dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1.5">
            {navItems.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                params={item.params}
                onClick={() => setIsMobileMenuOpen(false)}
                className={[
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                  item.isActive(pathname)
                    ? "bg-violet-700 text-white dark:bg-violet-600"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800",
                ].join(" ")}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
            <Button
              type="button"
              variant="outline"
              fullWidth
              className="mt-1 justify-start"
              onClick={logout}
            >
              <FiLogOut className="h-4 w-4" aria-hidden="true" />
              Logout
            </Button>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
