import type { Page } from "@playwright/test";
import { API_URL, TOKENS_KEY, USER_INFO_KEY, uniqueSuffix } from "../support/accounts";
import { expect, test } from "../support/fixtures";
import {
  deleteMailFor,
  extractLinkPath,
  extractToken,
  mailpitReachable,
  MAILPIT_HINT,
  waitForMail,
} from "../support/mail";

/**
 * JOURNEY 6 — "prove I own this address before you let me in."
 *
 * The flows this covers were added in one change and had no end-to-end test at
 * all: registration stopped minting a session, verification became the thing
 * that does, and a password reset became reachable from the sign-in form. Every
 * layer had unit and HTTP tests; nothing walked the whole path through a real
 * browser against a real API and a real delivered email.
 *
 * THE SECURITY PROPERTY THIS FILE EXISTS FOR, in one line: registering must
 * NOT sign you in. `createUserSchemaOutput` no longer carries tokens, and the
 * first test asserts the absence of a session in the two storage keys the app
 * itself reads — because "the screen says check your inbox" is a rendering
 * claim, and the thing that matters is whether a credential was issued.
 *
 * NEEDS MAILPIT. The token has to come out of a delivered message; reading it
 * from the database or a test seam would prove the link exists, not that it
 * arrives and works. See `support/mail.ts` for the probe and the skip, and for
 * why an empty mailbox is usually `MAIL_TRANSPORT=log` rather than a product
 * failure.
 *
 * ACCOUNT CLEANUP — WHAT IS AND IS NOT POSSIBLE HERE. Each run uses a fresh
 * `uniqueSuffix()` address, which is the pattern `support/accounts.ts`
 * establishes and the reason journey 1 is re-runnable against a database that
 * is never reset. The rows themselves are NOT deleted, and cannot be from a
 * journey: the API exposes no account-deletion endpoint, and reaching around it
 * into Postgres would make this suite depend on a schema it does not own. The
 * mail those accounts generated IS cleaned up, per address.
 */

const PASSWORD = "journey6-password-1";
const NEW_PASSWORD = "journey6-password-2";

const VERIFICATION_SUBJECT = /confirm your crafthub email/i;
const RESET_SUBJECT = /reset your crafthub password/i;

type Account = {
  name: string;
  login: string;
  email: string;
  password: string;
};

function newAccount(tag: string): Account {
  const suffix = uniqueSuffix();
  return {
    name: "E2E Verify Dev",
    login: `e2e-v-${tag}-${suffix}`,
    email: `e2e.v-${tag}.${suffix}@crafthub.local`,
    password: PASSWORD,
  };
}

/**
 * Mirrors journey 1's `EXPECTED_AUTH_REPORTS`. `reportError` console.errors
 * every handled failure while `import.meta.env.DEV` is true, and this file
 * deliberately drives two failures: a login against an unverified account and,
 * later, a login with a retired password.
 */
const EXPECTED_AUTH_REPORTS = /^\[auth\.(login|register|resend-verification)\]/;
const BROWSER_RESOURCE_LOG = /^Failed to load resource:/;

function unexpectedErrors(errors: string[]): string[] {
  return errors.filter(
    (message) =>
      !EXPECTED_AUTH_REPORTS.test(message) && !BROWSER_RESOURCE_LOG.test(message),
  );
}

/** The two keys that together ARE a session — see `lib/session.ts`. */
async function readStoredSession(page: Page) {
  return page.evaluate(
    ([tokensKey, userKey]) => ({
      tokens: localStorage.getItem(tokensKey),
      userInfo: localStorage.getItem(userKey),
    }),
    [TOKENS_KEY, USER_INFO_KEY] as const,
  );
}

async function gotoAuthPage(page: Page): Promise<void> {
  await page.goto("/");
  // Same reason as journey 1: the Vite dev server can issue a full reload the
  // first time a worker pulls an unoptimised dependency, and landing mid-form
  // wipes the fields.
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("button", { name: "Register", exact: true }),
  ).toBeVisible();
}

/**
 * Signs out through the nav, at either viewport.
 *
 * Below `md` the nav items and the Logout button live inside a collapsed
 * hamburger panel and are not in the DOM until it is opened — so the desktop
 * one-liner times out on the `mobile` project with a message that says only
 * "waiting for Logout", which reads like the button vanished. Opening the menu
 * first is what a person does, and `shared-components/top-bar-nav.tsx` labels
 * the toggle `nav.openMenu` for exactly this reason.
 */
async function logOut(page: Page): Promise<void> {
  const hamburger = page.getByRole("button", { name: "Open menu" });

  if (await hamburger.isVisible()) {
    await hamburger.click();
  }

  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function registerThroughForm(page: Page, account: Account): Promise<void> {
  await gotoAuthPage(page);
  await page.getByRole("button", { name: "Register", exact: true }).click();

  await page.getByLabel("Name", { exact: true }).fill(account.name);
  await page.getByLabel("Login", { exact: true }).fill(account.login);
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
}

/*
 * The whole file is skipped, once, with the reason printed — rather than each
 * test failing on a timeout that says nothing.
 */
test.beforeAll(async () => {
  test.skip(
    !(await mailpitReachable()),
    `journey 6 needs Mailpit to read the verification and reset links. ${MAILPIT_HINT}`,
  );
});

/* ========================================================================== */
/* 1. Register — an account, and deliberately NOT a session                    */
/* ========================================================================== */

test("@responsive registering says check your inbox and creates no session", async ({
  page,
  guard,
}) => {
  const account = newAccount("signup");

  try {
    await registerThroughForm(page, account);

    await expect(
      page.getByRole("heading", { name: "Check your inbox" }),
    ).toBeVisible();
    await expect(page.getByText(account.email, { exact: false })).toBeVisible();

    // THE POINT OF THE FEATURE. Not "the URL stayed on /", which would also be
    // true of a bug that stored tokens and simply failed to navigate.
    const session = await readStoredSession(page);
    expect(session.tokens, "auth tokens after registering").toBeNull();
    expect(
      session.userInfo && JSON.parse(session.userInfo).state?.userInfo,
      "persisted userInfo after registering",
    ).toBeFalsy();

    // The guard on `/dashboard` must agree, from a cold load.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();

    // And the message really was sent, to the address that was typed.
    const message = await waitForMail(account.email, VERIFICATION_SUBJECT);
    expect(
      message.To.some((to) => to.Address === account.email),
      "the verification mail is addressed to the registered account",
    ).toBe(true);

    expect(unexpectedErrors(guard.errors), "console errors while registering").toEqual([]);
  } finally {
    await deleteMailFor(account.email);
  }
});

/* ========================================================================== */
/* 2. Sign in before verifying — the "confirm your email" branch               */
/* ========================================================================== */

test("@responsive signing in before verifying explains why, and offers a new link", async ({
  page,
}) => {
  const account = newAccount("unverified");

  try {
    await registerThroughForm(page, account);
    await expect(
      page.getByRole("heading", { name: "Check your inbox" }),
    ).toBeVisible();
    await waitForMail(account.email, VERIFICATION_SUBJECT);

    await page.getByRole("button", { name: "Back to login" }).click();
    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    /*
     * A 403 with the CORRECT password is an unfinished signup, not a failed
     * sign-in, and the app branches on the error CODE rather than its text —
     * so this assertion is what proves the branch survives translation.
     */
    await expect(
      page.getByRole("heading", { name: "Confirm your email to continue" }),
    ).toBeVisible();

    // The opposite instruction must NOT be on screen at the same time.
    await expect(page.getByText("Invalid email or password")).toHaveCount(0);

    // Still signed out.
    const session = await readStoredSession(page);
    expect(session.tokens, "auth tokens after an unverified sign-in").toBeNull();
  } finally {
    await deleteMailFor(account.email);
  }
});

/* ========================================================================== */
/* 3. Verify through the real emailed link — this is what mints the session    */
/* ========================================================================== */

test("opening the emailed link verifies the address and signs the user in", async ({
  page,
  guard,
}) => {
  const account = newAccount("verify");

  try {
    await registerThroughForm(page, account);
    await expect(
      page.getByRole("heading", { name: "Check your inbox" }),
    ).toBeVisible();

    const message = await waitForMail(account.email, VERIFICATION_SUBJECT);
    const linkPath = extractLinkPath(message, "/verify-email");
    const token = extractToken(message, "/verify-email");

    await page.goto(linkPath);

    // Verifying signs you in, so the dashboard is the destination.
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    const session = await readStoredSession(page);
    expect(session.tokens, "auth tokens after verifying").not.toBeNull();

    /*
     * THE TOKEN MUST NOT SURVIVE IN THE ADDRESS BAR. It is a bearer credential
     * for one account; left there it reaches history, screenshots and — for
     * anything the page requests before the strip — the `Referer` header.
     */
    expect(page.url(), "the verification token is stripped from the URL").not.toContain(
      token,
    );
    expect(page.url()).not.toContain("token=");

    // Nor may it be rendered anywhere on the page.
    const body = await page.locator("body").innerText();
    expect(body, "the verification token is never rendered").not.toContain(token);

    // Single use: replaying the same link must not mint a second session.
    const replay = await page.request.post(`${API_URL}/auth/verify-email`, {
      data: { token },
      failOnStatusCode: false,
    });
    expect(
      replay.status(),
      "a verification token must be rejected on replay",
    ).toBeGreaterThanOrEqual(400);

    expect(unexpectedErrors(guard.errors), "console errors while verifying").toEqual([]);
  } finally {
    await deleteMailFor(account.email);
  }
});

/* ========================================================================== */
/* 4. Forgot password — reset, then the old password must be dead              */
/* ========================================================================== */

test("@responsive a password reset retires the old password and admits the new one", async ({
  page,
}) => {
  const account = newAccount("reset");

  try {
    /* --- an account that can actually sign in, via the real link --------- */
    await registerThroughForm(page, account);
    const verification = await waitForMail(account.email, VERIFICATION_SUBJECT);
    await page.goto(extractLinkPath(verification, "/verify-email"));
    await expect(page).toHaveURL(/\/dashboard/);

    // Sign out through the UI so the reset starts from a real signed-out state.
    await logOut(page);

    /* --- ask for the link ------------------------------------------------ */
    await page.getByRole("button", { name: "Forgot your password?" }).click();
    await expect(
      page.getByRole("heading", { name: "Reset your password" }),
    ).toBeVisible();

    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await page.getByRole("button", { name: "Send reset link" }).click();

    /*
     * The confirmation is deliberately conditional — "IF this address has an
     * account" — because a definite one would answer, to anyone who asks,
     * whether an address is registered.
     */
    await expect(page.getByText(/we've sent a link/i)).toBeVisible();

    /* --- follow it ------------------------------------------------------- */
    const reset = await waitForMail(account.email, RESET_SUBJECT);
    const resetPath = extractLinkPath(reset, "/reset-password");
    const resetToken = extractToken(reset, "/reset-password");

    await page.goto(resetPath);
    await expect(
      page.getByRole("heading", { name: "Choose a new password" }),
    ).toBeVisible();

    expect(page.url(), "the reset token is stripped from the URL").not.toContain(
      resetToken,
    );
    const resetBody = await page.locator("body").innerText();
    expect(resetBody, "the reset token is never rendered").not.toContain(resetToken);

    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Update password" }).click();

    /*
     * Resetting mints NO session — the next screen is the sign-in form, saying
     * why. That is `resetPasswordSchemaOutput`'s contract and the reason
     * `features/auth/lib/auth-notice.ts` exists.
     */
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Password updated. Sign in with your new password.")).toBeVisible();
    const afterReset = await readStoredSession(page);
    expect(afterReset.tokens, "auth tokens after resetting").toBeNull();

    /* --- the old password is dead, the new one works --------------------- */
    // Asserted against the API, which is the only authority on a credential.
    const oldAttempt = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: account.email, password: PASSWORD },
      failOnStatusCode: false,
    });
    expect(
      oldAttempt.status(),
      "the password in use before the reset must be refused",
    ).toBeGreaterThanOrEqual(400);

    // The new one, through the form a person actually uses.
    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Single use, same as the verification token.
    const replay = await page.request.post(`${API_URL}/auth/reset-password`, {
      data: { token: resetToken, password: "journey6-password-3" },
      failOnStatusCode: false,
    });
    expect(
      replay.status(),
      "a reset token must be rejected on replay",
    ).toBeGreaterThanOrEqual(400);
  } finally {
    await deleteMailFor(account.email);
  }
});
