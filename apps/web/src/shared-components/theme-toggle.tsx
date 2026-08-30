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
   * `bar` is the 64px pill that sits in the header row. `menu` is the
   * full-width switch inside the mobile sheet: the same sliding knob, stretched
   * to the width of the drawer so the thumb gets a 44px row, and labelled —
   * the bar's pill carries no words at all, which is affordable next to five
   * other controls and is not on a screen a user opened to change a setting.
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
    /*
     * A SWITCH WEARING THE ROW IT REPLACED.
     *
     * Same `Button variant="outline"`, same `fullWidth`, same 44px height,
     * same `rounded-md`, same sentence — the outer control is byte-for-byte
     * the row that shipped before, which is why it is still the `Button`
     * component rather than a hand-rolled div wearing the outline classes.
     * What changed is the inside: the static leading icon became a violet knob
     * that slides from one end of the row to the other, carrying the sun or
     * the moon with it.
     *
     * WHY THE KNOB MOVES WITH `left` AND NOT `translate-x`. A transform
     * percentage resolves against the ELEMENT's own width, so a 36px knob can
     * only be told to move in 36px steps — and the distance it has to travel
     * is "the track, minus itself", a number this component never sees. The
     * alternatives were a container query (`cqw`) or measuring the button in
     * an effect. `left` states the geometry in one line
     * (`calc(100% - 2.5rem)` = full width, less the knob and both 4px insets)
     * and animates natively; the compositor cost of one 300ms toggle on one
     * 36px box is not worth a ResizeObserver.
     *
     * WHAT THE POSITION SAYS. The old row showed one icon — the destination —
     * so nothing on it answered "which theme am I in". The knob's SIDE answers
     * that now (sun end for light, moon end for dark) and the sentence keeps
     * answering the other question, "what happens if I press this". Those are
     * two different questions and they were sharing one icon.
     */
    return (
      <Button
        type="button"
        variant="outline"
        fullWidth
        // h-11: a 44px row, which is what a thumb needs. The default `md` size
        // is 40px and this list is only ever touched on a phone. `px-1` gives
        // the knob its 4px inset; `overflow-hidden` keeps its corners inside
        // the button's `rounded-md`.
        className="relative h-11 overflow-hidden px-1"
        onClick={onToggle}
      >
        {/*
          The knob, and the only icon on the control. `rounded-md` to match the
          button it lives in — a pill inside a square-ish row reads as a
          foreign part.

          BOTH ICONS PARKED AT THE TWO ENDS was the first draft, and it is the
          version that looks best in a screenshot. It cost the label 80px of
          gutter, and measured at every phone width in
          `scripts/visual/scenarios/` the longest string in the catalogue
          ("Mudar para o tema escuro", 174px at `text-sm`) was then clipped at
          320px AND at 360px — a Galaxy A-series, not an exotic device. One
          knob gives that 40px back and the sentence fits from 320px up. The
          two icons are still both here; they take turns in the knob instead of
          standing at the ends.
        */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute top-1 flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 to-violet-700 text-white shadow-sm transition-[left] duration-300 ease-out motion-reduce:transition-none dark:from-violet-500 dark:to-violet-600 ${
            isDark ? "left-[calc(100%-2.5rem)]" : "left-1"
          }`}
        >
          {/*
            Stacked and cross-faded rather than swapped by a ternary: a
            ternary would pop the new icon in at full size the instant the
            state flips, half a beat before the knob has finished travelling.
            Rotating them past each other keeps the two halves of the gesture
            on the same clock.
          */}
          <FiSun
            className={`absolute h-4 w-4 transition duration-300 motion-reduce:transition-none ${
              isDark
                ? "rotate-90 scale-50 opacity-0"
                : "rotate-0 scale-100 opacity-100"
            }`}
          />
          <FiMoon
            className={`absolute h-4 w-4 transition duration-300 motion-reduce:transition-none ${
              isDark
                ? "rotate-0 scale-100 opacity-100"
                : "-rotate-90 scale-50 opacity-0"
            }`}
          />
        </span>

        {/*
          The only in-flow child, so `Button`'s own `justify-center` centres
          it. The padding is what keeps it off the knob, and it swaps sides on
          the same 300ms as the travel — the sentence slides out of the knob's
          way rather than being jumped over. It also stays the accessible name:
          no `aria-label` here, which would be a second copy of this same
          string to drift.

          The far side is `p*-0` and not `p*-1`, which looks like a typo and
          is not: `Button` already contributes `px-1`, so the text still clears
          the border by 4px, and the 4px reclaimed here is exactly what puts
          "Mudar para o tema escuro" inside a 320px screen instead of 2px
          outside one. Measured, not guessed.

          `truncate` is the honest failure mode rather than a wrap: a second
          line inside a fixed 44px row is not a smaller label, it is a broken
          one.
        */}
        <span
          className={`relative min-w-0 flex-1 truncate text-center transition-[padding] duration-300 ease-out motion-reduce:transition-none ${
            isDark ? "pr-10 pl-0" : "pr-0 pl-10"
          }`}
        >
          {label}
        </span>
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
