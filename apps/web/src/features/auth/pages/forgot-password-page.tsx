import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchemaInput } from "@repo/schemas";
import type { ForgotPasswordInput } from "@repo/schemas";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiArrowLeft, FiMail } from "react-icons/fi";
import { forgotPasswordRequest } from "../../../lib/auth-api";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { Input } from "../../../shared-components/input";
import { SURFACE_INSET } from "../../../shared-components/surface";
import { AuthShell } from "../components/auth-shell";

/**
 * `/forgot-password` — ask for a link to choose a new password.
 *
 * THE CONFIRMATION IS THE SAME EITHER WAY. `/auth/forgot-password` answers
 * `{ status: "sent" }` for a registered address, an unknown one and an
 * OAuth-only account alike, precisely so that it cannot be used to find out who
 * has an account here. A screen that said "we couldn't find that address" would
 * hand that oracle straight back through the UI, so the wording is conditional
 * on purpose: "if that address has an account".
 */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchemaInput),
    defaultValues: { email: "" },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: forgotPasswordRequest,
  });

  // What was typed, not what the server said about it — the server says the
  // same thing either way, which is the point.
  const submittedEmail = forgotPasswordMutation.variables?.email;

  return (
    <AuthShell>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {t("auth.forgotPasswordTitle")}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("auth.forgotPasswordDescription")}
        </p>
      </div>

      {forgotPasswordMutation.isSuccess && submittedEmail ? (
        <div className={`${SURFACE_INSET} space-y-2 p-4`}>
          <FeedbackMessage
            message={t("auth.resetLinkSent", { email: submittedEmail })}
            tone="success"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {t("auth.checkSpamFolder")}
          </p>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={handleSubmit(async (values) => {
            try {
              await forgotPasswordMutation.mutateAsync(values);
            } catch {
              // Rendered below. react-hook-form re-throws whatever the submit
              // handler rejects with, and an escaped rejection reaches Sentry's
              // global unhandledrejection handler carrying the typed address.
            }
          })}
        >
          <Input
            id="forgot-password-email"
            type="email"
            label={t("common.email")}
            error={errors.email?.message}
            {...register("email")}
          />

          {forgotPasswordMutation.error && (
            <FeedbackMessage
              message={forgotPasswordMutation.error.message}
              tone="error"
            />
          )}

          <Button
            type="submit"
            isLoading={forgotPasswordMutation.isPending}
            loadingLabel={t("common.sending")}
          >
            <FiMail className="h-4 w-4" aria-hidden="true" />
            {t("auth.sendResetLink")}
          </Button>
        </form>
      )}

      <Button
        type="button"
        variant="ghost"
        onClick={() => navigate({ to: "/" })}
      >
        <FiArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("auth.backToLogin")}
      </Button>
    </AuthShell>
  );
}
