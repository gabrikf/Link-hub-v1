import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStoredAiMatchPreference,
  DEFAULT_AI_MATCH_PREFERENCE,
  getInitialAiMatchPreference,
  getStoredAiMatchPreference,
  isTouchFirstDevice,
  persistAiMatchPreference,
  resolveAiMatchPreference,
  subscribeToTouchFirstDevice,
} from "./ai-match-preference";

const STORAGE_KEY = "crafthub-ai-match";

/**
 * jsdom ships no `matchMedia`, so every device-class path is invisible without
 * a stub. This one records its listeners, which is what lets the tests below
 * prove the subscription is really torn down rather than assume it.
 */
type MediaQueryListener = () => void;

const installMatchMedia = (initialMatches: boolean) => {
  const listeners = new Set<MediaQueryListener>();
  const seenQueries: string[] = [];
  let matches = initialMatches;

  const mediaQueryList = {
    get matches() {
      return matches;
    },
    addEventListener: (_event: string, listener: MediaQueryListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: string, listener: MediaQueryListener) => {
      listeners.delete(listener);
    },
  };

  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      seenQueries.push(query);
      return mediaQueryList;
    }),
  );

  return {
    seenQueries,
    listenerCount: () => listeners.size,
    emit: (nextMatches: boolean) => {
      matches = nextMatches;
      for (const listener of [...listeners]) {
        listener();
      }
    },
  };
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("device detection", () => {
  it("asks the browser about its pointer, never about its user agent", () => {
    const media = installMatchMedia(true);

    expect(isTouchFirstDevice()).toBe(true);
    // A UA string would misread a desktop browser with a spoofed agent and,
    // worse, would silently rot as new devices ship.
    expect(media.seenQueries).toEqual(["(hover: none) and (pointer: coarse)"]);
  });

  it("reports a mouse-driven machine as not touch-first", () => {
    installMatchMedia(false);
    expect(isTouchFirstDevice()).toBe(false);
  });

  it("treats a browser with no matchMedia as not touch-first", () => {
    // Old embedded webviews genuinely lack it. Losing the feature outright
    // would be a bigger regression than running it on a machine that can cope.
    vi.stubGlobal("matchMedia", undefined);
    expect(isTouchFirstDevice()).toBe(false);
  });
});

describe("resolveAiMatchPreference — the default is per device", () => {
  it("is OFF by default on a touch-first device", () => {
    installMatchMedia(true);
    expect(resolveAiMatchPreference(DEFAULT_AI_MATCH_PREFERENCE)).toBe("off");
  });

  it("is ON by default on a desktop", () => {
    installMatchMedia(false);
    // The pre-existing behaviour, unchanged: no regression where the model is
    // free to run.
    expect(resolveAiMatchPreference(DEFAULT_AI_MATCH_PREFERENCE)).toBe("on");
  });

  it("lets an explicit choice beat the device on a phone", () => {
    installMatchMedia(true);
    expect(resolveAiMatchPreference("on")).toBe("on");
    expect(resolveAiMatchPreference("off")).toBe("off");
  });

  it("lets an explicit choice beat the device on a desktop", () => {
    installMatchMedia(false);
    expect(resolveAiMatchPreference("off")).toBe("off");
    expect(resolveAiMatchPreference("on")).toBe("on");
  });

  it("resolves against a device class the caller passes in", () => {
    // The hook subscribes to the media query and renders from that value; if
    // resolution re-read `matchMedia` it could disagree with what React drew.
    expect(resolveAiMatchPreference("auto", true)).toBe("off");
    expect(resolveAiMatchPreference("auto", false)).toBe("on");
  });
});

describe("the stored preference", () => {
  it("round-trips through localStorage", () => {
    persistAiMatchPreference("on");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("on");
    expect(getStoredAiMatchPreference()).toBe("on");

    persistAiMatchPreference("off");
    expect(getStoredAiMatchPreference()).toBe("off");
  });

  it("sits alongside the other device preferences, not on the account", () => {
    persistAiMatchPreference("off");
    // Same family as `crafthub-theme` / `crafthub-language`. Turning the model
    // off on a phone must not turn it off on the desktop.
    expect(window.localStorage.getItem("crafthub-ai-match")).toBe("off");
  });

  it("is null when nothing was ever chosen", () => {
    expect(getStoredAiMatchPreference()).toBeNull();
    expect(getInitialAiMatchPreference()).toBe("auto");
  });

  it("falls back to 'auto' on a corrupt stored value", () => {
    window.localStorage.setItem(STORAGE_KEY, "yes-please");

    // Not a throw and not a guess: an unrecognised value is no preference.
    expect(getStoredAiMatchPreference()).toBeNull();
    expect(getInitialAiMatchPreference()).toBe("auto");
  });

  it("falls back to 'auto' on a value from some other feature", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: true }));
    expect(getStoredAiMatchPreference()).toBeNull();
  });

  it("survives storage that throws on read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    // Private mode, or a browser set to block site data. Following the device
    // is a fine answer; crashing the search page is not.
    expect(getStoredAiMatchPreference()).toBeNull();
    expect(getInitialAiMatchPreference()).toBe("auto");
  });

  it("survives storage that throws on write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => persistAiMatchPreference("on")).not.toThrow();
  });

  it("can be cleared back to 'let the device decide'", () => {
    persistAiMatchPreference("on");
    clearStoredAiMatchPreference();

    expect(getStoredAiMatchPreference()).toBeNull();
    expect(getInitialAiMatchPreference()).toBe("auto");
  });

  it("survives storage that throws on clear", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(() => clearStoredAiMatchPreference()).not.toThrow();
  });
});

describe("subscribeToTouchFirstDevice", () => {
  it("calls back when the device class changes and unsubscribes cleanly", () => {
    const media = installMatchMedia(false);
    const onChange = vi.fn();

    const unsubscribe = subscribeToTouchFirstDevice(onChange);
    expect(media.listenerCount()).toBe(1);

    media.emit(true);
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(media.listenerCount()).toBe(0);

    media.emit(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when matchMedia is missing", () => {
    vi.stubGlobal("matchMedia", undefined);

    const unsubscribe = subscribeToTouchFirstDevice(vi.fn());
    expect(() => unsubscribe()).not.toThrow();
  });

  it("is a no-op on a MediaQueryList without addEventListener", () => {
    // Safari only gained it in 14. Degrading to "resolved at load" is fine;
    // throwing on the search page is not.
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );

    const unsubscribe = subscribeToTouchFirstDevice(vi.fn());
    expect(() => unsubscribe()).not.toThrow();
  });
});
