import { useTranslation } from "react-i18next";
import { changeLanguage } from "../i18n";
import { SUPPORTED_LANGUAGES, type Language } from "../lib/language";
import { FOCUS_RING_PAGE } from "./surface";

/**
 * Short code shown on the control, and the key holding the language's own name
 * for the accessible label. A Portuguese speaker who cannot read the interface
 * still recognises "Português" — which is the entire point of the endonym.
 */
const LANGUAGE_LABELS = {
  "en-US": { code: "EN", nameKey: "enum.uiLanguage.enUS" },
  "pt-BR": { code: "PT", nameKey: "enum.uiLanguage.ptBR" },
  "es-ES": { code: "ES", nameKey: "enum.uiLanguage.esES" },
  // `as const` rather than a `Record<Language, {nameKey: string}>` annotation:
  // widening nameKey to `string` throws away the literal type that lets tsc
  // check the key against the catalogue.
} as const satisfies Record<Language, { code: string; nameKey: string }>;

/**
 * Sits beside the theme toggle in the floating top-right cluster and borrows
 * its material exactly — same height, same pill, same border, same shadow.
 * A second floating control with its own visual language would read as two
 * unrelated widgets that happened to land next to each other.
 */
export function LanguageToggle() {
  const { t, i18n } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t("nav.chooseLanguage")}
      className="inline-flex h-9 items-center gap-0.5 rounded-full border border-zinc-300 bg-white/95 px-1 shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/90"
    >
      {SUPPORTED_LANGUAGES.map((language) => {
        const isActive = i18n.resolvedLanguage === language;
        return (
          <button
            key={language}
            type="button"
            lang={language}
            aria-label={t(LANGUAGE_LABELS[language].nameKey)}
            aria-pressed={isActive}
            onClick={() => void changeLanguage(language)}
            className={[
              "inline-flex h-7 cursor-pointer items-center justify-center rounded-full px-2 text-xs font-semibold transition",
              FOCUS_RING_PAGE,
              isActive
                ? "bg-violet-700 text-white dark:bg-violet-500"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")}
          >
            {LANGUAGE_LABELS[language].code}
          </button>
        );
      })}
    </div>
  );
}
