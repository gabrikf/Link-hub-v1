import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiArrowLeft, FiCheckCircle } from "react-icons/fi";
import { API_ERROR_CODE, isApiErrorCode } from "../../../lib/api-error";
import { verifyEmailRequest } from "../../../lib/auth-api";
import { setAuthTokens } from "../../../lib/auth-tokens";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Button } from "../../../shared-components/button";
import { SURFACE_INSET } from "../../../shared-components/surface";
import { AuthShell } from "../components/auth-shell";
import { ResendVerification } from "../components/resend-verification";

/**
 * The token, read once from the address bar.
 *
 * Trimmed and normalised to `""` for absent-or-blank alike: a link that was
 * wrapped by a mail client and arrived as `?token=` is the same dead end as one
 * with no `token` at all, and both need the same screen.
 */
const readTokenFromLocation = (): string => {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
};

/**
 * `/verify-email?token=…` — the link from the signup email.
 *
 * Verifying MINTS A SESSION (see `verifyEmailSchemaOutput`), so a success here
 * is a sign-in: the tokens are stored exactly as after a password login and the
 * user is routed to the dashboard.
 *
 * THE TOKEN NEVER STAYS IN THE URL. It is a bearer credential for one account;
 * left in the address bar it reaches the browser history, any screenshot of the
 * window, and — before `index.html`'s `referrer` meta — every third party the
 * page happens to talk to. It is captured into state on the first render and
 * stripped on mount, the same idiom `auth-page.tsx` uses for the LinkedIn
 * callback. It is never rendered.
 */
export function VerifyEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setUserInfo = useUserInfoStore((state) => state.setUserInfo);
  // Captured during the first render, before the effect below wipes the query
  // string. The initialiser is a pure read, so StrictMode re-invoking it is
  // harmless.
  const [token] = useState(readTokenFromLocation);

  /*
   * A QUERY, not a mutation, even though this is a POST that consumes the token.
   *
   * The request has to fire on arrival — there is no button to press — and
   * firing a mutation from an effect does not survive this app: under
   * `StrictMode` (see `main.tsx`) the mount effect runs, is cleaned up and runs
   * again, and the observer that reaches the committed tree never sees the
   * result. The screen sat on "Confirming your email address…" forever with the
   * answer already in hand; the visual scenario is what caught it.
   *
   * A query is the tool built for "fetch this on arrival": React Query
   * deduplicates by key, so the double mount issues exactly ONE request and both
   * mounts read the same answer. That matters more here than anywhere, because
   * the token is single-use — a second request would consume nothing and report
   * a perfectly good link as expired.
   *
   * Every refetch trigger is off for the same reason: this answer must never be
   * asked for twice.
   */
  const {
    data,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["verify-email", token],
    queryFn: () => verifyEmailRequest({ token }),
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  /*
   * Verifying MINTS A SESSION, so a success here is a sign-in. Stored from an
   * effect rather than a query callback — v5 removed `onSuccess` from queries
   * precisely because it fired inconsistently across cache hits. Both writes are
   * idempotent, so StrictMode running this twice changes nothing.
   */
  useEffect(() => {
    if (!data) {
      return;
    }

    setAuthTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    setUserInfo(data.user);
    navigate({ to: "/dashboard" });
  }, [data, navigate, setUserInfo]);

  const goToSignIn = () => navigate({ to: "/" });

  /* ── Missing or blank token ─────────────────────────────────────────── */
  if (!token) {
    return (
      <AuthShell>
        <VerifyEmailFailure
          message={t("auth.verificationLinkMissing")}
          onBackToSignIn={goToSignIn}
        />
      </AuthShell>
    );
  }

  /* ── Loading ────────────────────────────────────────────────────────── */
  if (isPending) {
    return (
      <AuthShell>
        <div
          className="space-y-4 py-4 text-center"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("auth.verifyingEmail")}
          </p>
          <div className="anim-sheen mx-auto h-10 w-full rounded-md bg-zinc-200/80 dark:bg-zinc-800" />
        </div>
      </AuthShell>
    );
  }

  /* ── Success — the session is stored by the effect; the route follows ─ */
  if (data) {
    return (
      <AuthShell>
        <div className="space-y-3 py-4 text-center" role="status">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
            <FiCheckCircle className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {t("auth.emailVerified")}
          </p>
        </div>
      </AuthShell>
    );
  }

  /* ── Expired, already used, or unknown — all one message, on purpose ── */
  return (
    <AuthShell>
      <VerifyEmailFailure
        message={
          isError && !isApiErrorCode(error, API_ERROR_CODE.invalidVerificationToken)
            ? error.message
            : t("auth.verificationLinkInvalid")
        }
        onBackToSignIn={goToSignIn}
      />
    </AuthShell>
  );
}

function VerifyEmailFailure({
  message,
  onBackToSignIn,
}: {
  message: string;
  onBackToSignIn: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
          <FiAlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        {/*
          The heading is the ACTION, not the diagnosis. "Check your inbox" over
          a dead link is advice for a message that is not coming; what this
          person has to do is ask for another one.
        */}
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {t("auth.requestNewLink")}
        </h2>
      </div>

      <p
        role="alert"
        className={`${SURFACE_INSET} block p-4 text-sm text-zinc-700 dark:text-zinc-300`}
      >
        {message}
      </p>

      {/*
        No `email` prop, in both failure states: a dead or absent token tells us
        nothing about whose address it was, so the form has to ask.
      */}
      <ResendVerification />

      <Button type="button" variant="ghost" onClick={onBackToSignIn}>
        <FiArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("auth.backToLogin")}
      </Button>
    </div>
  );
}
