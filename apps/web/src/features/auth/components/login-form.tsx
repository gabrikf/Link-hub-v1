import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchemaInput } from "@repo/schemas";
import type { LoginInput } from "@repo/schemas";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiLoader, FiLogIn } from "react-icons/fi";
import { Input } from "../../../shared-components/input";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";

type LoginFormProps = {
  isPending: boolean;
  errorMessage?: string;
  // Rejects when the sign-in fails. The parent owns how that reads to the user
  // and passes it back down as `errorMessage`.
  onSubmit: (data: LoginInput) => Promise<void>;
};

export function LoginForm({
  isPending,
  errorMessage,
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
      onSubmit={handleSubmit(async (data) => {
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
      })}
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
