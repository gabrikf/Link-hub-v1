import { z } from "zod";
import { reportHandled } from "./report-error";

/**
 * Whether the in-browser TensorFlow.js re-ranker ("AI Match %") may run.
 *
 * Same shape as `theme.ts`: a STORED INTENT that may be `"auto"`, and a
 * RESOLVED value that is only ever on or off. Nothing may read the stored
 * intent and treat it as an answer — `"auto"` means different things on a
 * phone and on a laptop, which is the entire point of this module.
 */
export const AI_MATCH_PREFERENCES = ["on", "off", "auto"] as const;

const aiMatchPreferenceSchema = z.enum(AI_MATCH_PREFERENCES);

export type AiMatchPreference = z.infer<typeof aiMatchPreferenceSchema>;

/** What is actually done: run the model, or do not. */
export type AiMatchSetting = "on" | "off";

/**
 * No stored choice means "let the device decide". A recruiter who has never
 * seen the switch gets the safe answer for the machine they are holding.
 */
export const DEFAULT_AI_MATCH_PREFERENCE: AiMatchPreference = "auto";

/**
 * Sits next to `crafthub-theme` and `crafthub-language`, and deliberately does
 * NOT sync to the account: this is a property of the device, not of the person.
 * Turning the re-ranker off on a phone must not turn it off on the desktop
 * where it is free.
 */
const AI_MATCH_STORAGE_KEY = "crafthub-ai-match";

/**
 * A capability query, not a user-agent string.
 *
 * `(hover: none) and (pointer: coarse)` is the browser's own answer to "is the
 * primary input a finger?" — true on phones and tablets, false on a laptop
 * (even a touchscreen one, which still reports a hovering mouse) and false on a
 * narrow desktop window. Width alone would have punished a small window on a
 * machine that can easily afford the model.
 *
 * The device this matters on is the one where a 1.39 MB model plus a TF.js
 * inference pass heats the phone and makes the page unresponsive.
 */
const TOUCH_FIRST_QUERY = "(hover: none) and (pointer: coarse)";

const canMatchMedia = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

/**
 * True when the primary input is a finger.
 *
 * Falsy when `matchMedia` is missing (jsdom, old embedded webviews): the
 * pre-existing behaviour is "always rank", so an unknown device keeps it rather
 * than silently losing the feature.
 */
export const isTouchFirstDevice = (): boolean =>
  canMatchMedia() ? window.matchMedia(TOUCH_FIRST_QUERY).matches : false;

/**
 * Resolves a stored intent against the device it is running on.
 *
 * `isTouchFirst` is a parameter so a caller that already subscribes to the
 * media query (see `useAiMatchPreference`) resolves against the value React
 * rendered with, rather than re-reading `matchMedia` mid-render and getting a
 * different answer.
 */
export const resolveAiMatchPreference = (
  preference: AiMatchPreference,
  isTouchFirst: boolean = isTouchFirstDevice(),
): AiMatchSetting => {
  if (preference !== "auto") {
    return preference;
  }

  return isTouchFirst ? "off" : "on";
};

/**
 * The stored choice, or `null` for "never chosen".
 *
 * Anything unparseable — a value from an older build, a key another tab wrote,
 * a half-written string — is `null` rather than a throw or a guess. `unknown`
 * through a zod parse is the honest form; `localStorage` returns `string |
 * null` and neither is a preference until it has been checked.
 */
export const getStoredAiMatchPreference = (): AiMatchPreference | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue: unknown = window.localStorage.getItem(AI_MATCH_STORAGE_KEY);
    const parsed = aiMatchPreferenceSchema.safeParse(rawValue);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    // Private-mode / blocked storage. Following the device is a fine answer.
    reportHandled(error, { action: "ai-match.read-stored" });
    return null;
  }
};

/** The preference to start from on first paint. */
export const getInitialAiMatchPreference = (): AiMatchPreference =>
  getStoredAiMatchPreference() ?? DEFAULT_AI_MATCH_PREFERENCE;

export const persistAiMatchPreference = (preference: AiMatchPreference) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(AI_MATCH_STORAGE_KEY, preference);
  } catch (error) {
    // No-op when storage is unavailable (private mode, quota).
    reportHandled(error, { action: "ai-match.persist" });
  }
};

/** Drops the stored choice, returning the app to "let the device decide". */
export const clearStoredAiMatchPreference = () => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(AI_MATCH_STORAGE_KEY);
  } catch (error) {
    reportHandled(error, { action: "ai-match.clear-stored" });
  }
};

/**
 * Calls back when the primary input capability changes.
 *
 * It genuinely does change without a reload: docking a tablet to a keyboard, or
 * a desktop browser's device-emulation mode, both flip this query. Same guard
 * as `subscribeToSystemTheme` — Safari only gained `addEventListener` on a
 * `MediaQueryList` in 14, and degrading to "resolved at load" is acceptable.
 *
 * Module scope, so `useSyncExternalStore` sees a stable reference.
 */
export const subscribeToTouchFirstDevice = (
  onChange: () => void,
): (() => void) => {
  if (!canMatchMedia()) {
    return () => {};
  }

  const mediaQuery = window.matchMedia(TOUCH_FIRST_QUERY);

  if (typeof mediaQuery.addEventListener !== "function") {
    return () => {};
  }

  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
};
