/**
 * The mechanism behind the constant-time answer of `/auth/forgot-password` and
 * `/auth/resend-verification`.
 *
 * These assertions are about ORDERING, not milliseconds: they run on fake
 * timers, so "the response waited for the floor" is exact rather than a
 * threshold that a loaded CI box can wander across. The companion file
 * `controllers/auth/test/auth-email-timing.e2e.test.ts` checks the wall clock
 * through the real endpoints, where a lower bound is all that is asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyRequest } from "fastify";
import { withResponseTimeFloor } from "./response-time-floor.js";
import {
  AUTH_EMAIL_RESPONSE_FLOOR_DEFAULT_MS,
  authEmailResponseFloorMs,
} from "../../config/app-config.js";

const FLOOR_MS = 200;

function makeRequest(): FastifyRequest {
  return {
    id: "req-under-test",
    method: "POST",
    routeOptions: { url: "/forgot-password" },
    log: { error: () => undefined },
  } as unknown as FastifyRequest;
}

describe("withResponseTimeFloor", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    // NODE_ENV is "test" under vitest, so `structuredLoggingEnabled()` is false
    // and the suppressed-failure report goes to console.error, exactly as it
    // does in local development.
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
    vi.useRealTimers();
  });

  /** Resolves once `promise` settles, without ever awaiting it inline. */
  function watch(promise: Promise<void>): { settled: () => boolean } {
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    return { settled: () => settled };
  }

  it("holds the response until the floor elapses, even when the work is instant", async () => {
    // The "no such account" branch: it does almost nothing, and before the
    // floor existed it answered in ~2 ms while a real account took ~9-50 ms.
    const work = vi.fn(async () => undefined);

    const pending = withResponseTimeFloor({
      request: makeRequest(),
      floorMs: FLOOR_MS,
      work,
    });
    const watched = watch(pending);

    await vi.advanceTimersByTimeAsync(FLOOR_MS - 1);
    expect(work).toHaveBeenCalledOnce();
    expect(watched.settled()).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(watched.settled()).toBe(true);

    await pending;
  });

  it("answers ON the floor when the work is slower, instead of waiting for it", async () => {
    // A struggling SMTP relay. If the response tracked the send, the "account
    // exists" branch would once again be the visibly slow one — the oracle
    // reappearing from the other direction.
    let workFinished = false;
    const work = () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          workFinished = true;
          resolve();
        }, 30_000);
      });

    const pending = withResponseTimeFloor({
      request: makeRequest(),
      floorMs: FLOOR_MS,
      work,
    });
    const watched = watch(pending);

    await vi.advanceTimersByTimeAsync(FLOOR_MS);

    expect(watched.settled()).toBe(true);
    expect(workFinished).toBe(false);

    await pending;
    await vi.advanceTimersByTimeAsync(30_000);
  });

  it("reports a failure that lands AFTER the reply instead of leaving it unhandled", async () => {
    const failure = new Error("smtp: connection refused");
    const work = () =>
      new Promise<void>((_resolve, reject) => {
        setTimeout(() => reject(failure), 5_000);
      });

    const pending = withResponseTimeFloor({
      request: makeRequest(),
      floorMs: FLOOR_MS,
      work,
    });

    await vi.advanceTimersByTimeAsync(FLOOR_MS);
    await expect(pending).resolves.toBeUndefined();
    expect(consoleError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);

    // The handler was attached in the same tick the promise was created, so
    // this rejection is caught rather than crashing the process. Vitest fails a
    // run on an unhandled rejection, so this test would also go red without a
    // single expectation if that ever regressed.
    expect(consoleError).toHaveBeenCalledOnce();
    expect(String(consoleError.mock.calls[0]?.[1])).not.toContain("@");
  });

  it("swallows a failure that lands BEFORE the floor, and still waits it out", async () => {
    // Only the branch with a real account can fail this way. Letting it through
    // as a 500 would move the oracle from the clock to the status code.
    const work = async () => {
      throw new Error("smtp: mailbox unavailable");
    };

    const pending = withResponseTimeFloor({
      request: makeRequest(),
      floorMs: FLOOR_MS,
      work,
    });
    const watched = watch(pending);

    await vi.advanceTimersByTimeAsync(FLOOR_MS - 1);
    expect(watched.settled()).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("treats a synchronous throw from the work exactly like a rejection", async () => {
    const work = () => {
      throw new Error("resolved a use case that is not registered");
    };

    const pending = withResponseTimeFloor({
      request: makeRequest(),
      floorMs: FLOOR_MS,
      work,
    });
    const watched = watch(pending);

    await vi.advanceTimersByTimeAsync(FLOOR_MS - 1);
    // A synchronous throw escaping past the floor would answer early, which is
    // itself a timing signal.
    expect(watched.settled()).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledOnce();
  });
});

describe("authEmailResponseFloorMs", () => {
  const original = process.env.AUTH_EMAIL_RESPONSE_FLOOR_MS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AUTH_EMAIL_RESPONSE_FLOOR_MS;
    } else {
      process.env.AUTH_EMAIL_RESPONSE_FLOOR_MS = original;
    }
  });

  it("defaults to half a second in a deployment", () => {
    // `build-test-app.ts` lowers this so the hermetic suites are not eight
    // seconds of sleeping. This pins the value a deployment actually gets, so
    // the test-only number cannot quietly become the real one.
    delete process.env.AUTH_EMAIL_RESPONSE_FLOOR_MS;

    expect(AUTH_EMAIL_RESPONSE_FLOOR_DEFAULT_MS).toBe(500);
    expect(authEmailResponseFloorMs()).toBe(500);
  });

  it("falls back rather than trusting a nonsense or negative value", () => {
    process.env.AUTH_EMAIL_RESPONSE_FLOOR_MS = "half a second";
    expect(authEmailResponseFloorMs()).toBe(500);

    // A typo must not silently disable a security control. An explicit 0 still
    // means 0 — someone who types it has said what they mean.
    process.env.AUTH_EMAIL_RESPONSE_FLOOR_MS = "-1000";
    expect(authEmailResponseFloorMs()).toBe(500);

    process.env.AUTH_EMAIL_RESPONSE_FLOOR_MS = "0";
    expect(authEmailResponseFloorMs()).toBe(0);
  });
});
