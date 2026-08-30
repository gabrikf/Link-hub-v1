import { useTranslation } from "react-i18next";
import { FiMoon, FiSun } from "react-icons/fi";
import type { Theme } from "../lib/theme";
import { Button } from "./button";
import { FOCUS_RING_PAGE } from "./surface";

/**
 * The theme switch, extracted from `App.tsx` so it can render wherever the
 * LAYOUT puts it instead of floating over the page on a fixed layer.
 *
 * STATELESS ON PURPOSE. `App` owns `themePreference` (which may be `"system"`)
 * and `resolvedTheme` (what is painted) and must keep owning them — they feed
 * `usePreferencesSync` and `useSystemThemeFollow`. This component takes the
 * resolved theme and a toggle callback and nothing else, so there is exactly
 * one source of truth and no second copy to drift.
 *
 * Neither a context nor a `lib/` hook, and that is the "pick the simpler one"
 * call: `App` renders `TopBarNav` directly, one level down, and `TopBarNav` is
 * the only other consumer. A provider plus a hook plus a module would be three
 * new moving parts to move a value across one edge that already exists.
 */
type ThemeToggleProps = {
  /**
   * The theme actually on screen — never the stored preference, which may be
   * `"system"` and cannot be painted.
   */
  theme: Theme;
  onToggle: () => void;
  /**
   * `bar` is the pill that sits in the header row. `menu` is the full-width
   * labelled row inside the mobile dropdown, where a 36px sliding switch is
   * both too small for a thumb and carries no words at all.
   */
  variant?: "bar" | "menu";
};

export function ThemeToggle({
  theme,
  onToggle,
  variant = "bar",
}: ThemeToggleProps) {
  const { t } = useTranslation();
  const isDark = theme === "dark";

  /*
   * Stays a two-state control on purpose: the switch flips what is on screen
   * right now, which is the only thing a person is thinking about when they
   * reach for it. The wording is the ACTION, so the same string works as the
   * icon button's accessible name and as the menu row's visible label.
   */
  const label = t("nav.switchTheme", {
    mode: t(isDark ? "nav.themeLight" : "nav.themeDark"),
  });

  if (variant === "menu") {
    return (
      <Button
        type="button"
        variant="outline"
        fullWidth
        // h-11: a 44px row, which is what a thumb needs. The default `md` size
        // is 40px and this list is only ever touched on a phone.
        className="h-11 justify-start"
        onClick={onToggle}
      >
        {isDark ? (
          <FiSun className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <FiMoon className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        {label}
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      /*
       * 36px tall, down from 44px, because the header row it sits in is 52px
       * now instead of 68px. That is not a regression in target size: the `bar`
       * variant renders only at `md` and up, where the input is a mouse; the
       * `menu` variant above is the one a thumb ever hits and it stays at 44px.
       *
       * The geometry still falls out of the height: 64px wide minus `px-1`
       * leaves a 56px track, the 28px knob travels exactly its own width, so
       * the offset is `translate-x-7` rather than a measured fraction.
       *
       * Translucent + `backdrop-blur-sm` because this bar can sit over a
       * user's profile cover image. `shadow-sm`, not `shadow-lg` — this is in
       * flow, not floating (DESIGN.md §8).
       */
      className={`relative inline-flex h-9 w-16 shrink-0 cursor-pointer items-center rounded-full border border-zinc-300 bg-white/80 px-1 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/70 dark:hover:bg-zinc-900 ${FOCUS_RING_PAGE}`}
    >
      <span className="pointer-events-none absolute left-2.5 text-amber-500 dark:text-zinc-500">
        <FiSun className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="pointer-events-none absolute right-2.5 text-zinc-500 dark:text-violet-300">
        <FiMoon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span
        className={`pointer-events-none inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-700 text-white transition-transform duration-200 motion-reduce:transition-none dark:bg-violet-500 ${
          isDark ? "translate-x-7" : "translate-x-0"
        }`}
      >
        {isDark ? (
          <FiMoon className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <FiSun className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}
