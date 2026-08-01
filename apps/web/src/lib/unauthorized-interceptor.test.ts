import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthTokens } from "./auth-tokens";
import {
  createSessionRefresher,
  createUnauthorizedHandler,
  type RetriableRequestConfig,
} from "./unauthorized-interceptor";

/**
 * Before the interceptor existed, an expired access token produced a dashboard
 * with a blank name, an empty links list and "No resume yet" — every query
 * rejected with a 401 nobody handled. These lock the retry matrix down.
 */

const TOKENS: AuthTokens = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
};

const NEXT_TOKENS: AuthTokens = {
  accessToken: "access-2",
  refreshToken: "refresh-2",
};

const okResponse = (): AxiosResponse =>
  ({ status: 200, data: {} }) as AxiosResponse;

const axiosErrorWithStatus = (
  status: number,
  config: RetriableRequestConfig = { url: "/me" },
): AxiosError => {
  const error = new AxiosError(
    "boom",
    undefined,
    config as never,
    undefined,
    { status, data: {}, statusText: "", headers: {}, config } as never,
  );

  return error;
};

describe("createSessionRefresher", () => {
  it("stores the new tokens a successful refresh returns", async () => {
    const writeTokens = vi.fn();
    const refresher = createSessionRefresher({
      transport: vi.fn().mockResolvedValue(NEXT_TOKENS),
      readTokens: () => TOKENS,
      writeTokens,
    });

    await expect(refresher.refresh()).resolves.toEqual(NEXT_TOKENS);
    expect(writeTokens).toHaveBeenCalledWith(NEXT_TOKENS);
  });

  it("collapses concurrent 401s into a single refresh call", async () => {
    const transport = vi.fn().mockResolvedValue(NEXT_TOKENS);
    const refresher = createSessionRefresher({
      transport,
      readTokens: () => TOKENS,
      writeTokens: vi.fn(),
    });

    const results = await Promise.all([
      refresher.refresh(),
      refresher.refresh(),
      refresher.refresh(),
      refresher.refresh(),
      refresher.refresh(),
    ]);

    expect(transport).toHaveBeenCalledTimes(1);
    expect(results.every((tokens) => tokens === results[0])).toBe(true);
  });

  it("allows a fresh attempt once the previous one has settled", async () => {
    const transport = vi.fn().mockResolvedValue(NEXT_TOKENS);
    const refresher = createSessionRefresher({
      transport,
      readTokens: () => TOKENS,
      writeTokens: vi.fn(),
    });

    await refresher.refresh();
    await refresher.refresh();

    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("returns null without calling out when there are no stored tokens", async () => {
    const transport = vi.fn();
    const refresher = createSessionRefresher({
      transport,
      readTokens: () => null,
      writeTokens: vi.fn(),
    });

    await expect(refresher.refresh()).resolves.toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });

  it("returns null when the refresh response is malformed", async () => {
    const writeTokens = vi.fn();
    const refresher = createSessionRefresher({
      transport: vi.fn().mockResolvedValue({ accessToken: "" }),
      readTokens: () => TOKENS,
      writeTokens,
    });

    await expect(refresher.refresh()).resolves.toBeNull();
    expect(writeTokens).not.toHaveBeenCalled();
  });

  it("stops probing after a 404 — the endpoint is not implemented", async () => {
    const transport = vi.fn().mockRejectedValue(axiosErrorWithStatus(404));
    const refresher = createSessionRefresher({
      transport,
      readTokens: () => TOKENS,
      writeTokens: vi.fn(),
    });

    await expect(refresher.refresh()).resolves.toBeNull();
    await expect(refresher.refresh()).resolves.toBeNull();
    await expect(refresher.refresh()).resolves.toBeNull();

    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("keeps retrying after a transient refresh failure", async () => {
    const transport = vi.fn().mockRejectedValue(axiosErrorWithStatus(500));
    const refresher = createSessionRefresher({
      transport,
      readTokens: () => TOKENS,
      writeTokens: vi.fn(),
    });

    await refresher.refresh();
    await refresher.refresh();

    expect(transport).toHaveBeenCalledTimes(2);
  });
});

describe("createUnauthorizedHandler", () => {
  let refresh: ReturnType<typeof vi.fn>;
  let replay: ReturnType<typeof vi.fn>;
  let onSessionExpired: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    refresh = vi.fn().mockResolvedValue(NEXT_TOKENS);
    replay = vi.fn().mockResolvedValue(okResponse());
    onSessionExpired = vi.fn();
  });

  const handler = (readTokens: () => AuthTokens | null = () => TOKENS) =>
    createUnauthorizedHandler({
      refresh,
      replay,
      readTokens,
      onSessionExpired,
    });

  it("replays the original request with the refreshed access token", async () => {
    const config: RetriableRequestConfig = {
      url: "/me",
      method: "GET",
      headers: AxiosHeaders.from({ "X-Trace": "keep-me" }),
    };

    await expect(
      handler()(axiosErrorWithStatus(401, config)),
    ).resolves.toEqual(okResponse());

    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(replay).toHaveBeenCalledTimes(1);

    const replayed = replay.mock.calls[0][0] as RetriableRequestConfig;
    expect(replayed.url).toBe("/me");
    expect(replayed.hasRetriedAfterRefresh).toBe(true);

    const headers = AxiosHeaders.from(replayed.headers as AxiosHeaders);
    expect(headers.get("Authorization")).toBe(`Bearer ${NEXT_TOKENS.accessToken}`);
    expect(headers.get("x-refresh-token")).toBe(NEXT_TOKENS.refreshToken);
    // A caller's own headers survive the replay.
    expect(headers.get("X-Trace")).toBe("keep-me");
  });

  it("signs the user out when the refresh fails", async () => {
    refresh.mockResolvedValue(null);
    const error = axiosErrorWithStatus(401);

    await expect(handler()(error)).rejects.toBe(error);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(replay).not.toHaveBeenCalled();
  });

  it("does not loop when the replayed request 401s again", async () => {
    const error = axiosErrorWithStatus(401, {
      url: "/me",
      hasRetriedAfterRefresh: true,
    });

    await expect(handler()(error)).rejects.toBe(error);
    expect(refresh).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("leaves a bad-credentials 401 from /auth/login alone", async () => {
    const error = axiosErrorWithStatus(401, { url: "/auth/login" });

    await expect(handler()(error)).rejects.toBe(error);
    expect(refresh).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("leaves an anonymous 401 alone — there is no session to expire", async () => {
    const error = axiosErrorWithStatus(401, { url: "/profile/ada" });

    await expect(handler(() => null)(error)).rejects.toBe(error);
    expect(refresh).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("passes non-401 failures straight through", async () => {
    const error = axiosErrorWithStatus(500);

    await expect(handler()(error)).rejects.toBe(error);
    expect(refresh).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("passes non-axios errors straight through", async () => {
    const error = new Error("render blew up");

    await expect(handler()(error)).rejects.toBe(error);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });
});
