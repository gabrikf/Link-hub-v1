import { useTranslation } from "react-i18next";
import { FiCheck } from "react-icons/fi";
import { getWizardSteps, type WizardStepKey } from "./wizard-shared";

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/**
 * The named stepper header: Source → Connect → Verify → Preview → Schedule.
 *
 * Completed steps get a checkmark, the current one is highlighted and carries
 * `aria-current="step"`. On phones only the current step's name is spelled
 * out — five labels do not fit at 375px, but five dots plus one name do.
 */
export function WizardStepper({
  current,
  done,
}: {
  current: WizardStepKey;
  /** The success screen: every step reads as completed. */
  done?: boolean;
}) {
  const { t } = useTranslation();
  const wizardSteps = getWizardSteps(t);
  const currentIndex = wizardSteps.findIndex((step) => step.key === current);

  return (
    <ol
      aria-label={t("wizard.setupSteps")}
      className="flex flex-wrap items-center gap-1.5"
    >
      {wizardSteps.map((step, index) => {
        const isComplete = done || index < currentIndex;
        const isCurrent = !done && index === currentIndex;

        return (
          <li key={step.key} className="flex items-center gap-1.5">
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={cx(
                  "h-px w-3 sm:w-4",
                  isComplete || isCurrent
                    ? "bg-violet-400 dark:bg-violet-500/60"
                    : "bg-zinc-200 dark:bg-zinc-700",
                )}
              />
            ) : null}
            <span
              aria-current={isCurrent ? "step" : undefined}
              className="flex items-center gap-1.5"
            >
              <span
                className={cx(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  isComplete
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : isCurrent
                      ? "bg-violet-700 text-white dark:bg-violet-600"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                )}
              >
                {isComplete ? (
                  <FiCheck className="h-3 w-3" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cx(
                  "text-xs font-medium",
                  isCurrent
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "hidden text-zinc-500 sm:inline dark:text-zinc-400",
                )}
              >
                {step.label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
