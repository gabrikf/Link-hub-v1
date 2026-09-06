import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
} from "react";
import { useTranslation } from "react-i18next";
import {
  FiEdit3,
  FiGrid,
  FiLayout,
  FiLogIn,
  FiLogOut,
  FiMenu,
  FiSearch,
  FiSettings,
  FiUser,
  FiX,
} from "react-icons/fi";
import { getAuthTokens } from "../lib/auth-tokens";
import { signOut } from "../lib/session";
import type { Theme } from "../lib/theme";
import { useUserInfoStore } from "../lib/user-info-store";
import { BrandLogo } from "./brand-logo";
import { Button } from "./button";
import { LanguageToggle } from "./language-toggle";
import { FOCUS_RING_FIELD, FOCUS_RING_PAGE } from "./surface";
import { ThemeToggle } from "./theme-toggle";

type TopBarNavProps = Readonly<{
  /**
   * The theme actually painted. Owned by `App`, which also owns the stored
   * preference (`"system"` included) — see `theme-toggle.tsx` for why the state
   * stays there and arrives here as a prop.
   */
  theme: Theme;
  onToggleTheme: () => void;
}>;

type NavItem = {
  key: string;
  label: string;
  to: string;
  params?: Record<string, string>;
  icon: ComponentType<{ className?: string }>;
  isActive: (pathname: string) => boolean;
};

/**
 * The bar's material. Pinned in a constant because both branches below render
 * it and a drifted copy is invisible until you sign in and watch the chrome
 * change shape under you.
 */
const BAR_SURFACE =
  "sticky top-0 z-40 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80";

/**
 * The header row's geometry, and the whole of item 3.1.
 *
 * It was `py-3` around a 44px control: 24 + 44 = 68px of row plus the hairline
 * border, measured at 69px in Chromium at every width. The row is now a FIXED
 * 52px (`h-13`), so the bar is 53px including the border — a 16px saving on
 * every screen in the app.
 *
 * 52 is not arbitrary. Measured in Chromium in August 2026: YouTube's mobile
 * web bar is 48px and its desktop masthead is 56px; Instagram's logged-out
 * desktop bar is 60px; GitHub's logged-out header is 64px. This bar carries
 * less than any of them — no search field, no notifications — so it sits at
 * the bottom of that measured range rather than in the middle of it.
 *
 * Fixed rather than derived on purpose: with `py-*` the bar's height was a
 * consequence of whichever control inside it happened to be tallest, so
 * changing a button's size silently moved the header. Now the row states its
 * own height and the controls fit inside it.
 */
const BAR_ROW = "mx-auto flex h-13 w-full max-w-6xl items-center gap-2 px-4";

/**
 * The signed-out screens that render their own brand mark and need no chrome
 * above them.
 *
 * `AuthShell` centres its card in a `min-h-screen` box. A 53px header ABOVE
 * that box pushes the whole thing 53px down the viewport, which is exactly the
 * "the login square is almost at the bottom" report — the card was centred, in
 * a box that started below the header. Rendering nothing here is what actually
 * centres it, and it costs nothing: every one of these screens already shows
 * the logo and the product name inside the card.
 *
 * A literal list rather than "not the profile route" so that renaming the
 * public-profile path cannot silently drop the bar from it.
 */
const AUTH_SCREEN_PATHS = new Set([
  "/",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
]);

/** Everything inside the header that can hold focus while the sheet is open. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
 * A row inside the sheet. 44px minimum, which is the Apple HIG target and
 * comfortably over the 24px WCAG 2.2 (2.5.8) floor — this list is only ever
 * touched with a thumb.
 */
function sheetLinkClasses(isActive: boolean): string {
  return [
    "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
    FOCUS_RING_PAGE,
    isActive
      ? "bg-violet-700 text-white dark:bg-violet-600"
      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800",
  ].join(" ");
}

/** Heading over a group of controls inside the sheet. */
function MenuSectionLabel({ children }: Readonly<{ children: string }>) {
  return (
    <p className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {children}
    </p>
  );
}

/**
 * The brand mark and wordmark, as the inside of a link.
 *
 * Split out rather than parameterised with a `to` prop because TanStack's
 * `Link` types its destination against the route tree — the two call sites
 * below pass different literals and both stay checked.
 */
function BrandMark({ brandName }: Readonly<{ brandName: string }>) {
  return (
    <>
      <BrandLogo className="h-8 w-8 shrink-0 transition-transform duration-150 group-hover:scale-105 motion-reduce:transition-none" />
      <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {brandName}
      </span>
    </>
  );
}

const BRAND_LINK = `group inline-flex shrink-0 items-center gap-2 rounded-full pr-2 ${FOCUS_RING_PAGE}`;

/**
 * Wraps a desktop nav control and shows its page title as an accessible
 * tooltip on hover and on keyboard focus. The control's `aria-label` provides
 * the accessible name; the tooltip text is wired to it via `aria-describedby`
 * so it is also announced.
 */
function NavTooltip({
  label,
  children,
}: Readonly<{
  label: string;
  children: ReactElement<{ "aria-describedby"?: string }>;
}>) {
  const tooltipId = useId();
  return (
    <div className="group relative flex">
      {cloneElement(children, { "aria-describedby": tooltipId })}
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-sm transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:transition-none dark:bg-zinc-800 dark:text-zinc-100 dark:ring-1 dark:ring-zinc-700"
      >
        {label}
      </span>
    </div>
  );
}

/**
 * The application header.
 *
 * SHAPE — 52px of row, one line, three zones (brand · navigation · account).
 * YouTube, Instagram, GitHub and TikTok were measured in Chromium before this
 * was drawn; what was taken from them and what was deliberately left:
 *
 * - TAKEN, from YouTube (48px mobile web / 56px desktop masthead) and
 *   Instagram (60px desktop): a fixed SHORT bar with a stated height, rather
 *   than one that is however tall its contents happen to be.
 * - TAKEN, from YouTube and TikTok: the account and preference controls sit at
 *   the far end of the row after a divider, so the destinations read as one
 *   group and the settings as another.
 * - TAKEN, from TikTok and YouTube: the mobile menu is a SHEET over the page —
 *   a scrim plus a panel from the edge — not a dropdown that pushes the page
 *   down. The old dropdown grew this header from 69px to 623px when it opened,
 *   which is a header that becomes the page.
 * - TAKEN, from TikTok and YouTube: identity and destinations at the TOP of
 *   that sheet, secondary and terminal actions at the BOTTOM. Both anchor
 *   their least-used links to the bottom edge; here that is Logout, which also
 *   keeps the one destructive control out from under a thumb aiming at a nav
 *   row.
 * - REJECTED — the LEFT RAIL. TikTok (240px, no top bar at all), YouTube
 *   (masthead PLUS a 240px guide), X (a 275px nav column since the 2019
 *   desktop redesign) and Instagram (a side rail since November 2022) have all
 *   converged on one. What they converged on UNDERNEATH the rail is the part
 *   worth taking, and this bar takes it: every destination stays visible on
 *   desktop, and the hamburger exists only below `md`. Nielsen Norman measured
 *   discoverability dropping over 20% and desktop users getting at least 39%
 *   slower when destinations are hidden behind a menu. The rail itself is the
 *   wrong shape here — 240px is a seventh of a 1440px screen, spent on six
 *   icons, next to dashboards that want the width.
 * - REJECTED — the bottom tab bar Instagram and TikTok use on mobile. Material
 *   scopes that component to three-to-five destinations and warns explicitly
 *   that translated labels collide beyond that; this app has six and ships
 *   three locales, and the bar would sit permanently over the bottom of the
 *   layout editor.
 * - REJECTED — the search field YouTube puts in the middle of its masthead.
 *   Recruiter search here is a whole screen with filters and an AI re-rank,
 *   not a box.
 * - REJECTED — YouTube's and GitHub's drawer ACCESSIBILITY. Both ship a `nav`
 *   with no `aria-modal`, no focus move and nothing inert behind them, while
 *   visually blocking the page. That is the uncomfortable middle between APG's
 *   two patterns; this sheet blocks the page, so it commits to Dialog (Modal)
 *   properly — see the sheet's own comment below.
 *
 * The language and theme controls live here and only here — they used to be a
 * viewport-`fixed` cluster in `App.tsx` on a higher stacking layer than the
 * page, which cost this component a `pr-52 sm:pr-60` gutter and the public
 * profile an `mt-3`: two hardcoded pixel guesses aimed at an element neither
 * could see.
 */
export function TopBarNav({ theme, onToggleTheme }: TopBarNavProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const userInfo = useUserInfoStore((state) => state.userInfo);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const menuButtonId = useId();
  const closeButtonId = useId();

  /*
   * `getElementById` rather than refs on the two buttons: `Button` is a plain
   * function component that spreads `ButtonHTMLAttributes`, so it takes no
   * `ref` prop, and forcing one through would need a cast this file has no
   * business making.
   */
  const closeMenu = useCallback(
    (shouldRestoreFocus: boolean) => {
      setIsMobileMenuOpen(false);
      if (!shouldRestoreFocus) {
        return;
      }
      const trigger = document.getElementById(menuButtonId);
      if (trigger instanceof HTMLElement) {
        trigger.focus();
      }
    },
    [menuButtonId],
  );

  /*
   * Everything the open sheet owns: the Escape key, the Tab ring, the page
   * scroll under it, and where focus starts. All of it only while it is open,
   * all of it torn down together.
   */
  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Focus goes back to the hamburger: a keyboard user who dismisses the
        // sheet must not be dropped at the top of the document.
        closeMenu(true);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      /*
       * The trap. Without it Tab walks straight out of the sheet and into the
       * page behind the scrim, where the user is tabbing through controls they
       * cannot see and cannot click.
       */
      const panel = panelRef.current;
      if (!panel) {
        return;
      }
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      const first = focusables.at(0);
      const last = focusables.at(-1);
      if (!first || !last) {
        return;
      }

      const active = document.activeElement;
      const isInside = active instanceof Node && panel.contains(active);
      if (event.shiftKey && (active === first || !isInside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !isInside)) {
        event.preventDefault();
        first.focus();
      }
    };

    /*
     * Dismiss on a press outside the PANEL — which is what makes the scrim
     * dismissive without giving it a click handler of its own. A scrim that
     * handles clicks is either a `div` with an `onClick` (no keyboard path, a
     * lint finding, and a lie to assistive tech) or a full-screen `button`
     * that lands in the tab order. Escape is the keyboard equivalent and it is
     * handled above.
     */
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) {
        return;
      }
      const trigger = document.getElementById(menuButtonId);
      if (target instanceof Node && trigger?.contains(target)) {
        // The hamburger's own toggle handles this press; closing here too
        // would reopen it on the same click.
        return;
      }
      closeMenu(true);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);

    // The page must not scroll behind a full-height sheet.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // APG's dialog pattern: focus starts on the close control, so the first
    // thing a screen-reader user hears is the way out.
    document.getElementById(closeButtonId)?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeButtonId, closeMenu, isMobileMenuOpen, menuButtonId]);

  const hasSession = Boolean(getAuthTokens() && userInfo?.login);

  /*
   * SIGNED OUT.
   *
   * No language control and no theme control before sign-in — a product
   * decision, not an oversight. They were the first thing a visitor saw on a
   * page whose whole job is a sign-in card, and they read as settings for a
   * product the visitor has not entered yet. Language now follows the browser
   * (`lib/language.ts` walks `navigator.languages`), and a choice stored from a
   * previous session still wins the moment there is a session to apply it to.
   *
   * What is left is a header for the ONE signed-out screen that is not the
   * sign-in card: a stranger's public profile. There it earns its place — it
   * is the only route back to the product from a shared link. Sticky, frosted
   * and full-bleed, because the previous "no background" version let the
   * profile's own text run through the gaps between the controls while
   * scrolling.
   */
  if (!hasSession || !userInfo) {
    if (AUTH_SCREEN_PATHS.has(pathname)) {
      return null;
    }

    return (
      <header className={BAR_SURFACE}>
        <div className={`${BAR_ROW} justify-between`}>
          <Link to="/" aria-label={t("common.goHome")} className={BRAND_LINK}>
            <BrandMark brandName={t("common.brandName")} />
          </Link>

          {/*
            h-10 rather than the desktop cluster's h-9: this is the only
            control a phone user can hit on this bar, and it is the one that
            leads into the product.
          */}
          <Link
            to="/"
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-zinc-300 bg-white/80 px-4 text-sm font-medium text-zinc-700 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:bg-zinc-900 ${FOCUS_RING_PAGE}`}
          >
            <FiLogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("auth.loginTab")}
          </Link>
        </div>
      </header>
    );
  }

  /*
   * `signOut()` rather than clearing the two stores by hand: it is also what
   * drops the cached `["preferences"]` entry, without which the next account to
   * sign in on this tab inherits this one's theme and language (see
   * `lib/session.ts`).
   */
  const logout = () => {
    setIsMobileMenuOpen(false);
    signOut();
    void navigate({ to: "/" });
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
      // The short URL. `/profile/:username` was removed and now 404s.
      to: "/$username",
      params: { username: userInfo.login },
      icon: FiUser,
      // `startsWith("/profile/")` no longer identifies a profile — since
      // `/$username` is a root-level catch-all, EVERY unmatched top-level path
      // is one, and a prefix test would light this item up on somebody else's
      // profile too. Compare against this user's own path instead. The
      // pathname the router reports is percent-encoded, so the comparison
      // encodes as well: a login with a `/` in it (they exist — see
      // docs/qa/bugs/BUG-20260823-handle-slash-breaks-profile.md) is one
      // encoded segment in the URL.
      isActive: (path) => path === `/${encodeURIComponent(userInfo.login)}`,
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
    <>
      <header className={BAR_SURFACE}>
        <div className={`${BAR_ROW} justify-between`}>
          {/*
          The brand is the way home at every width — it was not a link at all
          before, which is the one thing every product in this category gets
          right. It points at `/dashboard` rather than `/`, because `/` is
          guarded by `requireAnonymous` and would only bounce a signed-in user
          here anyway; skipping the redirect is one less frame of the sign-in
          form flashing past.

          The account NAME used to sit under the wordmark as a second line, and
          it is what made this a 68px header. It moved into the sheet, where a
          drawer's identity block belongs.
        */}
          <Link
            to="/dashboard"
            aria-label={t("common.goHome")}
            className={BRAND_LINK}
          >
            <BrandMark brandName={t("common.brandName")} />
          </Link>

          {/* Desktop navigation — icon-only, single line, titles as tooltips,
            with the two preference controls inline at the end of the same row. */}
          <div className="hidden items-center gap-2 md:flex">
            <nav aria-label={t("nav.menu")} className="flex items-center gap-1">
              {navItems.map((item) => (
                <NavTooltip key={item.key} label={item.label}>
                  <Link
                    to={item.to}
                    params={item.params}
                    aria-label={item.label}
                    aria-current={item.isActive(pathname) ? "page" : undefined}
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
            <LanguageToggle />
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>

          {/*
            Mobile hamburger — the only control in the header below `md`.

            A BARE GLYPH, not a bordered chip. It used to be `Button
            variant="icon"`, which paints a 44px white square with a zinc
            border around three lines; on a phone that square is the loudest
            thing in the bar and it is drawn around the one control that needs
            no explaining. Instagram, X and YouTube all render this as the icon
            alone, and that is what this is now: no border, no fill, no ring
            until it is focused.

            A plain `button` rather than `Button variant="ghost"`, because the
            colour here has to be exact — `text-zinc-900` / `dark:text-white`,
            the ink of the bar rather than the muted zinc a ghost button uses —
            and overriding a variant's `text-*` through `className` is decided
            by stylesheet order, not by which class is written last. Stating
            the element outright is the honest version. `LanguageToggle` next
            door is a plain `button` for the same reason.

            The 44px hit area stays; only the paint is gone. `h-6 w-6` for the
            glyph rather than the `h-5 w-5` of DESIGN.md §9's standalone icon
            buttons: those sit inside a bordered box that gives them presence,
            this one has nothing but itself, and 24px is the size Instagram
            draws. `-mr-1.5` pulls it toward the screen edge to sit optically
            in the 16px gutter — the icon's own transparent padding otherwise
            reads as 26px of margin.

            `FOCUS_RING_FIELD`, NOT `FOCUS_RING_PAGE`, and that is the point of
            the whole change rather than a detail of it. The ring itself stays
            — DESIGN.md §5 does not bargain, and closing the sheet hands focus
            straight back here, so a keyboard user must be able to see where
            they landed. What goes is the OFFSET: `ring-offset-2` paints a
            solid 2px ring in the offset colour before the violet one, and that
            filled halo is a circle around the hamburger. It was also the wrong
            colour — `FOCUS_RING_PAGE` offsets against `zinc-100`/`zinc-950`,
            the PAGE, while this control sits on the bar's `white/80`. The
            field ring is the one constant in `surface.ts` with no offset at
            all, which is exactly right for a control that has no box: the
            violet ring hugs the glyph, on keyboard focus only, and nothing is
            drawn at rest.
          */}
          <button
            type="button"
            id={menuButtonId}
            className={`-mr-1.5 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-900 transition-transform active:scale-90 motion-reduce:transition-none md:hidden dark:text-white ${FOCUS_RING_FIELD}`}
            /*
             * It stays "Open menu" while the sheet is open, and it stays a
             * hamburger. The old dropdown left this control visible and on top,
             * so flipping it to an X was the only way out; the sheet covers the
             * bar with a scrim and carries its own close button, so a second
             * control announcing itself as "Close menu" is a duplicate the user
             * cannot see and a screen-reader user has to disambiguate.
             * `aria-expanded` still says what state it is in.
             */
            aria-label={t("nav.openMenu")}
            aria-expanded={isMobileMenuOpen}
            aria-controls={menuId}
            onClick={() => setIsMobileMenuOpen((open) => !open)}
          >
            <FiMenu className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/*
        The sheet, and it is a SIBLING of the header rather than a child of it.
        That is load-bearing: `<header>` carries `backdrop-blur-md`, and a
        `backdrop-filter` makes an element the containing block for its
        `position: fixed` descendants. Nested inside, `fixed inset-0` resolved
        against the 53px bar and the panel rendered 53px tall — measured, not
        theorised.

        The entrance is a `@starting-style` transition (Tailwind's `starting:`
        variant) rather than a keyframe: `DESIGN.md` §11 requires every keyframe
        to be listed in the `prefers-reduced-motion` block in `index.css`, and a
        transition needs no keyframe at all — `motion-reduce:transition-none`
        covers the same ground at the call site. Dismissal is immediate by
        design; an exit animation would keep a focus-trapping dialog alive for
        200ms after the user asked for it to be gone.

        It blocks the page, so it commits to APG's Dialog (Modal) contract and
        not to the half-measure two of the products measured for this ship: a
        real `role="dialog"` with `aria-modal`, focus moved in on open, Tab
        wrapped inside, Escape to close, focus returned to the hamburger, the
        page behind it scroll-locked and dismissible by pressing the scrim.

        ONE PIECE OF THAT CONTRACT IS NOT HERE: the page behind is not `inert`.
        `aria-modal` scopes most screen readers to the dialog and the trap
        holds the keyboard, but a virtual cursor can still reach the page.
        Marking it inert means reaching outside this component — the routed
        page is a sibling rendered by `App` — and that is a separate change.
      */}
      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-zinc-900/50 backdrop-blur-sm transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none dark:bg-zinc-950/70"
          />

          <div
            id={menuId}
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("nav.menu")}
            className="absolute inset-y-0 right-0 flex w-80 max-w-[86vw] flex-col border-l border-zinc-200 bg-white transition-transform duration-200 ease-out starting:translate-x-full motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-900"
          >
            {/* Identity — the drawer is where a mobile user finds out which
                account they are actually in. */}
            <div className="flex items-center gap-3 border-b border-zinc-200 p-3 dark:border-zinc-800">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {userInfo.name}
                </p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {userInfo.login}
                </p>
              </div>
              <Button
                type="button"
                id={closeButtonId}
                variant="ghost"
                size="icon"
                fullWidth={false}
                className="h-11 w-11 shrink-0 rounded-full"
                aria-label={t("nav.closeMenu")}
                onClick={() => closeMenu(true)}
              >
                <FiX className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>

            {/* Scrolls on a short phone; the identity above and the exit below
                stay put. */}
            <div className="flex-1 overflow-y-auto p-3">
              <nav aria-label={t("nav.menu")}>
                <ul className="flex flex-col gap-1">
                  {navItems.map((item) => (
                    <li key={item.key}>
                      <Link
                        to={item.to}
                        params={item.params}
                        onClick={() => closeMenu(false)}
                        aria-current={
                          item.isActive(pathname) ? "page" : undefined
                        }
                        className={sheetLinkClasses(item.isActive(pathname))}
                      >
                        <item.icon
                          className="h-5 w-5 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <MenuSectionLabel>{t("common.language")}</MenuSectionLabel>
                <LanguageToggle variant="menu" />
              </div>

              <div className="mt-4">
                <MenuSectionLabel>{t("common.theme")}</MenuSectionLabel>
                <ThemeToggle
                  theme={theme}
                  onToggle={onToggleTheme}
                  variant="menu"
                />
              </div>
            </div>

            {/* Pinned to the bottom, away from the nav rows a thumb is aiming
                at. */}
            <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                fullWidth
                className="h-11 justify-start"
                onClick={logout}
              >
                <FiLogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t("nav.logout")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
