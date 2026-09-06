import { useTranslation } from "react-i18next";
import { changeLanguage } from "../i18n";
import { SUPPORTED_LANGUAGES, type Language } from "../lib/language";
import { useSavePreferences } from "../lib/preferences-sync";
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

type LanguageToggleProps = Readonly<{
  /**
   * `bar` is the compact two-letter pill group that sits in the header row.
   * `menu` is the full-width row inside the mobile dropdown, where there is
   * room to spell the endonym out and a thumb needs a 44px target.
   */
  variant?: "bar" | "menu";
}>;

/**
 * Sits beside the theme toggle in the header row — same height, same pill, same
 * border. Two neighbouring controls with their own visual language would read
 * as two unrelated widgets that happened to land next to each other.
 */
export function LanguageToggle({ variant = "bar" }: LanguageToggleProps) {
  const { t, i18n } = useTranslation();
  const savePreferences = useSavePreferences();

  /*
   * Switch first, then tell the server. The catalogue is bundled, so the change
   * is instant and must not be made to wait on a round-trip — and if the save
   * fails the visible language still matches what was clicked.
   *
   * A no-op for a signed-out visitor, who keeps the local-only behaviour.
   */
  const handleSelect = (language: Language) => {
    void changeLanguage(language);
    savePreferences({ language });
  };

  const isMenu = variant === "menu";

  return (
    <div
      role="group"
      aria-label={t("nav.chooseLanguage")}
      className={
        isMenu
          ? "flex w-full items-center gap-1.5"
          : // 36px, the shared height of every control in the 52px header bar.
            // The `bar` variant renders only at `md` and up, where the input is
            // a mouse — the 44px thumb target lives in the `menu` variant.
            // Translucent + `backdrop-blur-sm` because this bar can sit over a
            // user's profile cover image.
            "inline-flex h-9 shrink-0 items-center gap-0.5 rounded-full border border-zinc-300 bg-white/80 px-1 shadow-sm backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/70"
      }
    >
      {SUPPORTED_LANGUAGES.map((language) => {
        const isActive = i18n.resolvedLanguage === language;
        const name = t(LANGUAGE_LABELS[language].nameKey);
        return (
          <button
            key={language}
            type="button"
            lang={language}
            /*
             * In the menu the endonym is the visible text, so it is already the
             * accessible name — a duplicate `aria-label` would only be a second
             * copy to drift. In the bar the visible text is a two-letter code,
             * which needs one.
             */
            aria-label={isMenu ? undefined : name}
            aria-pressed={isActive}
            onClick={() => handleSelect(language)}
            className={[
              isMenu
                ? "inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-md px-2 text-sm font-medium transition"
                : // Fixed square, not padding: a two-letter code sized by its
                  // own glyphs would move the header's width with whichever
                  // font happens to resolve.
                  "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-xs font-semibold transition",
              FOCUS_RING_PAGE,
              isActive
                ? "bg-violet-700 text-white dark:bg-violet-500"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            ].join(" ")}
          >
            {isMenu ? name : LANGUAGE_LABELS[language].code}
          </button>
        );
      })}
    </div>
  );
}
