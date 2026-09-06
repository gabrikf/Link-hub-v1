import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  FiAlertTriangle,
  FiCheck,
  FiShield,
  FiThumbsDown,
  FiThumbsUp,
} from "react-icons/fi";

/**
 * The two trust explainers extracted from `connect-panel.tsx` when the
 * "How this works" dialog needed the same content: the enforced-vs-guidance
 * grid and the weak/strong example posts. One copy of the copy — the whole
 * point of the enforcement grid is that its claims stay true, and two forks of
 * a promise drift into a lie.
 */

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * What CraftHub's servers enforce vs. what the model is merely instructed to
 * do. The two used to be blended into one flat promise; the difference is
 * exactly what a user needs to understand before pointing this at a work
 * laptop, so they are separated explicitly.
 */
export function EnforcementGrid() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          <FiShield className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t("settings.safety.enforcedTitle")}
        </div>
        <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
          {t("settings.safety.enforcedBody")}
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <li className="flex gap-2">
            <FiCheck
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <span>{t("settings.safety.enforcedReject")}</span>
          </li>
          <li className="flex gap-2">
            <FiCheck
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <span>{t("settings.safety.enforcedRedact")}</span>
          </li>
          <li className="flex gap-2">
            <FiCheck
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <span>{t("settings.safety.enforcedPolicy")}</span>
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
          <FiAlertTriangle
            className="h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          {t("settings.safety.guidanceTitle")}
        </div>
        <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-300">
          {t("settings.safety.guidanceBody")}
        </p>
        <ul className="mt-2 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <li className="flex gap-2">
            <FiAlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <span>{t("settings.safety.guidanceStrip")}</span>
          </li>
          <li className="flex gap-2">
            <FiAlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <span>{t("settings.safety.guidanceSecrets")}</span>
          </li>
          <li className="flex gap-2">
            <FiAlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <span>{t("settings.safety.guidanceDraft")}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

type ExampleCardProps = Readonly<{
  tone: "weak" | "strong";
  title: string;
  caption: string;
  children: ReactNode;
}>;

export function ExampleCard({
  tone,
  title,
  caption,
  children,
}: ExampleCardProps) {
  const isWeak = tone === "weak";
  const Icon = isWeak ? FiThumbsDown : FiThumbsUp;

  return (
    <div
      className={cx(
        "rounded-xl border p-3",
        isWeak
          ? "border-red-200 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/5"
          : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/5",
      )}
    >
      <div
        className={cx(
          "flex items-center gap-2 text-xs font-semibold",
          isWeak
            ? "text-red-800 dark:text-red-300"
            : "text-emerald-800 dark:text-emerald-300",
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {title}
      </div>
      <div className="mt-2 space-y-1.5 rounded-lg bg-white/80 p-2.5 text-xs leading-relaxed text-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300">
        {children}
      </div>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{caption}</p>
    </div>
  );
}

/** Same week of commits, two very different posts. */
export function ExamplePostsGrid() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ExampleCard
        tone="weak"
        title={t("settings.safety.withoutPromptTitle")}
        caption={t("settings.safety.withoutPromptBody")}
      >
        <p className="font-semibold">{t("settings.safety.weeklyUpdate")}</p>
        <p className="whitespace-pre-line font-mono">
          {t("settings.safety.exampleCommitLog")}
        </p>
        <p>{t("settings.safety.exampleCommitCount")}</p>
      </ExampleCard>

      <ExampleCard
        tone="strong"
        title={t("settings.safety.withPromptTitle")}
        caption={t("settings.safety.withPromptBody")}
      >
        <p className="font-semibold">{t("settings.safety.exampleGoodTitle")}</p>
        <p>{t("settings.safety.exampleGoodLead")}</p>
        <p className="whitespace-pre-line">
          {t("settings.safety.exampleGoodBody")}
        </p>
        <p>{t("settings.safety.exampleGoodStack")}</p>
      </ExampleCard>
    </div>
  );
}
