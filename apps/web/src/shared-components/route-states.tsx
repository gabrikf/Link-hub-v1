import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiCompass, FiRefreshCw } from "react-icons/fi";
import { reportError } from "../lib/report-error";
import { BrandLogo } from "./brand-logo";
import { Button } from "./button";
import { FOCUS_RING_PAGE, SURFACE } from "./surface";

/**
 * Branded route-level states.
 *
 * The router previously shipped no `defaultErrorComponent` and no
 * `defaultNotFoundComponent`, so any render throw or typo'd URL dropped the
 * user on TanStack's raw developer default. `defaultErrorComponent` also
 * installs the only React error boundary in the tree.
 */

function RouteShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16">
      <div className={`${SURFACE} anim-fade-up w-full p-8 text-center`}>
        {children}
      </div>
    </main>
  );
}

export function RouteErrorState({ error }: Readonly<{ error?: Error }>) {
  const { t } = useTranslation();
  // Message only in dev — a stack trace or an internal path means nothing to a
  // user and can leak API shape.
  const detail = import.meta.env.DEV ? error?.message : undefined;

  // This is the router's `defaultErrorComponent`, so it is the last place a
  // render throw is observable. Keyed on the error itself so a re-render (theme
  // toggle, resize) does not re-send the same failure.
  useEffect(() => {
    if (error) {
      reportError(error, { action: "route.error" });
    }
  }, [error]);

  return (
    <RouteShell>
      <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200">
        <FiAlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1
        role="alert"
        className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
      >
        {t("common.somethingWentWrong")}
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        {t("errors.pageFailedToLoad")}
      </p>
      {detail ? (
        <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-100 p-3 text-left text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {detail}
        </pre>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          fullWidth={false}
          onClick={() => window.location.reload()}
        >
          <FiRefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("common.reloadPage")}
        </Button>
        <Link
          to="/"
          className={`inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 ${FOCUS_RING_PAGE}`}
        >
          {t("common.goHome")}
        </Link>
      </div>
    </RouteShell>
  );
}

export function RouteNotFound() {
  const { t } = useTranslation();
  return (
    <RouteShell>
      <BrandLogo className="mx-auto mb-4 h-12 w-12 shadow-sm" />
      <p className="text-sm font-semibold tracking-widest text-violet-700 dark:text-violet-300">
        {t("notFound.code")}
      </p>
      <h1 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {t("notFound.title")}
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        {t("notFound.description")}
      </p>
      <div className="mt-6 flex justify-center">
        <Link
          to="/"
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-md bg-violet-700 px-4 text-sm text-white transition hover:bg-violet-800 dark:bg-violet-600 dark:hover:bg-violet-500 ${FOCUS_RING_PAGE}`}
        >
          <FiCompass className="h-4 w-4" aria-hidden="true" />
          {t("notFound.backToCraftHub")}
        </Link>
      </div>
    </RouteShell>
  );
}

/**
 * Shown while a lazily-loaded route chunk is in flight. Deliberately minimal —
 * routes render their own content skeletons once mounted; this only covers the
 * network fetch of the chunk itself.
 *
 * `labelKey` exists so the boot gate can say what it is actually waiting for
 * without forking the skeleton. The router passes no props at all.
 */
export function RoutePending({
  labelKey = "notFound.loadingPage",
}: Readonly<{
  labelKey?: "notFound.loadingPage" | "common.loadingApp";
}>) {
  const { t } = useTranslation();
  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{t(labelKey)}</span>
      <div className="anim-sheen h-8 w-48 rounded-full bg-zinc-200/80 dark:bg-zinc-800" />
      <div className="anim-sheen h-56 w-full rounded-2xl bg-zinc-200/80 dark:bg-zinc-800" />
    </div>
  );
}

/**
 * The whole-app loading state: what is on screen while `lib/app-boot.ts`
 * resolves the session and the stored preferences, before the router mounts.
 *
 * It has to carry the page background itself, because `App` — which normally
 * paints it — is the root ROUTE component and has not rendered yet. Same
 * classes as `App`'s shell on purpose: the gate must look like the app warming
 * up, not like a different page that flashes past.
 */
export function BootPending() {
  return (
    <div className="relative min-h-screen bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <RoutePending labelKey="common.loadingApp" />
    </div>
  );
}
