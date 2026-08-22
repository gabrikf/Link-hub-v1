import { test as base, expect, type Page } from "@playwright/test";
import { STORAGE_STATE } from "./accounts";

type ConsoleGuard = {
  /** Console errors seen so far on this page, excluding deliberately ignored noise. */
  errors: string[];
  /** Failed requests (4xx/5xx or network failure) seen so far. */
  badRequests: string[];
};

/**
 * Noise that is not a defect. Keep this list SHORT and justified — every entry
 * is a class of real bug the suite can no longer see.
 */
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /\[vite\] connect(ing|ed)/i,
];

/**
 * A journey that renders correctly while throwing in the console is not a pass.
 * This repo's own visual runner enforces the same rule; the e2e suite would be
 * strictly weaker than the camera without it.
 */
export function watchPage(page: Page): ConsoleGuard {
  const guard: ConsoleGuard = { errors: [], badRequests: [] };
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    guard.errors.push(text);
  });
  page.on("pageerror", (error) => guard.errors.push(`uncaught: ${error.message}`));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    // Aborted requests are normal when a component unmounts mid-flight.
    if (/ERR_ABORTED/.test(failure)) return;
    guard.badRequests.push(`${request.method()} ${request.url()} — ${failure}`);
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    guard.badRequests.push(`${response.request().method()} ${response.url()} — HTTP ${response.status()}`);
  });
  return guard;
}

export const test = base.extend<{ guard: ConsoleGuard }>({
  guard: async ({ page }, use) => {
    const guard = watchPage(page);
    await use(guard);
  },
});

export const recruiterTest = test.extend({
  storageState: STORAGE_STATE.recruiter,
});

export const developerTest = test.extend({
  storageState: STORAGE_STATE.developer,
});

export { expect };

/**
 * Sign a page in as an arbitrary account without a storageState file.
 *
 * The two `storageState` projects cover the common roles, but journeys that
 * mutate data each need their OWN account (see JOURNEY_ACCOUNTS) and minting a
 * storage-state file per account would mean a setup project per journey. This
 * injects the same localStorage shape before any app code runs instead.
 *
 * Call it BEFORE the first `page.goto`.
 */
export async function loginAs(
  page: Page,
  account: { email: string; password: string },
): Promise<void> {
  const { apiLogin } = await import("./api");
  const { TOKENS_KEY, USER_INFO_KEY } = await import("./accounts");
  const tokens = await apiLogin(account.email, account.password);
  if (!tokens.user) {
    throw new Error(
      `login for ${account.email} returned no user object — a token-only session ` +
        "cannot reach any dashboard route. Did the auth contract change?",
    );
  }
  await page.addInitScript(
    (entries: [string, string][]) => {
      for (const [key, value] of entries) window.localStorage.setItem(key, value);
    },
    [
      [
        TOKENS_KEY,
        JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }),
      ],
      [USER_INFO_KEY, JSON.stringify({ state: { userInfo: tokens.user }, version: 0 })],
    ] as [string, string][],
  );
}
