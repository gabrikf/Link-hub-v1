import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiRefreshCw } from "react-icons/fi";
import { Button } from "../../../shared-components/button";

type DashboardProfileDisplayErrorProps = Readonly<{
  onRetry: () => void;
  isRetrying: boolean;
}>;

/**
 * Shown when `GET /me` fails.
 *
 * The panel used to fall through to `DashboardProfileDisplay` with every field
 * defaulted, so a transient 5xx looked exactly like an account that had lost
 * its name, handle, description and images — with a working "Edit profile"
 * button that opened a blank form. The copy here says the opposite out loud:
 * nothing is missing, the request failed.
 */
export function DashboardProfileDisplayError({
  onRetry,
  isRetrying,
}: DashboardProfileDisplayErrorProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-500/40 dark:bg-red-500/10">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200">
          <FiAlertTriangle className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          {/* Assertive: this interrupts, exactly like a failed form submit. */}
          <p
            role="alert"
            className="text-sm font-semibold text-red-800 dark:text-red-200"
          >
            {t("dashboard.profileLoadErrorTitle")}
          </p>
          <p className="text-sm text-red-700 dark:text-red-300">
            {t("dashboard.profileLoadErrorBody")}
          </p>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        fullWidth={false}
        isLoading={isRetrying}
        loadingLabel={t("common.retrying")}
        onClick={onRetry}
      >
        <FiRefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        {t("common.tryAgain")}
      </Button>
    </div>
  );
}
