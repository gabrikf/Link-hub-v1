import type { CreateUserInput, LoginInput } from "@repo/schemas";
import { SURFACE } from "../../../shared-components/surface";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useGoogleLogin } from "@react-oauth/google";
import { FaLinkedinIn } from "react-icons/fa6";
import { FcGoogle } from "react-icons/fc";
import {
  getLinkedInSignInUrl,
  googleSignInRequest,
  loginRequest,
  registerRequest,
} from "../../../lib/auth-api";
import { setAuthTokens } from "../../../lib/auth-tokens";
import { reportError } from "../../../lib/report-error";
import { BrandLogo } from "../../../shared-components/brand-logo";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { AuthTabs } from "../components/auth-tabs";
import { LoginForm } from "../components/login-form";
import { RegisterForm } from "../components/register-form";
import type { AuthTab } from "../types/auth-tab";

export function AuthPage() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [activeTab, setActiveTab] = useState<AuthTab>("login");
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
      const decodedUser = JSON.parse(atob(paddedBase64));

      setAuthTokens({
        accessToken,
        refreshToken,
      });
      setUserInfo(decodedUser);
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
      navigate({ to: "/dashboard" });
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
      setAuthTokens({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      setUserInfo(response.user);
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

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <section className={`w-full max-w-md space-y-4 p-6 ${SURFACE}`}>
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <BrandLogo className="h-8 w-8 shadow-sm" />
            LinkHub
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Access your account or create a new one.
          </p>
        </header>

        <AuthTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === "login" ? (
          <LoginForm
            isPending={loginMutation.isPending}
            errorMessage={loginMutation.error?.message}
            onSubmit={onLoginSubmit}
          />
        ) : (
          <RegisterForm
            isPending={registerMutation.isPending}
            errorMessage={registerMutation.error?.message}
            onSubmit={onRegisterSubmit}
          />
        )}

        <div className="space-y-2">
          {googleClientId && (
            <>
              <p className="text-xs text-zinc-500">or continue with</p>

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
                loadingLabel="Signing in..."
                onClick={() => googleLogin()}
                className="relative flex h-10 w-full cursor-pointer items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <span className="absolute left-3 inline-flex h-5 w-5 items-center justify-center text-base">
                  <FcGoogle aria-hidden="true" />
                </span>
                Sign in with Google
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
            Sign in with LinkedIn
          </a>

          {linkedInErrorMessage && (
            <FeedbackMessage message={linkedInErrorMessage} tone="error" />
          )}
        </div>

        {userInfo && (
          <FeedbackMessage
            message={`Authenticated as ${userInfo.email}`}
            tone="success"
          />
        )}
      </section>
    </div>
  );
}
