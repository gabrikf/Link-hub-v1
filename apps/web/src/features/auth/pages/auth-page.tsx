import type { CreateUserInput, LoginInput } from "@repo/schemas";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
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

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">LinkHub</h1>
        <p className="text-sm text-zinc-600">
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
            <GoogleLogin
              onSuccess={async (credentialResponse) => {
                if (!credentialResponse.credential) {
                  return;
                }

                await googleSignInMutation.mutateAsync({
                  idToken: credentialResponse.credential,
                });
              }}
              onError={() => {
                googleSignInMutation.reset();
              }}
            />
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
          className="relative flex h-10 w-full items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          <span className="absolute left-3 inline-flex h-5 w-5 items-center justify-center rounded-sm bg-[#0A66C2] text-[10px] font-bold text-white">
            in
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
  );
}
