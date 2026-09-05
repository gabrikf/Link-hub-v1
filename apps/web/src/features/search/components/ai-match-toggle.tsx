import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiCpu } from "react-icons/fi";
import { FOCUS_RING, SURFACE_INSET } from "../../../shared-components/surface";

type AiMatchToggleProps = Readonly<{
  isOn: boolean;
  /** True while nothing is stored and the device is the one deciding. */
  isDeviceDecision: boolean;
  /** True when the primary input is a finger — a phone or a tablet. */
  isTouchFirst: boolean;
  onChange: (next: boolean) => void;
}>;

const LABEL_ID = "ai-match-toggle-label";
const WARNING_ID = "ai-match-toggle-warning";

/**
 * The on/off control for the in-browser re-ranker.
 *
 * There was no control at all: the ~1.39 MB model downloaded and a TF.js
 * inference pass ran on every device, on every search, which on a phone heats
 * the handset and can lock the page up. The switch is the fix; the warning next
 * to it is why anyone would touch the switch.
 *
 * A plain `<button role="switch">` rather than the Radix switch used elsewhere:
 * Radix's needs a `ResizeObserver` that jsdom does not have, and this control
 * has no popper, no portal and no form value — the accessible pattern is four
 * lines and it keeps the page testable without a global polyfill.
 */
export function AiMatchToggle({
  isOn,
  isDeviceDecision,
  isTouchFirst,
  onChange,
}: AiMatchToggleProps) {
  const { t } = useTranslation();

  return (
    <div className={`mt-4 p-4 ${SURFACE_INSET}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span
          id={LABEL_ID}
          className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100"
        >
          <FiCpu
            className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400"
            aria-hidden="true"
          />
          <span className="min-w-0 break-words">
            {t("search.aiMatchLabel")}
          </span>
        </span>

        <span className="inline-flex shrink-0 items-center gap-2">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {isOn ? t("common.on") : t("common.off")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isOn}
            aria-labelledby={LABEL_ID}
            aria-describedby={WARNING_ID}
            onClick={() => onChange(!isOn)}
            className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition ${
              isOn
                ? "bg-violet-600 dark:bg-violet-500"
                : "bg-zinc-300 dark:bg-zinc-700"
            } ${FOCUS_RING}`}
          >
            <span
              aria-hidden="true"
              className={`block h-4 w-4 rounded-full bg-white transition-transform duration-150 dark:bg-zinc-900 ${
                isOn ? "translate-x-4.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </span>
      </div>

      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
        {t("search.aiMatchExplainer")}
      </p>

      {/* The whole reason the switch exists. Shown on every device: a recruiter
          on a laptop still needs to know why it is off on their phone. */}
      <p
        id={WARNING_ID}
        className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"
      >
        <FiAlertTriangle
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
          aria-hidden="true"
        />
        <span className="min-w-0">{t("search.aiMatchPhoneWarning")}</span>
      </p>

      {/* Only while nothing is stored — once the recruiter taps the switch,
          saying "we chose this for you" would be a lie. */}
      {isDeviceDecision ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {isTouchFirst
            ? t("search.aiMatchDefaultOffHere")
            : t("search.aiMatchDefaultOnHere")}
        </p>
      ) : null}
    </div>
  );
}
