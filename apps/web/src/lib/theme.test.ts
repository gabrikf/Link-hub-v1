import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  applyThemePreference,
  getInitialThemePreference,
  getStoredThemePreference,
  getSystemTheme,
  persistThemePreference,
  resolveTheme,
  subscribeToSystemTheme,
} from "./theme";

/**
 * jsdom ships no `matchMedia`, so every OS-theme path is invisible without a
 * stub. This one records its listeners, which is what lets the tests below
 * prove the subscription is actually torn down rather than merely assuming it.
 */
type MediaQueryListener = (event: { matches: boolean }) => void;

const installMatchMedia = (initialMatches: boolean) => {
  const listeners = new Set<MediaQueryListener>();
  let matches = initialMatches;

  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_event: string, listener: MediaQueryListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: string, listener: MediaQueryListener) => {
      listeners.delete(listener);
    },
  };

  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mediaQueryList),
  );

  return {
    listenerCount: () => listeners.size,
    emit: (nextMatches: boolean) => {
      matches = nextMatches;
      for (const listener of [...listeners]) {
        listener({ matches: nextMatches });
      }
    },
  };
};

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveTheme", () => {
  it("passes an explicit preference straight through", () => {
    installMatchMedia(true);
    // The OS says dark; an explicit "light" must still win.
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves 'system' against the OS", () => {
    installMatchMedia(true);
    expect(resolveTheme("system")).toBe("dark");
  });

  it("falls back to light when matchMedia is unavailable", () => {
    // Some embedded webviews genuinely lack it; this must not throw.
    vi.stubGlobal("matchMedia", undefined);
    expect(getSystemTheme()).toBe("light");
    expect(resolveTheme("system")).toBe("light");
  });
});

describe("stored preference", () => {
  it("round-trips all three values", () => {
    for (const preference of ["light", "dark", "system"] as const) {
      persistThemePreference(preference);
      expect(getStoredThemePreference()).toBe(preference);
    }
  });

  it("keeps reading values written before 'system' existed", () => {
    // The storage key is unchanged and the two old values are still valid
    // preferences, so nobody gets reset mid-session by this feature landing.
    window.localStorage.setItem("linkhub-theme", "dark");
    expect(getStoredThemePreference()).toBe("dark");
  });

  it("ignores a corrupt value rather than trusting it", () => {
    window.localStorage.setItem("linkhub-theme", "sepia");
    expect(getStoredThemePreference()).toBeNull();
  });

  it("defaults to following the system when nothing is stored", () => {
    expect(getStoredThemePreference()).toBeNull();
    expect(getInitialThemePreference()).toBe("system");
  });
});

describe("applyTheme", () => {
  it("toggles the dark class and colorScheme together", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");

    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("paints the resolved theme for a 'system' preference and reports it back", () => {
    installMatchMedia(true);
    // The return value is what the toggle's sun/moon icon reads.
    expect(applyThemePreference("system")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("subscribeToSystemTheme", () => {
  it("fires when the OS flips, so 'system' is live rather than read once", () => {
    const media = installMatchMedia(false);
    const onChange = vi.fn();

    subscribeToSystemTheme(onChange);
    media.emit(true);

    expect(onChange).toHaveBeenCalledWith("dark");
  });

  it("stops firing after unsubscribe", () => {
    const media = installMatchMedia(false);
    const onChange = vi.fn();

    const unsubscribe = subscribeToSystemTheme(onChange);
    unsubscribe();
    media.emit(true);

    expect(onChange).not.toHaveBeenCalled();
    expect(media.listenerCount()).toBe(0);
  });

  it("degrades to a no-op where addEventListener is missing", () => {
    // Safari gained it in 14; on older versions the whole feature degrading to
    // "resolved at load" is acceptable, but it must not throw on the way.
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, media: "" })),
    );

    const unsubscribe = subscribeToSystemTheme(vi.fn());
    expect(() => unsubscribe()).not.toThrow();
  });

  it("returns a callable unsubscribe when matchMedia is absent entirely", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(() => subscribeToSystemTheme(vi.fn())()).not.toThrow();
  });
});
