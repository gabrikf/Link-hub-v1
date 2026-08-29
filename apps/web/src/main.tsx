import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";
// Side-effect import: initialises i18next and sets <html lang> before render.
import "./i18n";
import { queryClient } from "./lib/query-client";
import { router } from "./router";
import { initializeTheme } from "./lib/theme";
import { initErrorReporting } from "./lib/report-error";
import { startBoot } from "./lib/app-boot";
import { AppErrorBoundary } from "./shared-components/app-error-boundary";
import { BootGate } from "./shared-components/boot-gate";
import { BootPending } from "./shared-components/route-states";

// Reporting first, so a throw inside theme initialisation is already covered.
initErrorReporting();
initializeTheme();

/*
 * Started at module scope, not from an effect: the session and preferences
 * requests are in flight while React is still building its first tree, so the
 * gate below usually resolves as fast as the network allows rather than as fast
 * as the network allows PLUS a mount.
 *
 * The local `initializeTheme()` above still runs first and is still what a
 * returning visitor sees immediately — the gate is what makes the FIRST load on
 * a new device correct, not what makes every load wait to be painted.
 */
const boot = startBoot(queryClient);

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

/*
 * The router mounts INSIDE the gate on purpose. `router.tsx`'s `beforeLoad`
 * guards read the session synchronously, so they have to run after boot has
 * settled it — otherwise the first navigation of a page load would guess, which
 * is the whole bug. Nothing paints, and no route chunk is even requested, until
 * `BootGate` stops suspending.
 */
const app = (
  <QueryClientProvider client={queryClient}>
    <Suspense fallback={<BootPending />}>
      <BootGate boot={boot}>
        <RouterProvider router={router} />
      </BootGate>
    </Suspense>
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
