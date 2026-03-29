import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import App from "./App";
import { AuthPage } from "./features/auth/pages/auth-page";
import { DashboardPage } from "./features/dashboard/pages/dashboard-page";
import { PublicProfilePage } from "./features/profile/pages/public-profile-page";
import { queryClient } from "./lib/query-client";

const rootRoute = createRootRoute({
  component: App,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: AuthPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPage,
});

const publicProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/$username",
  component: PublicProfilePage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  publicProfileRoute,
]);

export const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
