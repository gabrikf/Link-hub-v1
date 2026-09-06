import {
  userResponseSchema,
  type CreateUserInput,
  type LoginInput,
} from "@repo/schemas";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useGoogleLogin } from "@react-oauth/google";
import { useTranslation } from "react-i18next";
import { FaLinkedinIn } from "react-icons/fa6";
import { FcGoogle } from "react-icons/fc";
import { API_ERROR_CODE, isApiErrorCode } from "../../../lib/api-error";
import {
  getLinkedInSignInUrl,
  googleSignInRequest,
  loginRequest,
  registerRequest,
} from "../../../lib/auth-api";
import { setAuthTokens } from "../../../lib/auth-tokens";
import { reportError } from "../../../lib/report-error";
import {
  consumeSessionExpiredMessage,
  hasSessionExpiredMessage,
} from "../../../lib/session";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { SURFACE_INSET } from "../../../shared-components/surface";
import { AuthShell } from "../components/auth-shell";
import { AuthTabs } from "../components/auth-tabs";
import { CheckYourInbox } from "../components/check-your-inbox";
import { LoginForm } from "../components/login-form";
import { RegisterForm } from "../components/register-form";
import { ResendVerification } from "../components/resend-verification";
import { clearAuthNotice, peekAuthNotice } from "../lib/auth-notice";
import type { AuthTab } from "../types/auth-tab";

export function AuthPage() {
  const { t } = useTranslation();
  /*
   * `import.meta.env` is untyped, so read the value as `unknown` and narrow it
   * at runtime rather than asserting a type onto it. Vite inlines a configured
   * variable as a string literal; anything else means it is simply not set.
   */
  const rawGoogleClientId: unknown = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const googleClientId =
    typeof rawGoogleClientId === "string" ? rawGoogleClientId : undefined;
  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  /**
   * The address a signup just created, or null. Non-null replaces the whole
   * card with "check your inbox" — registering does not sign you in, so that
   * is genuinely the next screen rather than a note beside the form.
   */
  const [checkInboxEmail, setCheckInboxEmail] = useState<string | null>(null);
  /*
   * Read during the initial render, not in an effect: `peekAuthNotice` is a
   * pure read, so React re-invoking this initialiser under StrictMode cannot
   * lose the message. Clearing it — the side effect — happens below.
   */
  const [parkedNotice] = useState(peekAuthNotice);
  /*
   * Why the app bounced the user back here, when it did.
   *
   * `lib/session.ts` has parked this notice on every expiry since it was
   * written, and until now NOTHING read it: `consumeSessionExpiredMessage` had
   * no caller anywhere in the app, so the sessionStorage key was written,
   * accumulated and silently overwritten. Someone whose token expired mid-task
   * was dropped on a bare sign-in form with no explanation — the exact symptom
   * that module's header says it exists to fix.
   *
   * Peeked during render and cleared in the effect below, matching
   * `peekAuthNotice` above: reading is pure and therefore safe in an
   * initialiser React may invoke twice under StrictMode; clearing is the side
   * effect.
   */
  const [wasSessionExpired] = useState(hasSessionExpiredMessage);
  const navigate = useNavigate();
  const userInfo = useUserInfoStore((state) => state.userInfo);
  const setUserInfo = useUserInfoStore((state) => state.setUserInfo);

  const linkedInErrorMessage =
    typeof window !== "undefined"
      ? (() => {
          const searchParams = new URLSearchParams(window.location.search);
          return searchParams.get("oauthProvider") === "linkedin"
            ? searchParams.get("oauthError")
            : null;
        })()
      : null;

  // Single-shot, both of them: a later, unrelated visit to this page must not
  // resurface the "password updated" confirmation or the expiry notice.
  useEffect(() => {
    clearAuthNotice();
    consumeSessionExpiredMessage();
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const oauthProvider = searchParams.get("oauthProvider");

    if (oauthProvider !== "linkedin") {
      return;
    }

    const oauthError = searchParams.get("oauthError");

    if (oauthError) {
      return;
    }

    const accessToken = searchParams.get("accessToken");
    const refreshToken = searchParams.get("refreshToken");
    const encodedUser = searchParams.get("user");

    if (!accessToken || !refreshToken || !encodedUser) {
      return;
    }

    try {
      const normalizedBase64 = encodedUser
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const paddedBase64 = normalizedBase64.padEnd(
        Math.ceil(normalizedBase64.length / 4) * 4,
        "=",
      );
      // The callback payload is a network boundary like any other, so it goes
      // through the same contract the sign-in responses are parsed against —
      // a malformed one lands in the catch below instead of in the store.
      const decodedUser: unknown = JSON.parse(atob(paddedBase64));

      setAuthTokens({
        accessToken,
        refreshToken,
      });
      setUserInfo(userResponseSchema.parse(decodedUser));
    } catch (error) {
      // The provider callback is ours to encode — a payload we cannot decode
      // means the OAuth round-trip is broken, and the user is silently left on
      // the sign-in page.
      reportError(error, { action: "auth.oauth-callback" });
      return;
    }

    window.history.replaceState(null, "", window.location.pathname);
  }, [setUserInfo]);

  useEffect(() => {
    if (userInfo) {
      void navigate({ to: "/dashboard" });
    }
  }, [navigate, userInfo]);

  const loginMutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: (response) => {
      setAuthTokens({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      setUserInfo(response.user);
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerRequest,
    onSuccess: (response) => {
      /*
       * Registering deliberately does NOT sign you in. The account exists but
       * its address is unproved, and minting a session here would make the
       * verification step decorative — see `createUserSchemaOutput`, which no
       * longer carries tokens at all.
       */
      if (response.emailVerificationRequired) {
        setCheckInboxEmail(response.user.email);
        return;
      }

      // No verification asked for (an API configured without it): the account
      // is usable, so the useful next screen is the sign-in form.
      setActiveTab("login");
    },
  });

  const googleSignInMutation = useMutation({
    mutationFn: googleSignInRequest,
    onSuccess: (response) => {
      setAuthTokens({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      setUserInfo(response.user);
    },
  });

  const onLoginSubmit = async (data: LoginInput) => {
    await loginMutation.mutateAsync(data);
  };

  const onRegisterSubmit = async (data: CreateUserInput) => {
    await registerMutation.mutateAsync(data);
  };

  const googleLogin = useGoogleLogin({
    scope: "openid email profile",
    onSuccess: (tokenResponse) => {
      if (!tokenResponse.access_token) {
        return;
      }

      // `mutate`, not `mutateAsync`: nothing here needs the result, and the
      // library does not await this callback, so a rejected `mutateAsync` would
      // escape to the global unhandledrejection handler. The failure is already
      // rendered from `googleSignInMutation.error` below.
      googleSignInMutation.mutate({
        accessToken: tokenResponse.access_token,
      });
    },
    onError: (errorResponse) => {
      reportError(errorResponse, { action: "auth.google-popup" });
      googleSignInMutation.reset();
    },
  });

  const goToForgotPassword = () => {
    void navigate({ to: "/forgot-password" });
  };

  /*
   * The CODE, never the message. The API translates its messages (every request
   * carries `Accept-Language`), so matching on text would work in English and
   * silently stop working in pt-BR — and this branch decides whether the user
   * is told "wrong password" or "confirm your email", which are opposite
   * instructions.
   */
  const isEmailUnverified = isApiErrorCode(
    loginMutation.error,
    API_ERROR_CODE.emailNotVerified,
  );
  // What they typed in the field they just submitted — so the resend goes to
  // the address they are actually trying to use.
  const unverifiedEmail = loginMutation.variables?.email;

  if (checkInboxEmail) {
    return (
      <AuthShell>
        <CheckYourInbox
          email={checkInboxEmail}
          onBackToSignIn={() => {
            setCheckInboxEmail(null);
            setActiveTab("login");
            registerMutation.reset();
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell description={t("auth.tagline")}>
      {/*
        Matched against the literal rather than passed to `t()` as a variable:
        the i18n guardrail resolves `t("…")` call sites statically, and a key
        only ever reached through a variable reads as dead to it.
      */}
      {parkedNotice === "auth.passwordUpdated" && (
        <FeedbackMessage message={t("auth.passwordUpdated")} tone="success" />
      )}

      {/*
        Translated HERE rather than rendered from the parked string.
        `handleSessionExpired` stores the sentence already resolved through
        `i18n.t`, which freezes it in whatever language was active when the
        token died — wrong for anyone who switches language on the sign-in page.
        The stored value is used only as the flag that an expiry happened; the
        words come from the catalogue at render time, the same way
        `auth-notice.ts` reasons about parking a KEY instead of a sentence.
      */}
      {wasSessionExpired && (
        <FeedbackMessage message={t("errors.sessionExpired")} tone="error" />
      )}

      <AuthTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "login" ? (
        <LoginForm
          isPending={loginMutation.isPending}
          errorMessage={
            isEmailUnverified ? undefined : loginMutation.error?.message
          }
          onForgotPassword={goToForgotPassword}
          onSubmit={onLoginSubmit}
        />
      ) : (
        <RegisterForm
          isPending={registerMutation.isPending}
          errorMessage={registerMutation.error?.message}
          onForgotPassword={goToForgotPassword}
          onSubmit={onRegisterSubmit}
        />
      )}

      {/*
        A 403 with the correct password is not a failed sign-in, it is an
        unfinished signup — so it gets an explanation and the action that
        resolves it rather than a red error line the user can do nothing about.
      */}
      {activeTab === "login" && isEmailUnverified && unverifiedEmail && (
        <div className={`${SURFACE_INSET} space-y-3 p-4`}>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t("auth.emailNotVerifiedTitle")}
            </h2>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {t("auth.emailNotVerifiedDescription", {
                email: unverifiedEmail,
              })}
            </p>
          </div>

          {/* Remounted per address: the form seeds itself from this default. */}
          <ResendVerification key={unverifiedEmail} email={unverifiedEmail} />
        </div>
      )}

      <div className="space-y-2">
        {googleClientId && (
          <>
            <p className="text-xs text-zinc-500">{t("auth.orContinueWith")}</p>

            {/*
              Matches the LoginForm/RegisterForm treatment: spinner + a
              present-tense label while the exchange is in flight. `isLoading`
              also disables the button, so a slow round-trip can't be
              double-submitted by re-opening the Google popup.
            */}
            <Button
              type="button"
              variant="outline"
              fullWidth
              isLoading={googleSignInMutation.isPending}
              loadingLabel={t("auth.signingIn")}
              onClick={() => googleLogin()}
              className="relative flex h-10 w-full cursor-pointer items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <span className="absolute left-3 inline-flex h-5 w-5 items-center justify-center text-base">
                <FcGoogle aria-hidden="true" />
              </span>
              {t("auth.signInWithGoogle")}
            </Button>

            {googleSignInMutation.error?.message && (
              <FeedbackMessage
                message={googleSignInMutation.error.message}
                tone="error"
              />
            )}
          </>
        )}

        <a
          href={getLinkedInSignInUrl()}
          className="relative flex h-10 w-full items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <span className="absolute left-3 inline-flex h-5 w-5 items-center justify-center text-base text-[#0A66C2]">
            <FaLinkedinIn aria-hidden="true" />
          </span>
          {t("auth.signInWithLinkedIn")}
        </a>

        {linkedInErrorMessage && (
          <FeedbackMessage message={linkedInErrorMessage} tone="error" />
        )}
      </div>

      {userInfo && (
        <FeedbackMessage
          message={t("auth.authenticatedAs", { email: userInfo.email })}
          tone="success"
        />
      )}
    </AuthShell>
  );
}
