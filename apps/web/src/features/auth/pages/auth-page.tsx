import type { CreateUserInput, LoginInput } from "@repo/schemas";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useGoogleLogin } from "@react-oauth/google";
import { FaLinkedinIn } from "react-icons/fa6";
import { FcGoogle } from "react-icons/fc";
import { FiLink2 } from "react-icons/fi";
import {
  getLinkedInSignInUrl,
  googleSignInRequest,
  loginRequest,
  registerRequest,
} from "../../../lib/auth-api";
import { setAuthTokens } from "../../../lib/auth-tokens";
import { useUserInfoStore } from "../../../lib/user-info-store";
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
    } catch {
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
    onSuccess: async (tokenResponse) => {
      if (!tokenResponse.access_token) {
        return;
      }

      await googleSignInMutation.mutateAsync({
        accessToken: tokenResponse.access_token,
      });
    },
    onError: () => {
      googleSignInMutation.reset();
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-teal-500 text-white shadow-sm">
              <FiLink2 aria-hidden="true" className="h-4 w-4" />
            </span>
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

              <button
                type="button"
                onClick={() => googleLogin()}
                className="relative flex h-10 w-full cursor-pointer items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <span className="absolute left-3 inline-flex h-5 w-5 items-center justify-center text-base">
                  <FcGoogle aria-hidden="true" />
                </span>
                Sign in with Google
              </button>

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
