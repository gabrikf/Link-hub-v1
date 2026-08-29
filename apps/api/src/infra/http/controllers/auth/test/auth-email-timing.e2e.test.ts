/**
 * The two self-service auth email endpoints must not answer a registered
 * address any slower than an unknown one.
 *
 * `auth-password-reset.e2e.test.ts` and `auth-email-verification.e2e.test.ts`
 * already prove the status, body and headers are byte-identical across those
 * branches. They were, and the endpoint was still an account-existence oracle:
 * measured against the running API, `/auth/forgot-password` took ~9 ms for a
 * real account and ~2 ms for an unknown one with `MAIL_TRANSPORT=log`, and
 * ~50 ms vs ~2 ms with SMTP pointed at a local mail catcher. A real relay makes
 * it hundreds of milliseconds. The distributions never overlapped once, so a
 * single probe answered the question the response body refused to.
 *
 * WHY THE ASSERTIONS LOOK LOPSIDED
 *
 * Every floored assertion is a LOWER bound — "this took at least the floor" —
 * which a slow or contended machine can only make more true. The one upper
 * bound is on the schema-rejection path, and it is given an enormous margin
 * (a third of a floor that this file deliberately sets high) because it is
 * asserting the absence of a whole timer rather than a tight budget.
 *
 * This file raises the floor for itself alone. `build-test-app.ts` runs the
 * hermetic suites at 25 ms so they are not spent asleep; here a wall-clock
 * assertion needs room to be unambiguous. The ordering guarantees themselves
 * are pinned on fake timers in `utils/response-time-floor.test.ts`.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";
import { authEmailResponseFloorMs } from "../../../../config/app-config.js";

const JSON_HEADERS = { "content-type": "application/json" };

/** High enough that the measurement is not arguing with timer granularity. */
const TIMING_FLOOR_MS = 300;

/**
 * `setTimeout` is allowed to fire a tick early on some platforms, and
 * `performance.now()` is sampled either side of the whole inject round trip.
 * Two milliseconds of slack keeps that from being read as a missing floor,
 * while still being ~150x smaller than the gap the floor has to hide.
 */
const EARLY_FIRE_SLACK_MS = 2;

describe("Auth email endpoints answer in constant time", () => {
  let ctx: TestAppHandles;
  const original = process.env.AUTH_EMAIL_RESPONSE_FLOOR_MS;

  beforeAll(() => {
    process.env.AUTH_EMAIL_RESPONSE_FLOOR_MS = String(TIMING_FLOOR_MS);
  });

  afterAll(() => {
    if (original === undefined) {
      delete process.env.AUTH_EMAIL_RESPONSE_FLOOR_MS;
    } else {
      process.env.AUTH_EMAIL_RESPONSE_FLOOR_MS = original;
    }
  });

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  /** Round-trip one request, returning its response and how long it took. */
  async function timedPost(url: string, payload: Record<string, unknown>) {
    const startedAt = performance.now();
    const response = await ctx.app.inject({
      method: "POST",
      url,
      headers: JSON_HEADERS,
      payload,
    });
    return { response, elapsedMs: performance.now() - startedAt };
  }

  it("floors BOTH branches of /forgot-password, and floors them the same", async () => {
    await ctx.seedUser({
      email: "has-an-account@example.com",
      login: "has-an-account",
    });

    const known = await timedPost("/forgot-password", {
      email: "has-an-account@example.com",
    });
    const unknown = await timedPost("/forgot-password", {
      email: "nobody-at-all@example.com",
    });

    // The branch that really did the work: token, row, mail send.
    expect(known.response.statusCode).toBe(200);
    expect(ctx.mailProvider.sent).toHaveLength(1);
    expect(known.elapsedMs).toBeGreaterThanOrEqual(
      authEmailResponseFloorMs() - EARLY_FIRE_SLACK_MS,
    );

    // The branch that did almost nothing, and used to say so with its clock.
    expect(unknown.response.statusCode).toBe(200);
    expect(ctx.mailProvider.sent).toHaveLength(1);
    expect(unknown.elapsedMs).toBeGreaterThanOrEqual(
      authEmailResponseFloorMs() - EARLY_FIRE_SLACK_MS,
    );
  });

  it("floors BOTH branches of /resend-verification, and floors them the same", async () => {
    await ctx.seedUser({
      email: "unverified@example.com",
      login: "unverified",
      emailVerifiedAt: null,
    });

    const known = await timedPost("/resend-verification", {
      email: "unverified@example.com",
    });
    const unknown = await timedPost("/resend-verification", {
      email: "nobody-at-all@example.com",
    });

    expect(known.response.statusCode).toBe(200);
    expect(ctx.mailProvider.sent).toHaveLength(1);
    expect(known.elapsedMs).toBeGreaterThanOrEqual(
      authEmailResponseFloorMs() - EARLY_FIRE_SLACK_MS,
    );

    expect(unknown.response.statusCode).toBe(200);
    expect(ctx.mailProvider.sent).toHaveLength(1);
    expect(unknown.elapsedMs).toBeGreaterThanOrEqual(
      authEmailResponseFloorMs() - EARLY_FIRE_SLACK_MS,
    );
  });

  it("does NOT floor the schema-rejection path, which is not a secret", async () => {
    // "That is not an email address" is the same answer for everybody and costs
    // nothing to compute. Fastify rejects the body before the handler runs, so
    // the floor is never reached — and making a caller wait 300 ms to be told
    // they typed their address wrong would be a cost with no security to buy.
    const forgot = await timedPost("/forgot-password", { email: "nope" });
    const resend = await timedPost("/resend-verification", {
      email: "not-an-email",
    });

    expect(forgot.response.statusCode).toBe(400);
    expect(forgot.response.json().code).toBe("VALIDATION_ERROR");
    expect(forgot.elapsedMs).toBeLessThan(authEmailResponseFloorMs() / 3);

    expect(resend.response.statusCode).toBe(400);
    expect(resend.response.json().code).toBe("VALIDATION_ERROR");
    expect(resend.elapsedMs).toBeLessThan(authEmailResponseFloorMs() / 3);
  });

  it("still answers 200 when the mail transport is down", async () => {
    // Only an address with a real account ever reaches the send, so a 500 here
    // would tell a caller that address exists — the oracle, wearing a status
    // code instead of a stopwatch. The failure goes to the log and to Sentry.
    await ctx.seedUser({
      email: "has-an-account@example.com",
      login: "has-an-account",
    });
    ctx.mailProvider.failNextSend = new Error("smtp: connection refused");

    // The suppressed failure is reported to console.error in a non-production
    // process. Captured rather than silenced: an outage that leaves NO trace
    // would be the worse bug of the two.
    const reported = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const broken = await timedPost("/forgot-password", {
      email: "has-an-account@example.com",
    });
    const unknown = await timedPost("/forgot-password", {
      email: "nobody-at-all@example.com",
    });

    expect(broken.response.statusCode).toBe(200);
    expect(broken.response.body).toBe(unknown.response.body);
    expect(broken.elapsedMs).toBeGreaterThanOrEqual(
      authEmailResponseFloorMs() - EARLY_FIRE_SLACK_MS,
    );
    expect(ctx.mailProvider.sent).toHaveLength(0);
    expect(reported).toHaveBeenCalledOnce();

    reported.mockRestore();
  });
});
