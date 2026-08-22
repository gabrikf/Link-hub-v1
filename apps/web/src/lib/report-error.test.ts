import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The no-DSN contract.
 *
 * `VITE_SENTRY_DSN` is deliberately optional: `npm run dev` and `npm test` run
 * without it, and every one of the ~50 call sites added across the app fires
 * through these two functions regardless. So the property that actually has to
 * hold is the boring one — with no DSN configured, reporting is inert. It must
 * not throw, and it must not reach the network.
 *
 * The second property is the reason there are two functions at all:
 * `reportHandled` is for expected, already-handled paths (blocked localStorage,
 * an absent clipboard, a 404 mapped to "empty"). It may leave a breadcrumb for
 * context, but it must NEVER raise an event — those are the free-tier quota,
 * and drowning it in non-failures is exactly what buries the real bugs.
 */

const captureException = vi.fn();
const addBreadcrumb = vi.fn();
const init = vi.fn();
const withScope = vi.fn((callback: (scope: unknown) => void) => {
  callback({
    setTag: vi.fn(),
    setContext: vi.fn(),
    setUser: vi.fn(),
  });
});

vi.mock("@sentry/react", () => ({
  init: (...args: unknown[]) => init(...args),
  captureException: (...args: unknown[]) => captureException(...args),
  addBreadcrumb: (...args: unknown[]) => addBreadcrumb(...args),
  withScope: (callback: (scope: unknown) => void) => withScope(callback),
}));

async function loadReporter() {
  // Reset first: the module latches `enabled` at init time, so each test needs
  // its own instance rather than one shared across the file.
  vi.resetModules();
  return import("./report-error");
}

beforeEach(() => {
  // No DSN is the default for dev and CI. Stated explicitly so the test does
  // not silently start passing for the wrong reason if a .env appears.
  vi.stubEnv("VITE_SENTRY_DSN", "");
  captureException.mockClear();
  addBreadcrumb.mockClear();
  init.mockClear();
  withScope.mockClear();
  // Both functions log in dev; keep the suite output readable.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("without a DSN", () => {
  it("initialises no Sentry client", async () => {
    const { initErrorReporting } = await loadReporter();

    initErrorReporting();

    expect(init).not.toHaveBeenCalled();
  });

  it("reportError neither throws nor sends anything", async () => {
    const { initErrorReporting, reportError } = await loadReporter();
    initErrorReporting();

    expect(() =>
      reportError(new Error("boom"), {
        action: "test.report-error",
        extra: { attempt: 1 },
      }),
    ).not.toThrow();

    expect(captureException).not.toHaveBeenCalled();
    expect(withScope).not.toHaveBeenCalled();
  });

  it("reportHandled neither throws nor sends anything", async () => {
    const { initErrorReporting, reportHandled } = await loadReporter();
    initErrorReporting();

    expect(() =>
      reportHandled(new Error("storage blocked"), {
        action: "test.report-handled",
      }),
    ).not.toThrow();

    expect(addBreadcrumb).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("tolerates non-Error values without throwing", async () => {
    const { reportError, reportHandled } = await loadReporter();

    expect(() => reportError("a string", { action: "test.string" })).not.toThrow();
    expect(() => reportError(undefined, { action: "test.undefined" })).not.toThrow();
    expect(() => reportHandled({ code: 42 }, { action: "test.object" })).not.toThrow();

    expect(captureException).not.toHaveBeenCalled();
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it("reports before init without throwing", async () => {
    // Call sites in module-scope code (theme, stored tokens) can run before
    // `initErrorReporting()` does.
    const { reportError, reportHandled } = await loadReporter();

    expect(() => reportError(new Error("early"), { action: "test.early" })).not.toThrow();
    expect(() =>
      reportHandled(new Error("early"), { action: "test.early-handled" }),
    ).not.toThrow();
  });
});

describe("with a DSN", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/1");
  });

  it("reportHandled leaves a breadcrumb and never raises an event", async () => {
    const { initErrorReporting, reportHandled } = await loadReporter();
    initErrorReporting();

    reportHandled(new Error("clipboard unavailable"), {
      action: "profile.share-copy",
    });

    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    // The whole point of the two-function split.
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reportError raises exactly one event, tagged with the action", async () => {
    const { initErrorReporting, reportError } = await loadReporter();
    initErrorReporting();

    reportError(new Error("upload failed"), { action: "upload.image" });

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(addBreadcrumb).not.toHaveBeenCalled();
  });

  it("keeps reportHandled event-free even when many fire", async () => {
    const { initErrorReporting, reportHandled } = await loadReporter();
    initErrorReporting();

    for (let index = 0; index < 25; index += 1) {
      reportHandled(new Error("storage blocked"), { action: "theme.persist" });
    }

    expect(addBreadcrumb).toHaveBeenCalledTimes(25);
    expect(captureException).not.toHaveBeenCalled();
  });
});
