import type { GitConnectionHealth, Post } from "@repo/schemas";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { FiCheckCircle, FiHelpCircle, FiLoader } from "react-icons/fi";
import { BADGE } from "../../../../shared-components/surface";
import type { WizardSourceKey } from "./wizard-shared";

/**
 * The trust moment. Never a dead spinner: while listening there is an animated
 * bar plus a sentence saying exactly what would flip it to green, and after a
 * minute of silence the step switches to per-source recovery guidance instead
 * of spinning forever.
 */

/** ~60s. Long enough for a webhook redelivery, short enough to not feel hung. */
const RECOVERY_GUIDANCE_AFTER_MS = 60_000;

function getRecoveryGuidance(
  t: TFunction,
): Record<Exclude<WizardSourceKey, "mcp">, string> {
  return {
    claude_code: t("wizard.verify.hookGuidance"),
    extractor: t("wizard.verify.extractorGuidance"),
    forge: t("wizard.verify.webhookGuidance"),
  };
}

function ListeningPanel({ instruction }: { instruction: string }) {
  const { t } = useTranslation();
  return (
    // `role="status"` (implicit polite live region): the flip from listening
    // to connected happens without user input, so it must be announced, not
    // just painted green.
    <div
      role="status"
      className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-500/30 dark:bg-violet-500/10"
    >
      <p className="flex items-center gap-2.5 text-sm font-medium text-violet-900 dark:text-violet-100">
        <FiLoader
          className="h-4 w-4 shrink-0 animate-spin"
          aria-hidden="true"
        />
        {t("wizard.verify.listening")}
      </p>
      <p className="mt-1 text-xs text-violet-800/80 dark:text-violet-200/80">
        {instruction}
      </p>
      <div
        aria-hidden="true"
        className="anim-sheen mt-3 h-1.5 rounded-full bg-violet-200/80 dark:bg-violet-500/25"
      />
    </div>
  );
}

function SuccessPanel({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="anim-scale-in rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/10"
    >
      <p className="flex items-start gap-2 text-sm text-emerald-900 dark:text-emerald-100">
        <FiCheckCircle
          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <span>
          <span
            className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE.success}`}
          >
            {t("wizard.verify.connected")}
          </span>
          {children}
        </span>
      </p>
    </div>
  );
}

function RecoveryPanel({ guidance }: { guidance: string }) {
  const { t } = useTranslation();
  return (
    // Appears on a timer, not a click — same announce-or-be-missed rule.
    <div
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/5"
    >
      <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
        <FiHelpCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold">{t("wizard.verify.nothingYet")}</span>{" "}
          {guidance} {t("wizard.verify.canSkip")}
        </span>
      </p>
    </div>
  );
}

/** Shared 60s "show recovery guidance" timer. */
function useRecoveryTimer(active: boolean) {
  const [waitedLong, setWaitedLong] = useState(false);

  useEffect(() => {
    if (!active) {
      setWaitedLong(false);
      return;
    }
    const timer = window.setTimeout(
      () => setWaitedLong(true),
      RECOVERY_GUIDANCE_AFTER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [active]);

  return waitedLong;
}

export function ConnectionVerifyBody({
  sourceKey,
  health,
  isError,
}: {
  sourceKey: Exclude<WizardSourceKey, "mcp">;
  health: GitConnectionHealth | undefined;
  isError: boolean;
}) {
  const { t } = useTranslation();
  const isConnected = (health?.totalEvents ?? 0) > 0;
  const waitedLong = useRecoveryTimer(!isConnected);
  const recoveryGuidance = getRecoveryGuidance(t)[sourceKey];

  if (isConnected && health) {
    return (
      <SuccessPanel>
        {t("wizard.verify.eventsReceived", {
          count: health.totalEvents,
          repos: health.distinctReposLast30Days,
        })}
      </SuccessPanel>
    );
  }

  return (
    <div className="space-y-3">
      <ListeningPanel
        instruction={t("wizard.verify.listeningBody", { recoveryGuidance })}
      />
      {waitedLong ? <RecoveryPanel guidance={recoveryGuidance} /> : null}
      {isError ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {t("wizard.verify.statusFailed")}
        </p>
      ) : null}
    </div>
  );
}

export function McpVerifyBody({ detectedPost }: { detectedPost: Post | null }) {
  const { t } = useTranslation();
  const waitedLong = useRecoveryTimer(detectedPost === null);

  if (detectedPost) {
    // The post title is the user's own words and is never translated — only
    // the sentence around it. `<title>` is the Trans slot carrying its
    // emphasis, so each language decides where in the sentence it lands.
    return (
      <SuccessPanel>
        <Trans
          i18nKey="wizard.verify.postDetected"
          values={{
            postTitle: detectedPost.title ?? t("wizard.verify.untitledUpdate"),
          }}
          components={{ title: <strong className="font-semibold" /> }}
        />
      </SuccessPanel>
    );
  }

  return (
    <div className="space-y-3">
      <ListeningPanel instruction={t("wizard.verify.mcpGuidance")} />
      {waitedLong ? (
        <RecoveryPanel guidance={t("wizard.verify.mcpRecovery")} />
      ) : null}
    </div>
  );
}
