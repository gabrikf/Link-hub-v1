import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ThemePreference,
  UpdateUserPreferencesInput,
  UserPreferences,
} from "@repo/schemas";

vi.mock("./auth-api", () => ({
  fetchPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}));

import i18n from "../i18n";
import { fetchPreferences, updatePreferences } from "./auth-api";
import {
  usePreferencesSync,
  useSavePreferences,
  useSystemThemeFollow,
} from "./preferences-sync";
import { PREFERENCES_QUERY_KEY, queryClient } from "./query-client";
import { signOut } from "./session";
import { useUserInfoStore } from "./user-info-store";

const mockedFetch = vi.mocked(fetchPreferences);
const mockedUpdate = vi.mocked(updatePreferences);

const signIn = () => {
  useUserInfoStore.setState({
    userInfo: {
      id: "user-1",
      email: "dev@example.com",
      login: "dev",
      name: "Dev",
      description: null,
      avatarUrl: null,
      googleId: null,
      // Added by the auth workstream's `userResponseSchema` change; the value
      // is irrelevant to preferences, the field's presence is not.
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
};

/** Just the store — NOT the app's `signOut()`, which also evicts the cache. */
const clearStoredUser = () => useUserInfoStore.setState({ userInfo: null });

const newQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

/*
 * These hooks are exercised through real components rather than `renderHook`,
 * for two independent reasons.
 *
 * 1. `renderHook`'s `wrapper` option cannot type-check here. Two copies of
 *    `@types/react` resolve in this monorepo — apps/web depends on ^19.2.14,
 *    while `packages/ui` pins 19.1.0 exactly and hoists it to the root, where
 *    `@testing-library/react` resolves its own. Their `ReactNode` types are
 *    mutually unassignable (19.2's `ReactPortal` requires `children`, 19.1's
 *    does not), and `wrapper` exists precisely to pass `children` across that
 *    boundary. Rendering a JSX tree built entirely from apps/web's own types
 *    never crosses it.
 *
 * 2. Everything worth asserting here is a SIDE EFFECT — what got painted, what
 *    landed in storage, which request was made. Reaching for a hook's return
 *    value would have meant writing to a captured variable during render, which
 *    is impure and which `react-hooks/immutability` correctly rejects.
 */
function SyncProbe({
  themePreference,
  onThemePreferenceChange,
}: {
  themePreference: ThemePreference;
  onThemePreferenceChange: (preference: ThemePreference) => void;
}) {
  usePreferencesSync({ themePreference, onThemePreferenceChange });
  return null;
}

const renderSync = (
  themePreference: ThemePreference,
  onThemePreferenceChange: (preference: ThemePreference) => void,
) =>
  render(
    <QueryClientProvider client={newQueryClient()}>
      <SyncProbe
        themePreference={themePreference}
        onThemePreferenceChange={onThemePreferenceChange}
      />
    </QueryClientProvider>,
  );

/** Clicking is what a real toggle does, so the save path is driven the same way. */
function SaveProbe({ patch }: Readonly<{ patch: UpdateUserPreferencesInput }>) {
  const savePreferences = useSavePreferences();
  return (
    <button type="button" onClick={() => savePreferences(patch)}>
      save
    </button>
  );
}

const renderSave = (patch: UpdateUserPreferencesInput) =>
  render(
    <QueryClientProvider client={newQueryClient()}>
      <SaveProbe patch={patch} />
    </QueryClientProvider>,
  );

const preferences = (overrides: Partial<UserPreferences> = {}) => ({
  language: null,
  theme: "system" as const,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.className = "";
  clearStoredUser();
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("usePreferencesSync — inbound (server → app)", () => {
  it("lets the database beat a stale local value", async () => {
    // The bug: sign out on a dark-mode laptop, sign in as an account whose
    // stored preference is light, and keep getting dark forever because
    // localStorage was consulted last.
    window.localStorage.setItem("crafthub-theme", "dark");
    signIn();
    mockedFetch.mockResolvedValue(preferences({ theme: "light" }));

    const onThemePreferenceChange = vi.fn();
    renderSync("dark", onThemePreferenceChange);

    await waitFor(() =>
      expect(onThemePreferenceChange).toHaveBeenCalledWith("light"),
    );
    expect(window.localStorage.getItem("crafthub-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("mirrors the server value even when it already matches, so a new device gets a seed", async () => {
    signIn();
    mockedFetch.mockResolvedValue(preferences({ theme: "dark" }));

    const onThemePreferenceChange = vi.fn();
    renderSync("dark", onThemePreferenceChange);

    // Nothing to change on screen, but the next pre-paint read needs the value.
    await waitFor(() =>
      expect(window.localStorage.getItem("crafthub-theme")).toBe("dark"),
    );
    expect(onThemePreferenceChange).not.toHaveBeenCalled();
  });

  it("applies and mirrors an explicit stored language", async () => {
    signIn();
    mockedFetch.mockResolvedValue(preferences({ language: "pt-BR" }));

    renderSync("system", vi.fn());

    await waitFor(() => expect(i18n.resolvedLanguage).toBe("pt-BR"));
    expect(window.localStorage.getItem("crafthub-language")).toBe("pt-BR");
  });

  it("clears a mirrored language when the account follows the device", async () => {
    // Otherwise a previous account's language outlives the preference it was
    // copied from, and the next visitor on this browser gets their locale.
    window.localStorage.setItem("crafthub-language", "es-ES");
    signIn();
    mockedFetch.mockResolvedValue(preferences({ language: null }));

    renderSync("system", vi.fn());

    await waitFor(() =>
      expect(window.localStorage.getItem("crafthub-language")).toBeNull(),
    );
  });

  it("degrades to local behaviour when the endpoint fails", async () => {
    signIn();
    mockedFetch.mockRejectedValue(new Error("preferences are down"));
    window.localStorage.setItem("crafthub-theme", "dark");

    const onThemePreferenceChange = vi.fn();
    renderSync("dark", onThemePreferenceChange);

    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    // A preference endpoint being down is never allowed to change the UI.
    expect(onThemePreferenceChange).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("crafthub-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("signing out — what the next account inherits", () => {
  /*
   * Rendered against the REAL `queryClient` singleton on purpose: `signOut()`
   * evicts from that one, and a test with its own throwaway client would prove
   * nothing about the wiring the Logout button actually goes through.
   */
  const renderAgainstAppCache = (
    themePreference: ThemePreference,
    onThemePreferenceChange: (preference: ThemePreference) => void,
  ) =>
    render(
      <QueryClientProvider client={queryClient}>
        <SyncProbe
          themePreference={themePreference}
          onThemePreferenceChange={onThemePreferenceChange}
        />
      </QueryClientProvider>,
    );

  afterEach(() => queryClient.clear());

  it("drops the previous account's preferences", async () => {
    signIn();
    mockedFetch.mockResolvedValue(preferences({ theme: "dark" }));
    renderAgainstAppCache("system", vi.fn());
    await waitFor(() =>
      expect(queryClient.getQueryData(PREFERENCES_QUERY_KEY)).toEqual({
        language: null,
        theme: "dark",
      }),
    );

    signOut();

    expect(queryClient.getQueryData(PREFERENCES_QUERY_KEY)).toBeUndefined();
  });

  /**
   * THE REGRESSION TEST FOR THE REPORTED BUG, in the shape a user meets it:
   * sign out, sign back in as somebody else in the same tab, and get the first
   * account's theme until you touch an unrelated switch.
   *
   * The mechanism is `staleTime: Infinity`. A surviving cache entry is still
   * FRESH for the second account, so React Query serves it without refetching —
   * and because it is the same object by reference, the effect that applies
   * preferences never re-runs. Nothing about the second account is ever asked
   * for or applied.
   */
  it("lets the next account fetch and apply its own", async () => {
    signIn();
    mockedFetch.mockResolvedValue(preferences({ theme: "dark" }));
    const onThemePreferenceChange = vi.fn();
    const view = renderAgainstAppCache("system", onThemePreferenceChange);
    await waitFor(() =>
      expect(onThemePreferenceChange).toHaveBeenCalledWith("dark"),
    );

    // The Logout button's funnel, then a fresh sign-in on the same tab.
    signOut();
    view.unmount();
    onThemePreferenceChange.mockClear();
    mockedFetch.mockClear();
    mockedFetch.mockResolvedValue(preferences({ theme: "light" }));
    signIn();

    renderAgainstAppCache("dark", onThemePreferenceChange);

    await waitFor(() =>
      expect(onThemePreferenceChange).toHaveBeenCalledWith("light"),
    );
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("usePreferencesSync — anonymous visitors", () => {
  it("never requests preferences without a session", async () => {
    renderSync("light", vi.fn());

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

describe("useSavePreferences — outbound (app → server)", () => {
  it("sends the patch for a signed-in user", async () => {
    signIn();
    mockedUpdate.mockResolvedValue(preferences({ theme: "dark" }));

    renderSave({ theme: "dark" });
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled());
    // Asserted on the first argument only: TanStack Query v5 hands `mutationFn`
    // a second context argument, which `updatePreferences` ignores.
    expect(mockedUpdate.mock.calls[0]?.[0]).toEqual({ theme: "dark" });
  });

  it("makes NO request for a logged-out visitor", async () => {
    // A public profile carries both toggles. An anonymous toggle must not fire
    // a request that 401s — not even one that gets swallowed.
    renderSave({ theme: "dark" });
    fireEvent.click(screen.getByRole("button"));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("swallows a failed save rather than interrupting the user", async () => {
    signIn();
    mockedUpdate.mockRejectedValue(new Error("nope"));

    renderSave({ theme: "dark" });
    expect(() => fireEvent.click(screen.getByRole("button"))).not.toThrow();

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled());
  });
});

describe("useSystemThemeFollow", () => {
  const installMatchMedia = (initialMatches: boolean) => {
    const listeners = new Set<(event: { matches: boolean }) => void>();
    let matches = initialMatches;

    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        get matches() {
          return matches;
        },
        media: "(prefers-color-scheme: dark)",
        addEventListener: (
          _event: string,
          listener: (event: { matches: boolean }) => void,
        ) => listeners.add(listener),
        removeEventListener: (
          _event: string,
          listener: (event: { matches: boolean }) => void,
        ) => listeners.delete(listener),
      })),
    );

    return (nextMatches: boolean) => {
      matches = nextMatches;
      for (const listener of [...listeners]) {
        listener({ matches: nextMatches });
      }
    };
  };

  afterEach(() => vi.unstubAllGlobals());

  it("repaints and reports when the OS flips under a 'system' preference", () => {
    const emit = installMatchMedia(false);
    const onResolved = vi.fn();

    // No provider needed, so `renderHook` is fine here — nothing crosses the
    // `ReactNode` boundary described above.
    renderHook(() => useSystemThemeFollow("system", onResolved));
    emit(true);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    // The sun/moon icon reads this; without it "system" paints dark behind a sun.
    expect(onResolved).toHaveBeenLastCalledWith("dark");
  });

  it("ignores the OS once a preference is pinned", () => {
    const emit = installMatchMedia(false);
    const onResolved = vi.fn();

    renderHook(() => useSystemThemeFollow("light", onResolved));
    emit(true);

    expect(onResolved).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
