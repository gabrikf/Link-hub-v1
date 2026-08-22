import * as Sentry from "@sentry/react";
import { useUserInfoStore } from "./user-info-store";

/**
 * The single front-end error sink. Every `catch` block in `apps/web` routes
 * through one of the two functions below instead of swallowing the error.
 *
 * TWO LEVELS, ON PURPOSE. A large share of this app's catch blocks are not
 * failures at all — localStorage throwing in private mode, the clipboard API
 * being unavailable outside a secure context, Web Share rejecting with
 * AbortError because the user closed the sheet, a URL-parse probe that is
 * *expected* to fail for bare domains. Sending those to Sentry would bury real
 * bugs and burn the free-tier event quota within a day.
 *
 *   reportError(...)    a genuine failure — sends an event to Sentry
 *   reportHandled(...)  expected/degraded path — breadcrumb only, no event
 *
 * Every call site therefore states which kind it is, and that choice is
 * reviewable in the diff.
 *
 * WITHOUT A DSN nothing is sent anywhere: in development both functions log to
 * the console, in production both are silent. No variable is required to run.
 */

export type ReportContext = {
  /** What the user was trying to do, e.g. "settings.create-token". */
  action: string;
  /** Anything else worth having in the report. Keep it free of secrets. */
  extra?: Record<string, unknown>;
};

let enabled = false;

function isEnabled(): boolean {
  return enabled;
}

/**
 * Identity is read straight from the Zustand store rather than a React hook so
 * this works inside plain functions, axios interceptors and web workers —
 * `lib/session.ts` reads it the same way.
 */
function currentUser(): { id: string; username: string } | null {
  try {
    const userInfo = useUserInfoStore.getState().userInfo;
    return userInfo ? { id: userInfo.id, username: userInfo.login } : null;
  } catch {
    return null;
  }
}

function currentRoute(): string {
  try {
    return window.location.pathname;
  } catch {
    return "unknown";
  }
}

/**
 * `JSON.stringify` is guarded because it THROWS on a circular structure, and a
 * DOM node or a React synthetic event is circular. `reportError` is typically
 * the first statement in a catch block, so a throw here would skip the
 * `setError(...)` that follows it and the user would get a silently dead
 * button — reporting a problem must never create a worse one.
 */
function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(Object.prototype.toString.call(error));
  }
}

export function initErrorReporting(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn || enabled) {
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    // Errors only. Performance tracing on a free tier gets sampled into
    // uselessness and the API side is already traced by OpenTelemetry.
    tracesSampleRate: 0,
    // Never ship the user's resume text, recruiter queries or auth tokens.
    sendDefaultPii: false,
  });

  enabled = true;
}

/**
 * Report a genuine failure. Sends an event when a DSN is configured.
 */
export function reportError(error: unknown, context: ReportContext): void {
  if (import.meta.env.DEV) {
    console.error(`[${context.action}]`, error, context.extra ?? "");
  }

  if (!isEnabled()) {
    return;
  }

  const user = currentUser();

  Sentry.withScope((scope) => {
    scope.setTag("action", context.action);
    scope.setContext("linkhub", {
      route: currentRoute(),
      ...(context.extra ?? {}),
    });

    if (user) {
      // id + username only. Email is PII we have no reason to duplicate here.
      scope.setUser({ id: user.id, username: user.username });
    }

    Sentry.captureException(toError(error));
  });
}

/**
 * Record an expected, already-handled failure. Leaves a breadcrumb so it shows
 * up in the timeline of a *later* real error, but never raises an event of its
 * own.
 */
export function reportHandled(error: unknown, context: ReportContext): void {
  if (import.meta.env.DEV) {
    console.debug(`[${context.action}] handled`, error, context.extra ?? "");
  }

  if (!isEnabled()) {
    return;
  }

  Sentry.addBreadcrumb({
    category: "handled",
    level: "info",
    message: context.action,
    data: {
      route: currentRoute(),
      reason: error instanceof Error ? error.message : String(error),
      ...(context.extra ?? {}),
    },
  });
}
