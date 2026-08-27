import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  cloneElement,
  useId,
  useState,
  type ComponentType,
  type ReactElement,
} from "react";
import { useTranslation } from "react-i18next";
import {
  FiEdit3,
  FiGrid,
  FiLayout,
  FiLogOut,
  FiMenu,
  FiSearch,
  FiSettings,
  FiUser,
  FiX,
} from "react-icons/fi";
import { clearAuthTokens, getAuthTokens } from "../lib/auth-tokens";
import { useUserInfoStore } from "../lib/user-info-store";
import { BrandLogo } from "./brand-logo";
import { Button } from "./button";
import { FOCUS_RING_PAGE } from "./surface";

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
    // Icon-only on desktop: fixed square, never shrinks, never wraps.
    "inline-flex h-9 w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition",
    FOCUS_RING_PAGE,
    isActive
      ? "bg-violet-700 text-white shadow-sm dark:bg-violet-600"
      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
  ].join(" ");
}

/**
 * Wraps a desktop nav control and shows its page title as an accessible
 * tooltip on hover and on keyboard focus. The control's `aria-label` provides
 * the accessible name; the tooltip text is wired to it via `aria-describedby`
 * so it is also announced.
 */
function NavTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ "aria-describedby"?: string }>;
}) {
  const tooltipId = useId();
  return (
    <div className="group relative flex">
      {cloneElement(children, { "aria-describedby": tooltipId })}
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-1 dark:ring-zinc-700"
      >
        {label}
      </span>
    </div>
  );
}

export function TopBarNav() {
  const { t } = useTranslation();
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
      label: t("nav.dashboard"),
      to: "/dashboard",
      icon: FiGrid,
      isActive: (path) => path === "/dashboard",
    },
    {
      key: "layout",
      label: t("common.profileLayout"),
      to: "/dashboard/layout",
      icon: FiLayout,
      isActive: (path) => path.startsWith("/dashboard/layout"),
    },
    {
      key: "posts",
      label: t("common.posts"),
      to: "/dashboard/posts",
      icon: FiEdit3,
      isActive: (path) => path.startsWith("/dashboard/posts"),
    },
    {
      key: "search",
      label: t("nav.recruiterSearch"),
      to: "/dashboard/search",
      icon: FiSearch,
      isActive: (path) => path.startsWith("/dashboard/search"),
    },
    {
      key: "profile",
      label: t("nav.publicProfile"),
      to: "/profile/$username",
      params: { username: userInfo.login },
      icon: FiUser,
      isActive: (path) => path.startsWith("/profile/"),
    },
    {
      key: "settings",
      label: t("nav.settings"),
      to: "/dashboard/settings",
      icon: FiSettings,
      isActive: (path) => path.startsWith("/dashboard/settings"),
    },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
      {/* Right padding reserves space for the floating language + theme
          cluster, which is top-right at every breakpoint (the theme toggle
          used to sit over page content on mobile). */}
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 py-3 pl-4 pr-52">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandLogo className="h-9 w-9 shrink-0 shadow-sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
              {t("common.brandName")}
            </p>
            <p className="truncate text-xs leading-tight text-zinc-500 dark:text-zinc-400">
              {userInfo.name}
            </p>
          </div>
        </div>

        {/* Desktop navigation — icon-only, single line, titles shown as tooltips. */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <NavTooltip key={item.key} label={item.label}>
              <Link
                to={item.to}
                params={item.params}
                aria-label={item.label}
                className={linkClasses(item.isActive(pathname))}
              >
                <item.icon className="h-5 w-5" aria-hidden="true" />
              </Link>
            </NavTooltip>
          ))}
          <span className="mx-1 h-6 w-px shrink-0 bg-zinc-200 dark:bg-zinc-700" />
          <NavTooltip label={t("nav.logout")}>
            <Button
              type="button"
              variant="icon"
              size="icon"
              fullWidth={false}
              className="rounded-full"
              aria-label={t("nav.logout")}
              onClick={logout}
            >
              <FiLogOut className="h-5 w-5" aria-hidden="true" />
            </Button>
          </NavTooltip>
        </nav>

        {/* Mobile hamburger */}
        <Button
          type="button"
          variant="icon"
          size="icon"
          fullWidth={false}
          className="md:hidden"
          aria-label={isMobileMenuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
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
                  FOCUS_RING_PAGE,
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
              {t("nav.logout")}
            </Button>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
