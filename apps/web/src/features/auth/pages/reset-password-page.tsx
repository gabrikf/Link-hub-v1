import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchemaInput } from "@repo/schemas";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiArrowLeft, FiLock } from "react-icons/fi";
import { z } from "zod";
import { API_ERROR_CODE, isApiErrorCode } from "../../../lib/api-error";
import { resetPasswordRequest } from "../../../lib/auth-api";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { Input } from "../../../shared-components/input";
import { SURFACE_INSET } from "../../../shared-components/surface";
import { AuthShell } from "../components/auth-shell";
import { parkAuthNotice } from "../lib/auth-notice";

/**
 * The password rule is TAKEN from the shared schema, never restated.
 *
 * `.pick({ password: true })` keeps this form on exactly the policy the API
 * enforces (min 6, max 100 — the same one `createUserSchemaInput` uses for
 * signup). Retyping the numbers here is how a reset form ends up rejecting a
 * password the signup form would have accepted, or the reverse: a client-side
 * rule that is stricter than the server's is a bug the user cannot see the
 * cause of, and one that is looser is a validation error they cannot fix.
 *
 * The confirm field is added on top rather than sent: the API has no use for
 * it, it exists only to catch a typo in a field nobody can read back.
 */
const buildResetPasswordFormSchema = (t: TFunction) =>
  resetPasswordSchemaInput
    .pick({ password: true })
    .extend({ confirmPassword: z.string() })
    .refine((values) => values.password === values.confirmPassword, {
      path: ["confirmPassword"],
      message: t("auth.passwordsDoNotMatch"),
    });

type ResetPasswordFormValues = z.infer<
  ReturnType<typeof buildResetPasswordFormSchema>
>;

const readTokenFromLocation = (): string => {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
};

/**
 * `/reset-password?token=…` — choose a new password.
 *
 * Succeeding here mints NO session (see `resetPasswordSchemaOutput`): whoever
 * opened the link proved control of the mailbox, which is enough to change the
 * password but not enough to make a forwarded email an authenticated session.
 * So the screen after this one is the sign-in form, carrying a confirmation.
 *
 * The token is captured on the first render and stripped from the address bar
 * on mount, and is never rendered — same reasoning as `verify-email-page.tsx`.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [token] = useState(readTokenFromLocation);
  const formSchema = useMemo(() => buildResetPasswordFormSchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const resetMutation = useMutation({
    mutationFn: resetPasswordRequest,
    onSuccess: () => {
      parkAuthNotice("auth.passwordUpdated");
      void navigate({ to: "/" });
    },
  });

  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const goToForgotPassword = () => {
    void navigate({ to: "/forgot-password" });
  };

  const isTokenRejected = isApiErrorCode(
    resetMutation.error,
    API_ERROR_CODE.invalidResetToken,
  );

  /* ── Missing or blank token, and a token the API rejected ───────────── */
  if (!token || isTokenRejected) {
    return (
      <AuthShell>
        <div className="space-y-4">
          <div className="text-center">
            <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
              <FiAlertTriangle className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {t("auth.forgotPasswordTitle")}
            </h2>
          </div>

          <p
            role="alert"
            className={`${SURFACE_INSET} block p-4 text-sm text-zinc-700 dark:text-zinc-300`}
          >
            {token ? t("auth.resetLinkInvalid") : t("auth.resetLinkMissing")}
          </p>

          <Button type="button" onClick={goToForgotPassword}>
            {t("auth.requestNewLink")}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => void navigate({ to: "/" })}
          >
            <FiArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("auth.backToLogin")}
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {t("auth.resetPasswordTitle")}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("auth.resetPasswordDescription")}
        </p>
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          void handleSubmit(async (values) => {
            try {
              await resetMutation.mutateAsync({
                token,
                password: values.password,
              });
            } catch {
              // Rendered below, or as the rejected-token screen above.
            }
          })(event);
        }}
      >
        <Input
          id="reset-password"
          type="password"
          label={t("auth.newPassword")}
          error={errors.password?.message}
          {...register("password")}
        />

        <Input
          id="reset-password-confirm"
          type="password"
          label={t("auth.confirmPassword")}
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        {resetMutation.error && (
          <FeedbackMessage message={resetMutation.error.message} tone="error" />
        )}

        <Button
          type="submit"
          isLoading={resetMutation.isPending}
          loadingLabel={t("auth.updatingPassword")}
        >
          <FiLock className="h-4 w-4" aria-hidden="true" />
          {t("auth.updatePassword")}
        </Button>
      </form>

      <Button
        type="button"
        variant="ghost"
        onClick={() => void navigate({ to: "/" })}
      >
        <FiArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("auth.backToLogin")}
      </Button>
    </AuthShell>
  );
}
