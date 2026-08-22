import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";
import { queryClient } from "./lib/query-client";
import { router } from "./router";
import { initializeTheme } from "./lib/theme";
import { initErrorReporting } from "./lib/report-error";
import { AppErrorBoundary } from "./shared-components/app-error-boundary";

// Reporting first, so a throw inside theme initialisation is already covered.
initErrorReporting();
initializeTheme();

/**
 * Devtools are created ONLY under `import.meta.env.DEV`, and the ternary is
 * what makes that real rather than cosmetic.
 *
 * Two earlier shapes both failed: a static import plus a DEV-gated JSX branch
 * kept the packages as hard dependencies of the production chunk, and a
 * top-level `lazy(() => import(...))` kept the dynamic import alive even though
 * nothing rendered it. Putting the `lazy()` call itself inside a condition Vite
 * constant-folds to `false` lets Rollup drop the arrow function, the import and
 * the chunk together.
 */
const Devtools = import.meta.env.DEV
  ? lazy(() => import("./shared-components/devtools"))
  : null;

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const app = (
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
    {Devtools ? (
      <Suspense fallback={null}>
        <Devtools router={router} />
      </Suspense>
    ) : null}
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      {googleClientId ? (
        <GoogleOAuthProvider clientId={googleClientId}>
          {app}
        </GoogleOAuthProvider>
      ) : (
        app
      )}
    </AppErrorBoundary>
  </StrictMode>,
);
