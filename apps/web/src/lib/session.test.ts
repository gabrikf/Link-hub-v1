import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthTokens, setAuthTokens } from "./auth-tokens";
import {
  consumeSessionExpiredMessage,
  handleSessionExpired,
  hasSessionExpiredMessage,
  resetSessionExpiredRedirect,
  SESSION_EXPIRED_MESSAGE,
  setSessionExpiredRedirect,
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
