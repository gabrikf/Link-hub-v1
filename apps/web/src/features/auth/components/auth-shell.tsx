import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BrandLogo } from "../../../shared-components/brand-logo";
import { SURFACE } from "../../../shared-components/surface";

type AuthShellProps = {
  /** Optional lead line under the product name. Screens with their own heading omit it. */
  description?: string;
  children: ReactNode;
};

/**
 * The centred card every signed-out screen sits in.
 *
 * There are five of them now — sign in / register, check your inbox, verify
 * email, forgot password and reset password — and they have to read as one
 * place. The material comes from `SURFACE`; padding stays here at the call
 * site, as `DESIGN.md` requires.
 */
export function AuthShell({ description, children }: AuthShellProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className={`w-full max-w-md space-y-4 p-6 ${SURFACE}`}>
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <BrandLogo className="h-8 w-8 shadow-sm" />
            {t("common.brandName")}
          </h1>
          {description && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          )}
        </header>

        {children}
      </section>
    </div>
  );
}
