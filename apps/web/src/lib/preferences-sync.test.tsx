import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPreferences } from "@repo/schemas";

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
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
};

const signOut = () => useUserInfoStore.setState({ userInfo: null });

/**
 * Renders a hook inside a QueryClientProvider without crossing a `ReactNode`
 * boundary.
 *
 * Two copies of `@types/react` resolve in this monorepo — apps/web depends on
 * ^19.2.14, while `packages/ui` pins 19.1.0 exactly and hoists it to the root
 * where `@testing-library/react` resolves it. The two `ReactNode` types are
 * mutually unassignable (19.2's `ReactPortal` requires `children`, 19.1's does
 * not), so `renderHook`'s `wrapper` option — which passes `children` across
 * that boundary — cannot type-check in either direction.
 *
 * `ReactElement` IS compatible, which is why every other test here uses plain
 * `render()` with inline JSX. This helper does the same: the provider and the
 * probe are one JSX tree built entirely with apps/web's own React types, and
 * nothing of type `ReactNode` is ever handed to a differently-typed consumer.
 *
 * (The real fix is deduplicating those two copies, but `packages/ui` is
 * recorded dead scaffolding in AGENTS.md and untangling it is its own task.)
 */
function renderHookWithClient<TResult>(useHook: () => TResult) {
  const captured: { current: TResult | null } = { current: null };

  function Probe() {
    captured.current = useHook();
    return null;
  }

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );

  return captured;
}

const preferences = (overrides: Partial<UserPreferences> = {}) => ({
  language: null,
  theme: "system" as const,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.className = "";
  signOut();
});

afterEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("usePreferencesSync — inbound (server → app)", () => {
  it("lets the database beat a stale local value", async () => {
    // The bug: sign out on a dark-mode laptop, sign in as an account whose
    // stored preference is light, and keep getting dark forever because
    // localStorage was consulted last.
    window.localStorage.setItem("linkhub-theme", "dark");
    signIn();
    mockedFetch.mockResolvedValue(preferences({ theme: "light" }));

    const onThemePreferenceChange = vi.fn();
    renderHookWithClient(() =>
      usePreferencesSync({ themePreference: "dark", onThemePreferenceChange }),
    );

    await waitFor(() =>
      expect(onThemePreferenceChange).toHaveBeenCalledWith("light"),
    );
    expect(window.localStorage.getItem("linkhub-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("mirrors the server value even when it already matches, so a new device gets a seed", async () => {
    signIn();
    mockedFetch.mockResolvedValue(preferences({ theme: "dark" }));

    const onThemePreferenceChange = vi.fn();
    renderHookWithClient(() =>
      usePreferencesSync({ themePreference: "dark", onThemePreferenceChange }),
    );

    // Nothing to change on screen, but the next pre-paint read needs the value.
    await waitFor(() =>
      expect(window.localStorage.getItem("linkhub-theme")).toBe("dark"),
    );
    expect(onThemePreferenceChange).not.toHaveBeenCalled();
  });

  it("applies and mirrors an explicit stored language", async () => {
    signIn();
    mockedFetch.mockResolvedValue(preferences({ language: "pt-BR" }));

    renderHookWithClient(() =>
      usePreferencesSync({
        themePreference: "system",
        onThemePreferenceChange: vi.fn(),
      }),
    );

    await waitFor(() => expect(i18n.resolvedLanguage).toBe("pt-BR"));
    expect(window.localStorage.getItem("linkhub-language")).toBe("pt-BR");
  });

  it("clears a mirrored language when the account follows the device", async () => {
    // Otherwise a previous account's language outlives the preference it was
    // copied from, and the next visitor on this browser gets their locale.
    window.localStorage.setItem("linkhub-language", "es-ES");
    signIn();
    mockedFetch.mockResolvedValue(preferences({ language: null }));

    renderHookWithClient(() =>
      usePreferencesSync({
        themePreference: "system",
        onThemePreferenceChange: vi.fn(),
      }),
    );

    await waitFor(() =>
      expect(window.localStorage.getItem("linkhub-language")).toBeNull(),
    );
  });

  it("degrades to local behaviour when the endpoint fails", async () => {
    signIn();
    mockedFetch.mockRejectedValue(new Error("preferences are down"));
    window.localStorage.setItem("linkhub-theme", "dark");

    const onThemePreferenceChange = vi.fn();
    const result = renderHookWithClient(() =>
      usePreferencesSync({ themePreference: "dark", onThemePreferenceChange }),
    );

    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    // A preference endpoint being down is never allowed to change the UI.
    expect(onThemePreferenceChange).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("linkhub-theme")).toBe("dark");
    expect(result.current?.preferences).toBeUndefined();
  });
});

describe("usePreferencesSync — anonymous visitors", () => {
  it("never requests preferences without a session", async () => {
    renderHookWithClient(() =>
      usePreferencesSync({
        themePreference: "light",
        onThemePreferenceChange: vi.fn(),
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

describe("useSavePreferences — outbound (app → server)", () => {
  it("sends the patch for a signed-in user", async () => {
    signIn();
    mockedUpdate.mockResolvedValue(preferences({ theme: "dark" }));

    const result = renderHookWithClient(() => useSavePreferences());
    result.current?.({ theme: "dark" });

    // Asserted on the first argument only: TanStack Query v5 hands `mutationFn`
    // a second context argument, which `updatePreferences` ignores.
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled());
    expect(mockedUpdate.mock.calls[0]?.[0]).toEqual({ theme: "dark" });
  });

  it("makes NO request for a logged-out visitor", async () => {
    // A public profile carries both toggles. An anonymous toggle must not fire
    // a request that 401s — not even one that gets swallowed.
    const result = renderHookWithClient(() => useSavePreferences());
    result.current?.({ theme: "dark" });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("swallows a failed save rather than interrupting the user", async () => {
    signIn();
    mockedUpdate.mockRejectedValue(new Error("nope"));

    const result = renderHookWithClient(() => useSavePreferences());
    expect(() => result.current?.({ theme: "dark" })).not.toThrow();

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
