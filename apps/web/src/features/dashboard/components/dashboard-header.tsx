import { useTranslation } from "react-i18next";
import { FiLayout } from "react-icons/fi";

export function DashboardHeader() {
  const { t } = useTranslation();

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2 items-center">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-violet-600 to-violet-800 text-white shadow-sm">
          <FiLayout className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col">
          <h1 className="flex items-center gap-1 text-lg font-semibold">
            {t("nav.dashboard")}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("dashboard.subtitle")}
          </p>
        </div>
      </div>
    </header>
  );
}
