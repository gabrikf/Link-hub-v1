import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPreferences } from "@repo/schemas";

vi.mock("./auth-api", () => ({
  fetchMyProfile: vi.fn(),
  fetchPreferences: vi.fn(),
}));

import i18n from "../i18n";
import { bootApp, resetBootForTests, startBoot } from "./app-boot";
import { fetchMyProfile, fetchPreferences } from "./auth-api";
import { setAuthTokens } from "./auth-tokens";
import { PREFERENCES_QUERY_KEY } from "./query-client";
import { useUserInfoStore } from "./user-info-store";

const mockedFetchProfile = vi.mocked(fetchMyProfile);
const mockedFetchPreferences = vi.mocked(fetchPreferences);

/**
 * jsdom ships no `matchMedia`, so "follow the OS" is invisible without a stub —
 * and "follow the OS" is exactly what a brand-new account is supposed to get.
 */
const installSystemTheme = (prefersDark: boolean) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: prefersDark,
      media: "(prefers-color-scheme: dark)",
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
};

/** Same idea for the machine's language. */
const installBrowserLanguages = (languages: string[]) => {
  Object.defineProperty(window.navigator, "languages", {
    value: languages,
    configurable: true,
  });
};

const signIn = () =>
  useUserInfoStore.setState({
    userInfo: {
      id: "user-1",
      email: "dev@example.com",
      login: "dev",
      name: "Dev",
      description: null,
      avatarUrl: null,
      googleId: null,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

const tokens = () =>
  setAuthTokens({ accessToken: "access", refreshToken: "refresh" });

const profile = {
  username: "dev",
  name: "Dev",
  description: null,
  userPhoto: null,
  backgroundImageUrl: null,
  bannerImageUrl: null,
  themeAccent: null,
  themePreset: null,
  openToWork: false,
  location: null,
  persona: null,
  personaOther: null,
  links: [],
};

const preferences = (
  overrides: Partial<UserPreferences> = {},
): UserPreferences => ({
  language: null,
  theme: "system",
  ...overrides,
});

const newQueryClient = () => new QueryClient();

const isDark = () => document.documentElement.classList.contains("dark");

beforeEach(() => {
  vi.clearAllMocks();
  resetBootForTests();
  window.localStorage.clear();
  document.documentElement.className = "";
  useUserInfoStore.setState({ userInfo: null });
  mockedFetchProfile.mockResolvedValue(profile);
  installSystemTheme(false);
  installBrowserLanguages(["en-US"]);
});

afterEach(async () => {
  /*
   * FIRST, and before the await below. The deadline test installs fake timers;
   * leaving them installed would freeze every later test's timers, and
   * `changeLanguage` — which is async — would be the first thing to hang on
   * them. Calling this unconditionally is a no-op for the tests that never
   * faked anything.
   */
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await i18n.changeLanguage("en-US");
});

describe("bootApp — a signed-in load", () => {
  /**
   * THE REGRESSION TEST FOR THE REPORTED BUG.
   *
   * "When I log in, my theme only becomes mine if I click the switch or the
   * language switch." Nothing here clicks anything: boot alone has to leave the
   * page painted in the account's stored theme and rendered in its stored
   * language.
   */
  it("applies the account's stored theme and language with no interaction", async () => {
    tokens();
    signIn();
    mockedFetchPreferences.mockResolvedValue(
      preferences({ theme: "dark", language: "pt-BR" }),
    );

    const result = await bootApp(newQueryClient());

    expect(result).toEqual({
      outcome: "authenticated",
      hasServerPreferences: true,
    });
    expect(isDark()).toBe(true);
    expect(i18n.resolvedLanguage).toBe("pt-BR");
    // Mirrored, so the NEXT load on this device paints correctly pre-request.
    expect(window.localStorage.getItem("crafthub-theme")).toBe("dark");
    expect(window.localStorage.getItem("crafthub-language")).toBe("pt-BR");
  });

  /**
   * The other half of what was asked for: "if they don't exist, use system
   * preferences and language from the PC."
   *
   * The stale local values are the point of the setup — they are what a
   * previous account on this browser left behind, and an account with no stored
   * preference of its own must not inherit them.
   */
  it("falls back to the OS theme and the browser language when the account stored neither", async () => {
    window.localStorage.setItem("crafthub-theme", "light");
    window.localStorage.setItem("crafthub-language", "en-US");
    installSystemTheme(true);
    installBrowserLanguages(["pt-BR", "en-US"]);
    tokens();
    signIn();
    mockedFetchPreferences.mockResolvedValue(
      preferences({ theme: "system", language: null }),
    );

    await bootApp(newQueryClient());

    expect(isDark()).toBe(true);
    expect(i18n.resolvedLanguage).toBe("pt-BR");
    // "Follow the device" is stored as "system", never as a resolved snapshot.
    expect(window.localStorage.getItem("crafthub-theme")).toBe("system");
    // And the language mirror is dropped, not rewritten to the resolved value:
    // tomorrow's device language must win again.
    expect(window.localStorage.getItem("crafthub-language")).toBeNull();
  });

  it("primes the cache so the app does not re-ask for what boot already fetched", async () => {
    tokens();
    signIn();
    mockedFetchPreferences.mockResolvedValue(
      preferences({ theme: "light", language: "es-ES" }),
    );
    const queryClient = newQueryClient();

    await bootApp(queryClient);

    expect(queryClient.getQueryData(PREFERENCES_QUERY_KEY)).toEqual({
      theme: "light",
      language: "es-ES",
    });
    expect(queryClient.getQueryData(["me"])).toEqual(profile);
  });

  /**
   * A preferences endpoint that is down must not hold the app hostage, and must
   * not be mistaken for "this account has no preferences" either — the previous
   * shape read this query's error nowhere at all.
   */
  it("still boots when preferences cannot be fetched", async () => {
    window.localStorage.setItem("crafthub-theme", "dark");
    tokens();
    signIn();
    mockedFetchPreferences.mockRejectedValue(new Error("500"));

    const result = await bootApp(newQueryClient());

    expect(result).toEqual({
      outcome: "authenticated",
      hasServerPreferences: false,
    });
    // The local mirror is left standing rather than reset to the device default.
    expect(window.localStorage.getItem("crafthub-theme")).toBe("dark");
  });
});

describe("bootApp — an anonymous load", () => {
  it("makes no authenticated request and leaves local choices alone", async () => {
    window.localStorage.setItem("crafthub-theme", "dark");

    const result = await bootApp(newQueryClient());

    expect(result).toEqual({
      outcome: "anonymous",
      hasServerPreferences: false,
    });
    // A logged-out visitor reading a public profile must produce neither of
    // these, and must keep the theme they picked locally.
    expect(mockedFetchProfile).not.toHaveBeenCalled();
    expect(mockedFetchPreferences).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("crafthub-theme")).toBe("dark");
  });

  /**
   * Tokens with no `userInfo` is not a session — nothing can rebuild `userInfo`,
   * so the app would render a dashboard with no identity and no navigation.
   * Boot drops the remaining half rather than leaving the two halves to
   * disagree with each other for the rest of the page's life.
   */
  it("discards a half-session instead of rendering one", async () => {
    tokens();

    const result = await bootApp(newQueryClient());

    expect(result.outcome).toBe("anonymous");
    expect(window.localStorage.getItem("crafthub.auth.tokens")).toBeNull();
    expect(mockedFetchProfile).not.toHaveBeenCalled();
  });
});

describe("bootApp — an unrecoverable session", () => {
  /**
   * The 401 interceptor tries the refresh endpoint and, when that fails too,
   * calls `handleSessionExpired()` — which clears the tokens. Boot reads that
   * as the verdict rather than guessing from the error, and must land on
   * "anonymous" so the login page is what renders. Never the dashboard first.
   */
  it("boots anonymous when the interceptor has already dropped the tokens", async () => {
    tokens();
    signIn();
    mockedFetchPreferences.mockResolvedValue(preferences({ theme: "dark" }));
    mockedFetchProfile.mockImplementation(async () => {
      window.localStorage.removeItem("crafthub.auth.tokens");
      throw new Error("401");
    });
    const queryClient = newQueryClient();

    const result = await bootApp(queryClient);

    expect(result.outcome).toBe("anonymous");
    // The dead session's preferences must not be left in the cache for whoever
    // signs in next.
    expect(queryClient.getQueryData(PREFERENCES_QUERY_KEY)).toBeUndefined();
  });

  it("keeps the session when the API merely failed", async () => {
    tokens();
    signIn();
    mockedFetchPreferences.mockResolvedValue(preferences());
    mockedFetchProfile.mockRejectedValue(new Error("Network Error"));

    const result = await bootApp(newQueryClient());

    // A network blip is not proof that someone is signed out, and signing them
    // out is the one outcome they cannot undo without their password.
    expect(result.outcome).toBe("authenticated");
  });

  /**
   * A REQUEST THAT NEVER SETTLES REACHES NO `catch`.
   *
   * Every other failure path here rejects, so `bootApp`'s promise to always
   * resolve held for them. A hang is different: the axios client sets no global
   * timeout on purpose (the resume parse and the recruiter search run for tens
   * of seconds), so an upstream that accepts the connection and then goes quiet
   * left `BootGate` suspended forever — the app stuck on the loading skeleton,
   * no error state, nothing to click. Verified against the real app with a
   * Playwright route that never fulfils.
   */
  it("renders the app anyway when the network never answers", async () => {
    tokens();
    signIn();
    vi.useFakeTimers();
    mockedFetchProfile.mockReturnValue(new Promise(() => {}));
    mockedFetchPreferences.mockReturnValue(new Promise(() => {}));

    const booted = bootApp(newQueryClient());
    await vi.advanceTimersByTimeAsync(9_000);
    const result = await booted;

    // Signed in, because nothing contradicted the stored credentials — and
    // signing them out on a silent network is the unrecoverable direction.
    expect(result.outcome).toBe("authenticated");
    expect(result.hasServerPreferences).toBe(false);
  });
});

describe("startBoot", () => {
  it("boots once per page load however many callers ask", async () => {
    tokens();
    signIn();
    mockedFetchPreferences.mockResolvedValue(preferences());
    const queryClient = newQueryClient();

    const [first, second] = await Promise.all([
      startBoot(queryClient),
      startBoot(queryClient),
    ]);

    expect(first).toBe(second);
    expect(mockedFetchProfile).toHaveBeenCalledTimes(1);
  });
});
