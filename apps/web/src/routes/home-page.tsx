import { zodResolver } from "@hookform/resolvers/zod";
import type { CreateUserInput, LoginInput, LoginOutput } from "@repo/schemas";
import { createUserSchemaInput, loginSchemaInput } from "@repo/schemas";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { loginRequest, registerRequest } from "../lib/auth-api";
import { setAuthTokens } from "../lib/auth-tokens";

type AuthTab = "login" | "register";

export function HomePage() {
  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [sessionUser, setSessionUser] = useState<LoginOutput["user"] | null>(
    null,
  );

  const {
    register: registerLogin,
    handleSubmit: handleSubmitLogin,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchemaInput),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: (response) => {
      setAuthTokens({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      setSessionUser(response.user);
    },
  });

  const {
    register: registerSignup,
    handleSubmit: handleSubmitSignup,
    formState: { errors: signupErrors },
    reset: resetSignup,
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchemaInput),
    defaultValues: {
      email: "",
      login: "",
      name: "",
      password: "",
      description: "",
      avatarUrl: "",
    },
  });

  const registerMutation = useMutation({
    mutationFn: registerRequest,
    onSuccess: (response) => {
      setAuthTokens({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      setSessionUser(response.user);
      resetSignup();
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

      <div className="grid grid-cols-2 rounded-lg border border-zinc-200 p-1 text-sm">
        <button
          type="button"
          onClick={() => setActiveTab("login")}
          className={`rounded-md px-3 py-2 ${
            activeTab === "login" ? "bg-zinc-900 text-white" : "text-zinc-600"
          }`}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("register")}
          className={`rounded-md px-3 py-2 ${
            activeTab === "register"
              ? "bg-zinc-900 text-white"
              : "text-zinc-600"
          }`}
        >
          Register
        </button>
      </div>

      {activeTab === "login" ? (
        <form className="space-y-3" onSubmit={handleSubmitLogin(onLoginSubmit)}>
          <div>
            <label
              className="mb-1 block text-sm text-zinc-700"
              htmlFor="login-email"
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              {...registerLogin("email")}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label
              className="mb-1 block text-sm text-zinc-700"
              htmlFor="login-password"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              {...registerLogin("password")}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">
                {errors.password.message}
              </p>
            )}
          </div>

          {loginMutation.error && (
            <p className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              {loginMutation.error.message}
            </p>
          )}

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="w-full rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
          >
            {loginMutation.isPending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={handleSubmitSignup(onRegisterSubmit)}
        >
          <div>
            <label
              className="mb-1 block text-sm text-zinc-700"
              htmlFor="register-name"
            >
              Name
            </label>
            <input
              id="register-name"
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              {...registerSignup("name")}
            />
            {signupErrors.name && (
              <p className="mt-1 text-sm text-red-600">
                {signupErrors.name.message}
              </p>
            )}
          </div>

          <div>
            <label
              className="mb-1 block text-sm text-zinc-700"
              htmlFor="register-login"
            >
              Login
            </label>
            <input
              id="register-login"
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              {...registerSignup("login")}
            />
            {signupErrors.login && (
              <p className="mt-1 text-sm text-red-600">
                {signupErrors.login.message}
              </p>
            )}
          </div>

          <div>
            <label
              className="mb-1 block text-sm text-zinc-700"
              htmlFor="register-email"
            >
              Email
            </label>
            <input
              id="register-email"
              type="email"
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              {...registerSignup("email")}
            />
            {signupErrors.email && (
              <p className="mt-1 text-sm text-red-600">
                {signupErrors.email.message}
              </p>
            )}
          </div>

          <div>
            <label
              className="mb-1 block text-sm text-zinc-700"
              htmlFor="register-password"
            >
              Password
            </label>
            <input
              id="register-password"
              type="password"
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              {...registerSignup("password")}
            />
            {signupErrors.password && (
              <p className="mt-1 text-sm text-red-600">
                {signupErrors.password.message}
              </p>
            )}
          </div>

          <div>
            <label
              className="mb-1 block text-sm text-zinc-700"
              htmlFor="register-description"
            >
              Description (optional)
            </label>
            <textarea
              id="register-description"
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              rows={2}
              {...registerSignup("description", {
                setValueAs: (value: string) => {
                  const normalized = value.trim();
                  return normalized.length > 0 ? normalized : undefined;
                },
              })}
            />
          </div>

          <div>
            <label
              className="mb-1 block text-sm text-zinc-700"
              htmlFor="register-avatar-url"
            >
              Avatar URL (optional)
            </label>
            <input
              id="register-avatar-url"
              type="url"
              className="w-full rounded-md border border-zinc-300 px-3 py-2"
              {...registerSignup("avatarUrl", {
                setValueAs: (value: string) => {
                  const normalized = value.trim();
                  return normalized.length > 0 ? normalized : undefined;
                },
              })}
            />
            {signupErrors.avatarUrl && (
              <p className="mt-1 text-sm text-red-600">
                {signupErrors.avatarUrl.message}
              </p>
            )}
          </div>

          {registerMutation.error && (
            <p className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              {registerMutation.error.message}
            </p>
          )}

          <button
            type="submit"
            disabled={registerMutation.isPending}
            className="w-full rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
          >
            {registerMutation.isPending
              ? "Creating account..."
              : "Create account"}
          </button>
        </form>
      )}

      {sessionUser && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">
          Authenticated as {sessionUser.email}
        </p>
      )}
    </section>
  );
}
