import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthTokens, setAuthTokens } from "./auth-tokens";
import { PREFERENCES_QUERY_KEY, queryClient } from "./query-client";
import {
  consumeSessionExpiredMessage,
  handleSessionExpired,
  hasSessionExpiredMessage,
  resetSessionExpiredRedirect,
  SESSION_EXPIRED_MESSAGE,
  setSessionExpiredRedirect,
  signOut,
} from "./session";
import { useUserInfoStore } from "./user-info-store";

afterEach(() => {
  resetSessionExpiredRedirect();
  window.localStorage.clear();
  window.sessionStorage.clear();
  useUserInfoStore.getState().clearUserInfo();
});

describe("handleSessionExpired", () => {
  it("clears both stores and parks the notice for the sign-in page", () => {
    setAuthTokens({ accessToken: "a", refreshToken: "r" });
    useUserInfoStore.getState().setUserInfo({
      id: "1",
      login: "ada",
      name: "Ada",
    } as never);

    const redirect = vi.fn();
    setSessionExpiredRedirect(redirect);

    handleSessionExpired();

    expect(getAuthTokens()).toBeNull();
    expect(useUserInfoStore.getState().userInfo).toBeNull();
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(hasSessionExpiredMessage()).toBe(true);
    expect(consumeSessionExpiredMessage()).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it("consumes the notice exactly once so it cannot resurface later", () => {
    handleSessionExpired();

    expect(consumeSessionExpiredMessage()).toBe(SESSION_EXPIRED_MESSAGE);
    expect(consumeSessionExpiredMessage()).toBeNull();
    expect(hasSessionExpiredMessage()).toBe(false);
  });

  it("stops calling a redirect handler after it unsubscribes", () => {
    const redirect = vi.fn();
    const unsubscribe = setSessionExpiredRedirect(redirect);
    unsubscribe();

    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      assign,
    } as unknown as Location);

    handleSessionExpired();

    expect(redirect).not.toHaveBeenCalled();
    // Falls back to a hard navigation so expiry is recoverable even with no
    // React tree mounted.
    expect(assign).toHaveBeenCalledWith("/");

    vi.restoreAllMocks();
  });
});

describe("signOut — what the next account in this tab can see", () => {
  afterEach(() => queryClient.clear());

  /**
   * THE BUG, in the shape a person meets it: two people share a laptop. The
   * first signs out, the second signs in, and for the first few frames the
   * dashboard is painted from the FIRST account's cache — their name in the top
   * bar, their posts, their links, their layout.
   *
   * `signOut` used to evict exactly one key, `["preferences"]`, because that is
   * the entry a specific reported bug was traced to. Every other cached answer
   * — all of it account-scoped, none of it re-fetched before first paint —
   * simply stayed. Eviction of one key was never the rule; leaving nothing of
   * the previous account behind is.
   *
   * Asserted against the REAL `queryClient` singleton on purpose: that is the
   * one `signOut` reaches for, and a throwaway client would prove nothing about
   * the wiring the Logout button actually goes through.
   */
  it("drops every cached answer belonging to the account signing out", () => {
    queryClient.setQueryData(["me"], { login: "ada", name: "Ada" });
    queryClient.setQueryData(["posts"], [{ id: "post-1" }]);
    queryClient.setQueryData(["links"], [{ id: "link-1" }]);
    queryClient.setQueryData(["layout"], { tabs: [] });
    queryClient.setQueryData(PREFERENCES_QUERY_KEY, {
      theme: "dark",
      language: "pt-BR",
    });

    signOut();

    expect(queryClient.getQueryData(["me"])).toBeUndefined();
    expect(queryClient.getQueryData(["posts"])).toBeUndefined();
    expect(queryClient.getQueryData(["links"])).toBeUndefined();
    expect(queryClient.getQueryData(["layout"])).toBeUndefined();
    // Still true — the preferences fix this replaces must not regress.
    expect(queryClient.getQueryData(PREFERENCES_QUERY_KEY)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("clears the stores as well, so half a session cannot survive", () => {
    setAuthTokens({ accessToken: "a", refreshToken: "r" });
    useUserInfoStore.getState().setUserInfo({ id: "1", login: "ada" } as never);

    signOut();

    expect(getAuthTokens()).toBeNull();
    expect(useUserInfoStore.getState().userInfo).toBeNull();
  });
});
