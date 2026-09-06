import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchemaInput } from "@repo/schemas";
import type { LoginInput } from "@repo/schemas";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiLoader, FiLogIn } from "react-icons/fi";
import { Input } from "../../../shared-components/input";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { FOCUS_RING } from "../../../shared-components/surface";

type LoginFormProps = {
  readonly isPending: boolean;
  readonly errorMessage?: string;
  /**
   * Opens the "reset your password" screen. A callback rather than a `<Link>`
   * so this form stays presentational and needs no router context — the parent
   * owns every navigation on this page already.
   */
  readonly onForgotPassword?: () => void;
  // Rejects when the sign-in fails. The parent owns how that reads to the user
  // and passes it back down as `errorMessage`.
  readonly onSubmit: (data: LoginInput) => Promise<void>;
};

export function LoginForm({
  isPending,
  errorMessage,
  onForgotPassword,
  onSubmit,
}: LoginFormProps) {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchemaInput),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        void handleSubmit(async (data) => {
          try {
            await onSubmit(data);
          } catch {
            // A wrong password is the most ordinary thing that can happen here,
            // and it is already handled: the parent renders it as `errorMessage`
            // below. react-hook-form re-throws whatever the submit handler
            // rejects with, so letting it through would hand every failed sign-in
            // to the global unhandledrejection handler — which is Sentry in
            // production.
          }
        })(e);
      }}
    >
      <Input
        id="login-email"
        type="email"
        label={t("common.email")}
        error={errors.email?.message}
        {...register("email")}
      />

      <Input
        id="login-password"
        type="password"
        label={t("common.password")}
        error={errors.password?.message}
        {...register("password")}
      />

      {/*
        Directly under the password field, which is where somebody realises
        they do not know it. `type="button"` matters: inside a form, the default
        submits it.
      */}
      {onForgotPassword && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onForgotPassword}
            className={`rounded-md text-xs font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-300 ${FOCUS_RING}`}
          >
            {t("auth.forgotPassword")}
          </button>
        </div>
      )}

      {errorMessage && <FeedbackMessage message={errorMessage} tone="error" />}

      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <FiLoader className="h-4 w-4 animate-spin" />
            {t("auth.signingIn")}
          </>
        ) : (
          <>
            <FiLogIn className="h-4 w-4" />
            {t("auth.signIn")}
          </>
        )}
      </Button>
    </form>
  );
}
