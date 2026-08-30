import { ACCOUNTS } from "../support/accounts";
import { developerTest, expect, test } from "../support/fixtures";

/**
 * The canary. If this file fails, nothing else in the suite means anything —
 * the app is not reachable, the seed is missing, or auth broke. Every other
 * journey assumes these three facts.
 */
test("the public profile of a seeded developer renders", async ({ page, guard }) => {
  await page.goto(`/${ACCOUNTS.developer.login}`);
  await expect(page.getByRole("heading").first()).toBeVisible();
  expect(guard.errors, "console errors on the public profile").toEqual([]);
});

developerTest("a signed-in developer reaches the dashboard", async ({ page, guard }) => {
  await page.goto("/dashboard");

  /**
   * Asserting only `toHaveURL(/dashboard/)` here USED TO PASS VACUOUSLY: the
   * dashboard gates on `getAuthTokens() && userInfo`, and with a token-only
   * session it redirects to `/` — but the URL assertion matched on its first
   * poll, before the redirect effect ran. So this waits for content that only
   * renders once the guard is actually satisfied, and only then re-checks the
   * URL, which by that point has had every chance to bounce.
   */
  await expect(page.getByRole("navigation").or(page.getByRole("main")).first()).toBeVisible();
  await expect(page.getByText(/@/).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/dashboard/);

  expect(guard.errors, "console errors on the dashboard").toEqual([]);
});
