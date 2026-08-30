import { useCallback, useState, useSyncExternalStore } from "react";
import {
  getInitialAiMatchPreference,
  isTouchFirstDevice,
  persistAiMatchPreference,
  resolveAiMatchPreference,
  subscribeToTouchFirstDevice,
  type AiMatchPreference,
} from "../../../lib/ai-match-preference";

export type UseAiMatchPreference = {
  /** The stored intent — `"auto"` included. For the control's own labelling. */
  preference: AiMatchPreference;
  /** The resolved answer. The only thing that may gate the worker. */
  isAiMatchOn: boolean;
  /** True when nothing is stored and the device is the one deciding. */
  isDeviceDecision: boolean;
  /** True when the primary input is a finger — drives the phone warning. */
  isTouchFirst: boolean;
  setIsAiMatchOn: (next: boolean) => void;
};

/** Server-side / no-DOM snapshot. Matches the "unknown device" default. */
const getServerSnapshot = () => false;

/**
 * Binds the stored AI-Match preference to the device it is running on.
 *
 * `useSyncExternalStore` rather than `useEffect` + `useState`: the media query
 * is an external store, and reading it in an effect would render one frame with
 * the wrong answer — which on a phone is exactly the frame that starts the
 * 1.39 MB model download this whole feature exists to avoid.
 */
export function useAiMatchPreference(): UseAiMatchPreference {
  const [preference, setPreference] = useState<AiMatchPreference>(
    getInitialAiMatchPreference,
  );

  const isTouchFirst = useSyncExternalStore(
    subscribeToTouchFirstDevice,
    isTouchFirstDevice,
    getServerSnapshot,
  );

  const setIsAiMatchOn = useCallback((next: boolean) => {
    // An explicit tap is always stored as "on"/"off", never back to "auto":
    // the recruiter has now said what they want on this device, and a later
    // change of device class must not quietly overrule them.
    const chosen: AiMatchPreference = next ? "on" : "off";
    setPreference(chosen);
    persistAiMatchPreference(chosen);
  }, []);

  return {
    preference,
    isAiMatchOn: resolveAiMatchPreference(preference, isTouchFirst) === "on",
    isDeviceDecision: preference === "auto",
    isTouchFirst,
    setIsAiMatchOn,
  };
}
