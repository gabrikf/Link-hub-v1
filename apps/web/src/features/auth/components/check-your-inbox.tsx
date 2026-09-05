import { useTranslation } from "react-i18next";
import { FiArrowLeft, FiMail } from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import { SURFACE_INSET } from "../../../shared-components/surface";
import { ResendVerification } from "./resend-verification";

type CheckYourInboxProps = {
  /** The address the account was created with — shown so a typo is visible. */
  readonly email: string;
  readonly onBackToSignIn: () => void;
};

/**
 * The screen after a signup.
 *
 * Registering deliberately does NOT sign you in — `createUserSchemaOutput`
 * carries no tokens — so this is the whole of what happens next, and it has to
 * carry its own weight: what was done, WHICH address it was done to (a typo in
 * the email is the single most common way this flow dead-ends), what to do if
 * it does not arrive, and a way back.
 */
export function CheckYourInbox({ email, onBackToSignIn }: CheckYourInboxProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
          <FiMail className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {t("auth.checkYourInbox")}
        </h2>
      </div>

      <div className={`${SURFACE_INSET} space-y-2 p-4`}>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          {t("auth.verificationSent", { email })}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t("auth.checkSpamFolder")}
        </p>
      </div>

      <ResendVerification email={email} />

      <Button type="button" variant="ghost" onClick={onBackToSignIn}>
        <FiArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("auth.backToLogin")}
      </Button>
    </div>
  );
}
