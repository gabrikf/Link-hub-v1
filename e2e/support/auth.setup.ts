import { test as setup } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ACCOUNTS, STORAGE_STATE, TOKENS_KEY, USER_INFO_KEY, WEB_URL, type Role } from "./accounts";
import { apiLogin } from "./api";

/**
 * Writes exactly the shape apps/web writes to localStorage, so the app boots
 * signed in without knowing this file exists. Storing anything else here would
 * be a fixture that drifts away from the real client.
 */
async function seedRole(role: Role) {
  const account = ACCOUNTS[role];
  const tokens = await apiLogin(account.email, account.password);
  if (!tokens.user) {
    throw new Error(
      `login for ${account.email} returned no user object — a token-only session ` +
        "cannot reach any dashboard route. Did the auth contract change?",
    );
  }
  const state = {
    cookies: [],
    origins: [
      {
        origin: WEB_URL,
        localStorage: [
          {
            name: TOKENS_KEY,
            value: JSON.stringify({
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
            }),
          },
          {
            // The zustand `persist` envelope, exactly as the store writes it.
            name: USER_INFO_KEY,
            value: JSON.stringify({ state: { userInfo: tokens.user }, version: 0 }),
          },
        ],
      },
    ],
  };
  const path = STORAGE_STATE[role];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

setup("authenticate recruiter", async () => {
  await seedRole("recruiter");
});

setup("authenticate developer", async () => {
  await seedRole("developer");
});
