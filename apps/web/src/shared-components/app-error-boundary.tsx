import { Component, type ErrorInfo, type ReactNode } from "react";
import { FiAlertTriangle, FiRefreshCw } from "react-icons/fi";
import i18n from "../i18n";
import { reportError } from "../lib/report-error";
import { FOCUS_RING_PAGE, SURFACE } from "./surface";

/**
 * Top-of-tree error boundary.
 *
 * The router's `defaultErrorComponent` (`RouteErrorState`) only catches throws
 * from *inside* a matched route's render. A throw in the router itself, in a
 * provider, or in anything mounted above the outlet had nowhere to land and
 * took the whole page to a blank screen. This wraps the lot.
 *
 * THE FALLBACK MUST NOT TOUCH THE ROUTER. It is tempting to reuse
 * `RouteErrorState` so both failure paths look identical, and that is exactly
 * the bug: this boundary sits ABOVE `RouterProvider`, so when it catches a
 * throw from the router or a provider it renders its fallback with no router
 * context. `RouteErrorState` renders `<Link>`, which calls `useRouter()` — that
 * throws, with no boundary above to catch it, and React unmounts the whole
 * root. The blank screen this component exists to prevent.
 *
 * Hence the duplicated markup below and the plain `<a href="/">`: a full page
 * load is the correct recovery here anyway, since the router is the thing that
 * may be broken. Only the visual tokens are shared.
 */

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportError(error, {
      action: "react.render",
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  render(): ReactNode {
    // Fragment, not a bare `this.props.children`: both branches then hand back a
    // single element, which is what `sonarjs/function-return-type` asks for. A
    // fragment adds no DOM node, so the rendered output is unchanged.
    if (!this.state.error) {
      return <>{this.props.children}</>;
    }

    // Message only in dev — a stack trace means nothing to a user and can leak
    // API shape. Same rule as `RouteErrorState`.
    const detail = import.meta.env.DEV ? this.state.error.message : undefined;

    return (
      <main className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16">
        <div className={`${SURFACE} anim-fade-up w-full p-8 text-center`}>
          <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200">
            <FiAlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1
            role="alert"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
          >
            {i18n.t("common.somethingWentWrong")}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            {i18n.t("errors.appFailedToStart")}
          </p>
          {detail ? (
            <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-100 p-3 text-left text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {detail}
            </pre>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-md bg-violet-700 px-4 text-sm text-white transition hover:bg-violet-800 dark:bg-violet-600 dark:hover:bg-violet-500 ${FOCUS_RING_PAGE}`}
            >
              <FiRefreshCw className="h-4 w-4" aria-hidden="true" />
              {i18n.t("common.reloadPage")}
            </button>
            {/* Plain anchor, not <Link>: see the note above. */}
            <a
              href="/"
              className={`inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 ${FOCUS_RING_PAGE}`}
            >
              {i18n.t("common.goHome")}
            </a>
          </div>
        </div>
      </main>
    );
  }
}
