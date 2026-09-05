import { zodResolver } from "@hookform/resolvers/zod";
import { resendVerificationSchemaInput } from "@repo/schemas";
import type { ResendVerificationInput } from "@repo/schemas";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiMail } from "react-icons/fi";
import { resendVerificationRequest } from "../../../lib/auth-api";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { Input } from "../../../shared-components/input";

/**
 * How long the button stays shut after a successful send.
 *
 * The API is rate-limited, but a button that answers a frustrated user's fourth
 * click with a 429 is a worse experience than one that says when it will work
 * again. This is a UI courtesy on top of the server's limit, never a
 * replacement for it — nothing here is a security control.
 */
const RESEND_COOLDOWN_SECONDS = 60;

type ResendVerificationProps = {
  /**
   * The address to send to, when it is already known — after a signup, or after
   * a sign-in rejected as unverified. Leave it out and the component asks for
   * one, which is the only option on a dead verification link: the token is all
   * we had, and it told us nothing.
   *
   * Passed as a `defaultValue`, so a caller whose address can change should
   * remount this with `key={email}`.
   */
  readonly email?: string;
};

export function ResendVerification({ email }: ResendVerificationProps) {
  const { t } = useTranslation();
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResendVerificationInput>({
    resolver: zodResolver(resendVerificationSchemaInput),
    defaultValues: { email: email ?? "" },
  });

  const resendMutation = useMutation({
    mutationFn: resendVerificationRequest,
    onSuccess: () => setSecondsRemaining(RESEND_COOLDOWN_SECONDS),
  });

  /*
   * One timeout per remaining second rather than one interval: the effect is
   * then a pure function of the number on screen, so there is no timer to keep
   * in step with the state, and unmounting mid-countdown cannot leave one
   * running.
   */
  useEffect(() => {
    if (secondsRemaining <= 0) {
      return;
    }

    const timer = window.setTimeout(
      () => setSecondsRemaining((remaining) => remaining - 1),
      1000,
    );

    return () => window.clearTimeout(timer);
  }, [secondsRemaining]);

  const isCoolingDown = secondsRemaining > 0;

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        void handleSubmit(async (values) => {
          try {
            await resendMutation.mutateAsync(values);
          } catch {
            // Rendered below from `resendMutation.error`. react-hook-form
            // re-throws whatever the submit handler rejects with, and an escaped
            // rejection is reported to Sentry as an unhandled one.
          }
        })(e);
      }}
    >
      {!email && (
        <Input
          id="resend-verification-email"
          type="email"
          label={t("common.email")}
          error={errors.email?.message}
          {...register("email")}
        />
      )}

      <Button
        type="submit"
        variant="outline"
        isLoading={resendMutation.isPending}
        loadingLabel={t("common.sending")}
        disabled={isCoolingDown}
      >
        <FiMail className="h-4 w-4" aria-hidden="true" />
        {isCoolingDown
          ? t("auth.resendAvailableIn", { seconds: secondsRemaining })
          : t("auth.resendVerification")}
      </Button>

      {/*
        The confirmation says nothing about the address. `/auth/resend-verification`
        answers "sent" for an unknown address and an already-verified one alike,
        precisely so it cannot be used to discover who has an account here; a
        message that read differently per outcome would hand that back.
      */}
      {resendMutation.isSuccess && (
        <FeedbackMessage
          message={t("auth.verificationResent")}
          tone="success"
        />
      )}

      {resendMutation.error && (
        <FeedbackMessage message={resendMutation.error.message} tone="error" />
      )}
    </form>
  );
}
