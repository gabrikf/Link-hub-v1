import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { isReservedUsername } from "@repo/schemas";
import App from "./App";
import { queryClient } from "./lib/query-client";
import { hasStoredSession } from "./lib/session";
import {
  RouteErrorState,
  RouteNotFound,
  RoutePending,
} from "./shared-components/route-states";

/**
 * Every route was statically imported, so the entry bundle carried the whole
 * app: react-grid-layout + react-draggable for the layout editor, react-select,
 * the recruiter search page and the settings page all landed on `/$username`
 * — the public, shareable, mobile-heavy page that needs none of it.
 * `lazyRouteComponent` splits each route into its own chunk; measured effect
 * is 996 kB / 295 kB gzip down to 336 kB / 108 kB gzip on the entry.
 *
 * `AuthPage` stays lazy too: it is behind the same one-chunk fetch as everything
 * else and the router's pending component covers the gap.
 */

/**
 * The guards, and why they live here rather than in the pages.
 *
 * Every one of these used to be a `useEffect` inside the lazily-loaded page it
 * protected, which meant the browser fetched the chunk, mounted the component,
 * PAINTED it, and only then decided the viewer was not allowed to see it. A
 * signed-out person hitting `/dashboard` saw the dashboard first; a signed-in
 * person hard-loading `/` saw the login form first. `beforeLoad` runs before the
 * chunk is even requested, so the wrong screen never exists.
 *
 * The synchronous read is safe because `lib/app-boot.ts` has already settled the
 * session by the time `RouterProvider` mounts — see the comment in `main.tsx`.
 */
const requireSession = () => {
  if (!hasStoredSession()) {
    throw redirect({ to: "/" });
  }
};

/**
 * The mirror image, on `/`. Without it a signed-in user who opens the app cold
 * lands on the sign-in form and is bounced a frame later.
 *
 * `features/auth/pages/auth-page.tsx` still carries its own post-login
 * `userInfo -> /dashboard` effect. It is owned by another workstream and left
 * alone deliberately; it is now redundant for the LOAD case, though it still
 * covers the in-page transition right after a successful sign-in, where no
 * navigation this guard can see has happened yet.
 */
const requireAnonymous = () => {
  if (hasStoredSession()) {
    throw redirect({ to: "/dashboard" });
  }
};

const rootRoute = createRootRoute({
  component: App,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: requireAnonymous,
  component: lazyRouteComponent(
    () => import("./features/auth/pages/auth-page"),
    "AuthPage",
  ),
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  beforeLoad: requireSession,
  component: lazyRouteComponent(
    () => import("./features/dashboard/pages/dashboard-page"),
    "DashboardPage",
  ),
});

/**
 * The email-link routes: `/verify-email`, `/reset-password`, and the screen
 * that asks for a new link.
 *
 * NO GUARD, and that is a decision rather than an omission.
 *
 * `requireAnonymous` would be actively wrong here. It bounces anyone with a
 * stored session to `/dashboard`, and both of these are reached by clicking a
 * link in an email — from a browser that may well already hold a session for a
 * DIFFERENT account, or a stale one this device never cleared. Bouncing would
 * make a valid verification link do nothing at all and leave the account
 * unverified forever, with no way for the person to tell why.
 *
 * `requireSession` would be wronger still: proving an address and choosing a
 * new password are exactly what somebody who cannot sign in has to be able to
 * do. Both pages are safe to open with no session — neither reads anything
 * account-scoped, and the only credential either handles is the single-use
 * token in the URL, which it strips on mount.
 */
const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/verify-email",
  component: lazyRouteComponent(
    () => import("./features/auth/pages/verify-email-page"),
    "VerifyEmailPage",
  ),
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forgot-password",
  component: lazyRouteComponent(
    () => import("./features/auth/pages/forgot-password-page"),
    "ForgotPasswordPage",
  ),
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  component: lazyRouteComponent(
    () => import("./features/auth/pages/reset-password-page"),
    "ResetPasswordPage",
  ),
});

/**
 * Deliberately ungated, and deliberately the only one. A public profile is the
 * shareable artefact of this product: it must render for a stranger with no
 * session, and boot must make no authenticated request on the way to it.
 *
 * `/$username`, NOT `/profile/$username`. The old path is gone and now 404s —
 * a deliberate decision, taken knowing that every already-shared and
 * search-indexed `/profile/*` link breaks on deploy. What it buys is the short
 * URL: `crafthub.dev/gabrielkochf` is the thing people paste into a chat.
 *
 * This is a CATCH-ALL at the root, so it changes what an unknown top-level path
 * means. Ranking still puts every static route first — TanStack Router scores a
 * static segment above a dynamic one, so `/dashboard` and `/verify-email` are
 * never swallowed — but a typo like `/dashbord` no longer reaches
 * `RouteNotFound`. It is now a username lookup that finds nobody, and the
 * profile's own not-found state is what the visitor sees. That is the right
 * answer: after this change there is no such thing as "an unknown app path" at
 * the top level. The top level IS the username namespace, and "no such profile"
 * is a truthful description of `/dashbord`.
 *
 * The `beforeLoad` is the one exception, and it is what keeps a real 404
 * reachable. A reserved word can never belong to anybody — nobody can register
 * `login` — so resolving `/login` by asking the API about a user called "login"
 * would be a request we already know the answer to, answered with the wrong
 * screen. `notFound()` renders the router's `defaultNotFoundComponent` instead,
 * before the profile chunk is even fetched.
 */
const publicProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$username",
  beforeLoad: ({ params }) => {
    if (isReservedUsername(params.username)) {
      throw notFound();
    }
  },
  component: lazyRouteComponent(
    () => import("./features/profile/pages/public-profile-page"),
    "PublicProfilePage",
  ),
});

const advancedSearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard/search",
  beforeLoad: requireSession,
  component: lazyRouteComponent(
    () => import("./features/search/pages/advanced-search-page"),
    "AdvancedSearchPage",
  ),
});

const profileLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard/layout",
  beforeLoad: requireSession,
  component: lazyRouteComponent(
    () => import("./features/profile-layout/pages/profile-layout-page"),
    "ProfileLayoutPage",
  ),
});

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard/posts",
  beforeLoad: requireSession,
  component: lazyRouteComponent(
    () => import("./features/posts/pages/posts-page"),
    "PostsPage",
  ),
});

/**
 * Nested under `/dashboard/posts` on purpose: the top bar's Posts item matches
 * with `startsWith("/dashboard/posts")`, so the queue reads as part of Posts
 * without adding a seventh nav icon.
 */
const postsReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard/posts/review",
  beforeLoad: requireSession,
  component: lazyRouteComponent(
    () => import("./features/posts/pages/review-queue-page"),
    "ReviewQueuePage",
  ),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard/settings",
  beforeLoad: requireSession,
  component: lazyRouteComponent(
    () => import("./features/settings/pages/settings-page"),
    "SettingsPage",
  ),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  verifyEmailRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  advancedSearchRoute,
  profileLayoutRoute,
  postsRoute,
  postsReviewRoute,
  settingsRoute,
  // Last, because it matches anything one segment long. Ranking does not
  // depend on this order — the router scores static segments above dynamic
  // ones regardless — but reading the list top to bottom should not suggest
  // otherwise.
  publicProfileRoute,
]);

export const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  // `intent` preloading means a hover over a nav icon fetches that route's
  // chunk before the click, so splitting costs nothing perceptible.
  defaultPreload: "intent",
  defaultPendingComponent: RoutePending,
  defaultErrorComponent: RouteErrorState,
  defaultNotFoundComponent: RouteNotFound,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
