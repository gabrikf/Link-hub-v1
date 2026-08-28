import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import {
  applyLanguage,
  DEFAULT_LANGUAGE,
  getInitialLanguage,
  persistLanguage,
  SUPPORTED_LANGUAGES,
  type Language,
} from "../lib/language";
import enUS from "./locales/en-US.json";
import ptBR from "./locales/pt-BR.json";
import esES from "./locales/es-ES.json";

/**
 * i18next init. Imported once, for its side effect, from `main.tsx`.
 *
 * Three locales, all bundled rather than fetched. The whole catalogue is a few
 * kilobytes gzipped, and bundling it removes the two failure modes a backend
 * plugin introduces: a flash of raw keys on first paint, and a screen that
 * renders in English because a network request lost a race.
 */

/*
 * There is deliberately no `CustomTypeOptions` declaration here.
 *
 * Typing `resources` as `typeof enUS` does give `t()` autocomplete and turns a
 * mistyped key into a compile error — but measured on this catalogue it added
 * 14 seconds to a cold `tsc -b` at 265 keys, and the finished catalogue is four
 * times that. The gate has a 90-second budget for the whole monorepo.
 *
 * `scripts/guardrails/i18n-raw-strings.mjs` checks every `t("…")` in apps/web
 * against en-US.json instead. Same bug caught, ~0.1s, and it also finds keys
 * that exist in the locale files but that nothing renders.
 */

void i18next.use(initReactI18next).init({
  resources: {
    "en-US": { translation: enUS },
    "pt-BR": { translation: ptBR },
    "es-ES": { translation: esES },
  },
  lng: getInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  /*
   * Resources are bundled, so there is nothing to await. Synchronous init means
   * the first render already has the catalogue — without it the app paints raw
   * keys for a frame and the visual runner screenshots that frame.
   */
  initAsync: false,
  /*
   * A missing key renders as the key itself. Ugly on purpose: `common.save` on
   * screen is a bug report, an empty button is a mystery.
   */
  returnNull: false,
  returnEmptyString: false,
  interpolation: {
    // React escapes for us; letting i18next escape too double-encodes apostrophes.
    escapeValue: false,
  },
});

// `<html lang>` follows the active language — index.html ships a static "en",
// and a stale value is what a screen reader picks its pronunciation from.
applyLanguage(getInitialLanguage());
i18next.on("languageChanged", (language) => {
  applyLanguage(language as Language);
});

/** Switches language, persists the choice, and updates `<html lang>`. */
export const changeLanguage = async (language: Language) => {
  persistLanguage(language);
  await i18next.changeLanguage(language);
};

export default i18next;
