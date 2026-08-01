import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";
import App from "./App";
import { queryClient } from "./lib/query-client";
import {
  RouteErrorState,
  RouteNotFound,
  RoutePending,
} from "./shared-components/route-states";

/**
 * Every route was statically imported, so the entry bundle carried the whole
 * app: react-grid-layout + react-draggable for the layout editor, react-select,
 * the recruiter search page and the settings page all landed on `/profile/
 * $username` — the public, shareable, mobile-heavy page that needs none of it.
 * `lazyRouteComponent` splits each route into its own chunk; measured effect
 * is 996 kB / 295 kB gzip down to 336 kB / 108 kB gzip on the entry.
 *
 * `AuthPage` stays lazy too: it is behind the same one-chunk fetch as everything
 * else and the router's pending component covers the gap.
 */

const rootRoute = createRootRoute({
  component: App,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(
    () => import("./features/auth/pages/auth-page"),
    "AuthPage",
  ),
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: lazyRouteComponent(
    () => import("./features/dashboard/pages/dashboard-page"),
    "DashboardPage",
  ),
});

const publicProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/$username",
  component: lazyRouteComponent(
    () => import("./features/profile/pages/public-profile-page"),
    "PublicProfilePage",
  ),
});

const advancedSearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard/search",
  component: lazyRouteComponent(
    () => import("./features/search/pages/advanced-search-page"),
    "AdvancedSearchPage",
  ),
});

const profileLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard/layout",
  component: lazyRouteComponent(
    () => import("./features/profile-layout/pages/profile-layout-page"),
    "ProfileLayoutPage",
  ),
});

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard/posts",
  component: lazyRouteComponent(
    () => import("./features/posts/pages/posts-page"),
    "PostsPage",
  ),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard/settings",
  component: lazyRouteComponent(
    () => import("./features/settings/pages/settings-page"),
    "SettingsPage",
  ),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  publicProfileRoute,
  advancedSearchRoute,
  profileLayoutRoute,
  postsRoute,
  settingsRoute,
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
