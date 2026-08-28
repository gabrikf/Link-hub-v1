import type { Page } from "@playwright/test";
import { API_URL, TOKENS_KEY, uniqueSuffix } from "../support/accounts";
import { expect, test } from "../support/fixtures";

/**
 * JOURNEY 1 — "log in and register myself easily with my resume."
 *
 * Everything here goes through the real form. `apiLogin` exists for *setup* in
 * every other journey precisely because this file is the one that proves the
 * form itself works; reaching for it here would test nothing.
 *
 * EVERY TEST MINTS ITS OWN ACCOUNT, and that is not over-caution. A shared
 * account held in a module-level constant looks fine and is quietly broken:
 * Playwright starts a FRESH WORKER after a failing test, the spec module is
 * re-imported, `uniqueSuffix()` runs again, and every test after the first
 * failure points at an email that was never registered. The whole file then
 * reports red for a reason that has nothing to do with the product. Registering
 * inline costs ~1.5s per test and cannot drift.
 */

type Account = {
  name: string;
  login: string;
  email: string;
  password: string;
};

/** The database is never reset between nightly runs, hence the suffix. */
function newAccount(tag: string): Account {
  const suffix = uniqueSuffix();
  return {
    name: "E2E Journey Dev",
    login: `e2e-${tag}-${suffix}`,
    email: `e2e.${tag}.${suffix}@linkhub.local`,
    password: "e2e-password-1",
  };
}

/**
 * `reportError` in apps/web console.errors EVERY handled failure while
 * `import.meta.env.DEV` is true, and the dev server the suite runs against is
 * exactly that. So a 401 login or a 409 register — the cases this file asserts
 * on purpose — always leave an `[auth.login]` / `[auth.register]` line behind.
 * That is instrumentation, not a defect.
 */
const EXPECTED_AUTH_REPORTS = /^\[auth\.(login|register)\]/;

/**
 * Chrome logs its OWN line for every 4xx it fetches, with no URL in the text.
 * A brand-new account has no resume yet and `GET /me/resume` answers 404 by
 * design (`useMyResumeQuery` treats it as "none" and calls `reportHandled`), so
 * the dashboard of a just-registered user always carries one of these.
 *
 * Dropping it blind would blind the suite to every other 4xx, so the tests that
 * drop it also assert `guard.badRequests` names that one request and nothing
 * else. The pattern lives here rather than in `support/fixtures.ts` for exactly
 * that reason: it is only safe next to that second assertion.
 */
const BROWSER_RESOURCE_LOG = /^Failed to load resource:/;

/**
 * Hardcoding the port here made this allowlist silently stop matching the moment
 * the api ran anywhere but 3333 — which it does whenever another project owns
 * that port. The 404 then read as an unexpected failing request and took four
 * otherwise-passing tests down with it. Derive it from the configured api URL.
 */
const DOCUMENTED_EMPTY_RESUME_404 = `GET ${API_URL}/me/resume — HTTP 404`;

function unexpectedErrors(errors: string[]): string[] {
  return errors.filter(
    (message) =>
      !EXPECTED_AUTH_REPORTS.test(message) && !BROWSER_RESOURCE_LOG.test(message),
  );
}

/**
 * The dashboard of an account with no resume. Asserts the ONLY failing request
 * is the documented empty-resume 404 — which is what earns the right to ignore
 * Chrome's console line for it.
 */
function expectOnlyEmptyResumeNoise(guard: {
  errors: string[];
  badRequests: string[];
}): void {
  expect(
    guard.badRequests.filter((entry) => entry !== DOCUMENTED_EMPTY_RESUME_404),
    "failing requests on the dashboard beyond the documented empty-resume 404",
  ).toEqual([]);
  expect(unexpectedErrors(guard.errors), "console errors on the dashboard").toEqual([]);
}

/**
 * Open the auth page and let it settle before touching it.
 *
 * WHY THE EXTRA WAIT: this suite runs against the Vite DEV server, which
 * transforms modules on demand and issues a FULL PAGE RELOAD the first time a
 * fresh worker pulls in a dependency it has not optimized yet. Landing in the
 * middle of a half-filled form, that reload wipes the fields and the submit
 * never happens — a flake that looks exactly like a broken register form.
 * Letting the network go quiet first moves the reload to before we type.
 */
async function gotoAuthPage(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Register", exact: true })).toBeVisible();
}

/** Fills and submits the register tab. Leaves the page signed in on /dashboard. */
async function registerThroughForm(page: Page, account: Account): Promise<void> {
  await gotoAuthPage(page);
  await page.getByRole("button", { name: "Register", exact: true }).click();

  await page.getByLabel("Name", { exact: true }).fill(account.name);
  await page.getByLabel("Login", { exact: true }).fill(account.login);
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  // The persona picker is optional and most signups leave it alone — that is
  // the path that must not 400 on an omitted value.
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
}

/**
 * Registration signs the user in immediately, so any test about the LOGIN form
 * has to hand the session back first. The nav's logout is the way a real user
 * does that; on the desktop viewport it is the icon button labelled "Logout".
 */
async function logOut(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/$/);
  // Signing out must land on a login form that is actually usable, not just on
  // the right URL — and asserting it here means the tests that follow start
  // from a mounted form instead of racing one.
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
}

test("@responsive a new developer registers through the form and lands signed in", async ({
  page,
  guard,
}) => {
  await registerThroughForm(page, newAccount("signup"));

  // "Landed signed in" is the dashboard rendering plus a token in the same
  // localStorage key the app itself reads — not just a URL change.
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const tokens = await page.evaluate((key) => localStorage.getItem(key), TOKENS_KEY);
  expect(tokens, "auth tokens after registering").not.toBeNull();

  expectOnlyEmptyResumeNoise(guard);
});

test("a too-short password is refused with a visible message, before any request", async ({
  page,
  guard,
}) => {
  const account = newAccount("short");
  await gotoAuthPage(page);
  await page.getByRole("button", { name: "Register", exact: true }).click();

  await page.getByLabel("Name", { exact: true }).fill(account.name);
  await page.getByLabel("Login", { exact: true }).fill(account.login);
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  // One character under the schema's minimum of 6.
  await page.getByLabel("Password", { exact: true }).fill("12345");
  await page.getByRole("button", { name: "Create account" }).click();

  // The exact string from `createUserSchemaInput` — asserting the message the
  // user reads, not merely that the submit was blocked somewhere.
  await expect(
    page.getByText("Password must be at least 6 characters"),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  // A client-side resolver means nothing should have left the browser at all.
  expect(
    guard.badRequests.filter((entry) => entry.includes("/auth/register")),
    "register calls made despite a client-side validation failure",
  ).toEqual([]);
  expect(unexpectedErrors(guard.errors), "console errors on the register form").toEqual([]);
});

test("a malformed email is refused with a visible message", async ({ page, guard }) => {
  const account = newAccount("bademail");
  await gotoAuthPage(page);
  await page.getByRole("button", { name: "Register", exact: true }).click();

  await page.getByLabel("Name", { exact: true }).fill(account.name);
  await page.getByLabel("Login", { exact: true }).fill(account.login);
  // NOTE: the field is `type="email"` on a form with no `noValidate`, so the
  // browser intercepts anything IT considers malformed and shows a NATIVE
  // bubble that no accessible selector can reach — zod never gets a turn.
  // "user@host" clears that native check (which does not require a TLD) while
  // still failing the schema, which is what makes the app's own message
  // observable at all.
  await page.getByLabel("Email", { exact: true }).fill("user@host");
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Invalid email format")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  expect(unexpectedErrors(guard.errors), "console errors on the register form").toEqual([]);
});

test("registering an email that already exists shows the conflict to the user", async ({
  page,
  guard,
}) => {
  const account = newAccount("dup");
  await registerThroughForm(page, account);
  await logOut(page);

  // Same email, a different login, so the only thing the api can object to is
  // the duplicate email.
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(account.name);
  await page.getByLabel("Login", { exact: true }).fill(`${account.login}-again`);
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();

  // `DuplicateResourceError` renders as "User with email '...' already exists".
  // Matching the tail keeps the assertion off the address itself.
  await expect(page.getByRole("alert").filter({ hasText: "already exists" })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  const tokens = await page.evaluate((key) => localStorage.getItem(key), TOKENS_KEY);
  expect(tokens, "auth tokens after a rejected registration").toBeNull();

  // FINDING — left failing on purpose. `RegisterForm`'s submit handler is
  // `handleSubmit(async (data) => { await onSubmit(data); reset(); })` and
  // `onSubmit` is `registerMutation.mutateAsync(...)`. react-hook-form re-throws
  // whatever the valid-handler rejects with, so every rejected registration
  // escapes as an UNHANDLED PROMISE REJECTION whose message carries the user's
  // email address — which Sentry's global handler captures in production even
  // though `sendDefaultPii` is false. The screen renders correctly; it renders
  // correctly *while throwing*, which this repo's own guard calls a failure.
  expect(unexpectedErrors(guard.errors), "console errors beyond the reported 409").toEqual([]);
});

test("the new account signs in again through the login form", async ({ page, guard }) => {
  const account = newAccount("login");
  await registerThroughForm(page, account);
  await logOut(page);

  // "login" is the default tab, but clicking it keeps the journey readable and
  // survives a future change of default.
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  expectOnlyEmptyResumeNoise(guard);
});

test("a wrong password shows an error and leaves the user signed out", async ({
  page,
  guard,
}) => {
  const account = newAccount("wrongpw");
  await registerThroughForm(page, account);
  await logOut(page);

  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid email or password" }),
  ).toBeVisible();

  // "Shows an error" is only half the claim. The other half is that no session
  // was created: still on the auth page, still no token in localStorage.
  await expect(page).toHaveURL(/\/$/);
  const tokens = await page.evaluate((key) => localStorage.getItem(key), TOKENS_KEY);
  expect(tokens, "auth tokens after a failed sign-in").toBeNull();

  // FINDING — left failing on purpose, same shape as the duplicate-email case.
  // `LoginForm` hands `loginMutation.mutateAsync` straight to `handleSubmit`, so
  // a rejected sign-in escapes as an unhandled promise rejection. A wrong
  // password is the most common failure in the whole app, so this is the
  // rejection users trip most often.
  expect(unexpectedErrors(guard.errors), "console errors beyond the reported 401").toEqual([]);
});

test("the session survives a full page reload", async ({ page, guard }) => {
  await registerThroughForm(page, newAccount("reload"));

  // A reload throws away every in-memory store. Tokens live in localStorage and
  // the user in a persisted zustand slice, so the dashboard must come back
  // signed in rather than bouncing to "/".
  await page.reload();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  expectOnlyEmptyResumeNoise(guard);
});

test("the resume import entry point opens and gates its own input", async ({
  page,
  guard,
}) => {
  // A brand-new account is exactly the state this dialog is designed for: no
  // resume yet, so nothing it offers to import can collide with existing data.
  await registerThroughForm(page, newAccount("import"));

  await page.getByRole("button", { name: "Import resume file" }).click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Fill profile from your resume" }),
  ).toBeVisible();

  // The gate that protects the paid call: with nothing supplied the parse
  // button is dead, so an empty dialog can never spend an AI credit.
  const parseButton = dialog.getByRole("button", { name: "Parse with AI" });
  await expect(parseButton).toBeDisabled();

  // Under the 20-character floor shared by the client (`canParse`) and the api
  // (`MIN_RESUME_TEXT_LENGTH`) it stays dead.
  const pasteBox = dialog.getByLabel("Paste resume text");
  await pasteBox.fill("too short");
  await expect(parseButton).toBeDisabled();

  await pasteBox.fill(
    "Senior TypeScript engineer with eight years building Node and React products.",
  );
  await expect(parseButton).toBeEnabled();

  // A real user's other way in is the file picker. The input is `visually`
  // hidden with no aria-label, so its only accessible name is the text of the
  // label wrapping it — and that text is REPLACED by the chosen filename once a
  // file is picked. So it is addressable by name exactly once, before selection.
  // Supplying the bytes in memory keeps the suite free of a fixture on disk.
  await dialog.getByLabel(/Click to upload a PDF, DOCX or TXT/).setInputFiles({
    name: "e2e-resume.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Senior TypeScript engineer with eight years building Node and React products.",
    ),
  });
  await expect(dialog.getByText("e2e-resume.txt")).toBeVisible();

  // "Skip for now" is the documented exit; a user who backs out must land on a
  // working dashboard, not a locked overlay.
  await dialog.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  expectOnlyEmptyResumeNoise(guard);
});

test("the AI parse turns a pasted resume into a reviewable profile", async ({
  page,
  guard,
}) => {
  // BOUNDARY. `POST /me/resume/ai-import/parse` sends the whole resume to
  // OpenAI on a live, billed key and is metered by `aiQuotaGuard`. A nightly
  // suite that pressed this button would spend real money every iteration and
  // eat the user's own daily quota, so the last leg of the journey is opted
  // into explicitly rather than run by default. Everything the app can be held
  // to *without* paying is asserted in the test above.
  test.skip(
    !process.env.E2E_ALLOW_AI_SPEND,
    "Costs a live OpenAI call on a billed key and consumes the user's daily AI " +
      "quota. Run with E2E_ALLOW_AI_SPEND=1 to include it.",
  );

  await registerThroughForm(page, newAccount("aiparse"));
  await page.getByRole("button", { name: "Import resume file" }).click();

  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Paste resume text")
    .fill(
      "Ana Silva — Senior Backend Engineer. 8 years of experience. " +
        "Skills: TypeScript, Node.js, PostgreSQL, Docker. " +
        "Acme Corp, Senior Backend Engineer, 2020 to present, Sao Paulo, Brazil. " +
        "Built payment services handling millions of requests per day.",
    );
  await dialog.getByRole("button", { name: "Parse with AI" }).click();

  // The dialog's own copy promises 10-30 seconds; the config's 10s expect
  // timeout would fail on a perfectly healthy parse.
  await expect(
    dialog.getByRole("button", { name: "Apply selected to my profile" }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(dialog.getByText("Skills")).toBeVisible();

  expect(unexpectedErrors(guard.errors), "console errors after an AI parse").toEqual([]);
});
