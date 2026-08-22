import { ACCOUNTS } from "../support/accounts";
import { developerTest, expect, test } from "../support/fixtures";

/**
 * The canary. If this file fails, nothing else in the suite means anything —
 * the app is not reachable, the seed is missing, or auth broke. Every other
 * journey assumes these three facts.
 */
test("the public profile of a seeded developer renders", async ({ page, guard }) => {
  await page.goto(`/profile/${ACCOUNTS.developer.login}`);
  await expect(page.getByRole("heading").first()).toBeVisible();
  expect(guard.errors, "console errors on the public profile").toEqual([]);
});

developerTest("a signed-in developer reaches the dashboard", async ({ page, guard }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  expect(guard.errors, "console errors on the dashboard").toEqual([]);
});
