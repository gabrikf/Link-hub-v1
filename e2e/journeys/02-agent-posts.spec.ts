import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Browser, Page } from "@playwright/test";
import {
  API_URL,
  JOURNEY_ACCOUNTS,
  uniqueSuffix,
} from "../support/accounts";
import { apiLogin } from "../support/api";
import { expect, loginAs, test, watchPage } from "../support/fixtures";

/**
 * JOURNEY 2 — "posts get written while I am coding".
 *
 * The two halves of this journey are played by two different actors and this
 * file keeps them apart on purpose:
 *
 * - The AGENT acts over the REAL MCP server (`apps/mcp`), spawned as a child
 *   process and driven over stdio JSON-RPC with a Personal Access Token. Not a
 *   raw `fetch` to the API: the thing that actually writes these posts in
 *   production is that server, and a test that skipped it would pass while the
 *   MCP layer was broken. `apps/mcp` has no tests of its own, so this is its
 *   only coverage.
 * - The HUMAN acts in the browser, and never sees a post appear by any route
 *   other than the review queue at `/dashboard/posts/review`.
 *
 * The PAT is minted the way a user mints one — through the settings UI — so the
 * test cannot pass on a token path no human could reach.
 */

const ACCOUNT = JOURNEY_ACCOUNTS.posts;

/**
 * TWO paths, deliberately not one. The WEB profile moved to the bare
 * `/{username}`, but the API's public endpoints did NOT — they are still
 * `/profile/{username}/...`. A single shared constant was briefly used for both
 * and every API call in this spec came back 404, which surfaced as
 * `roles.find is not a function` when a 404 body was parsed as an array.
 */
const PUBLIC_PROFILE = `/${ACCOUNT.login}`;
const API_PUBLIC_PROFILE = `/profile/${ACCOUNT.login}`;

/**
 * Every row this spec writes carries this marker, so `afterAll` can clean up
 * after itself without touching anything else on the account. The nightly loop
 * never resets the database.
 */
const MARKER = "e2e-journey-02";

// Playwright transpiles this file to CJS, so `__dirname` is the honest way to
// find the repo root regardless of the directory the runner was invoked from.
const REPO_ROOT = resolve(__dirname, "..", "..");

/* ------------------------------------------------------------------ *
 * The agent: the real MCP server over stdio
 * ------------------------------------------------------------------ */

type McpToolResult = {
  /** Concatenated text content of the tool result. */
  text: string;
  /** True when the MCP server reported the call as failed (`isError`). */
  isError: boolean;
};

type JsonRpcMessage = {
  id?: number;
  result?: unknown;
  error?: { message?: string };
};

type ToolCallResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

/**
 * `tsx` on the sources, not `dist/`: a stale build would silently make this
 * suite test code nobody ships any more. Falls back to the build only if the
 * dev dependency is missing.
 */
function resolveMcpCommand(): { command: string; args: string[] } {
  const tsx = join(REPO_ROOT, "node_modules", ".bin", "tsx");
  if (existsSync(tsx)) {
    return { command: tsx, args: [join("apps", "mcp", "src", "index.ts")] };
  }
  const built = join(REPO_ROOT, "apps", "mcp", "dist", "index.js");
  if (existsSync(built)) {
    return { command: "node", args: [built] };
  }
  throw new Error(
    "Cannot start the CraftHub MCP server: neither node_modules/.bin/tsx nor apps/mcp/dist/index.js exists. Run `npm install` (or `npm run build`) first.",
  );
}

function isToolCallResult(value: unknown): value is ToolCallResult {
  return typeof value === "object" && value !== null;
}

/**
 * Runs ONE MCP tool call in a freshly spawned server, then shuts it down.
 *
 * A process per call rather than a long-lived one because the server reads the
 * disclosure policy ONCE at startup and bakes it into its tool descriptions —
 * so a policy the human changes mid-journey has to be picked up by a new
 * connection, exactly as it would be in a real editor session restarted after
 * changing settings.
 */
async function callAgentTool(
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const { command, args: commandArgs } = resolveMcpCommand();
  const child = spawn(command, commandArgs, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      CRAFTHUB_API_URL: API_URL,
      CRAFTHUB_API_TOKEN: token,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const stderr: string[] = [];
  child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));

  const pending = new Map<number, (message: JsonRpcMessage) => void>();
  let buffer = "";

  child.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      const message = JSON.parse(line) as JsonRpcMessage;
      if (message.id === undefined) continue;
      const settle = pending.get(message.id);
      if (settle) {
        pending.delete(message.id);
        settle(message);
      }
    }
  });

  let nextId = 1;
  const request = (method: string, params: unknown): Promise<JsonRpcMessage> => {
    const id = nextId++;
    return new Promise<JsonRpcMessage>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectPromise(
          new Error(
            `MCP server did not answer '${method}' within 20s. stderr:\n${stderr.join("")}`,
          ),
        );
      }, 20_000);
      pending.set(id, (message) => {
        clearTimeout(timer);
        resolvePromise(message);
      });
      child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  };

  try {
    await request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "crafthub-e2e", version: "1.0.0" },
    });
    child.stdin?.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );

    const response = await request("tools/call", { name, arguments: args });

    if (response.error) {
      // A protocol-level failure is not the same as a tool that refused, and
      // conflating them would let a broken server masquerade as a policy hit.
      throw new Error(
        `MCP call '${name}' failed at the protocol level: ${response.error.message ?? "unknown error"}`,
      );
    }

    const result = isToolCallResult(response.result) ? response.result : {};
    const text = (result.content ?? [])
      .map((part) => part.text ?? "")
      .join("\n");

    return { text, isError: result.isError === true };
  } finally {
    child.kill();
  }
}

/** The post id the MCP server prints back in its `Post created ✅` summary. */
function extractPostId(toolText: string): string {
  const match = toolText.match(
    /id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  if (!match?.[1]) {
    throw new Error(`No post id in MCP tool output:\n${toolText}`);
  }
  return match[1];
}

/* ------------------------------------------------------------------ *
 * The human's own session (setup + teardown only)
 * ------------------------------------------------------------------ */

type PublicPost = {
  id: string;
  title: string | null;
  body: string;
  tags: string[] | null;
  status: string;
};

type OwnPost = PublicPost & { source: string };

let humanJwt = "";
let agentToken = "";
let agentTokenId = "";
let humanUserInfo: unknown = null;

/**
 * Must match USER_INFO_STORAGE_KEY in apps/web/src/lib/user-info-store.ts.
 *
 * `loginAs` seeds the auth TOKENS, which is all `/dashboard` needs. Every
 * screen this journey walks (`/dashboard/settings`, `/dashboard/posts/review`)
 * additionally gates on the persisted user-info store and bounces to `/`
 * without it, so the session has to be restored the same way the app itself
 * persists it — zustand's `{ state, version }` envelope, in localStorage.
 * Deliberately local to this spec rather than folded into the shared `loginAs`,
 * which other journeys are using concurrently.
 */
const USER_INFO_KEY = "crafthub.auth.user-info";

/** Signs the page in as the journey account, session store included. */
async function signInAsHuman(page: Page): Promise<void> {
  await loginAs(page, ACCOUNT);
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [
      USER_INFO_KEY,
      JSON.stringify({ state: { userInfo: humanUserInfo }, version: 0 }),
    ] as [string, string],
  );
}

async function listOwnPosts(): Promise<OwnPost[]> {
  const response = await fetch(`${API_URL}/me/posts?limit=100`, {
    headers: { authorization: `Bearer ${humanJwt}` },
  });
  expect(response.status, "GET /me/posts").toBe(200);
  return (await response.json()) as OwnPost[];
}

/**
 * A new profile now ships with tabs OFF and only the links block always
 * visible — that is the deliberate default, so someone who just signed up
 * publishes a photo, a name and their links rather than a half-empty tab strip.
 * The posts block lives in the tabs area, so on a freshly seeded account it
 * renders nowhere and "the approved post is on the public profile" can never
 * become true.
 *
 * This journey is about posts reaching the public page, so it opts the account
 * in for BOTH viewports — the test is `@responsive` and the public profile
 * serves the pc or mobile layout depending on the viewport it is loaded at.
 */
async function showPostsPublicly(): Promise<void> {
  for (const viewport of ["pc", "mobile"] as const) {
    const response = await fetch(`${API_URL}/me/layout/tabs-enabled`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${humanJwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ viewport, tabsEnabled: true }),
    });
    expect(response.status, `PATCH tabs-enabled (${viewport})`).toBe(200);
  }
}

/**
 * What the world actually sees. Every disclosure assertion re-reads THIS,
 * never the response of the call that created the post: the only output that
 * matters is the one a recruiter can load without credentials.
 */
async function listPublishedPosts(): Promise<PublicPost[]> {
  const response = await fetch(
    `${API_URL}${API_PUBLIC_PROFILE}/posts?limit=100`,
    { headers: { accept: "application/json" } },
  );
  expect(response.status, "GET public posts feed").toBe(200);
  return (await response.json()) as PublicPost[];
}

/** Every word this profile publishes, as one lowercase haystack. */
function publishedText(posts: readonly PublicPost[]): string {
  return posts
    .map((post) => [post.title ?? "", post.body, ...(post.tags ?? [])].join("\n"))
    .join("\n")
    .toLowerCase();
}

async function deleteMarkedPosts(): Promise<void> {
  const posts = await listOwnPosts();
  for (const post of posts) {
    const haystack = `${post.title ?? ""}\n${post.body}`;
    if (!haystack.includes(MARKER)) continue;
    await fetch(`${API_URL}/me/posts/${post.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${humanJwt}` },
    });
  }
}

/**
 * Opens Settings → Advanced settings.
 *
 * The wait is not padding: the panels ABOVE this disclosure swap skeletons for
 * real content as their queries land, which moves (and remounts) the summary
 * element under the cursor. Clicking before the page has settled fails with
 * "element was detached from the DOM" — a harness race, not a product defect.
 */
async function openAdvancedSettings(page: Page): Promise<void> {
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.getByText("Loading activity sources")).toHaveCount(0);
  await expect(page.getByText("Loading tokens")).toHaveCount(0);

  const advanced = page.locator("#advanced-settings");
  await advanced.getByText("Advanced settings").click();
  await expect(
    advanced.getByRole("heading", { name: "Personal access tokens" }),
  ).toBeVisible();
}

/**
 * Mints the agent's token the way the product tells a user to: Settings →
 * Advanced settings → Create token, and read the one-time secret off the
 * dialog. Never a database write, and never a token the UI cannot produce.
 */
async function mintAgentTokenThroughSettingsUi(page: Page): Promise<void> {
  const guard = watchPage(page);
  await signInAsHuman(page);
  await openAdvancedSettings(page);

  await page
    .getByRole("button", { name: /^Create token$/ })
    .first()
    .click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name" }).fill(`${MARKER}-${uniqueSuffix()}`);
  await dialog.getByRole("button", { name: /^Create token$/ }).click();

  // The plaintext secret is shown exactly once, in a <code> block.
  const secret = dialog.getByText(/^lh_pat_/);
  await expect(secret, "the one-time PAT the dialog shows").toBeVisible();
  agentToken = ((await secret.textContent()) ?? "").trim();
  expect(agentToken, "minted token looks like a PAT").toMatch(/^lh_pat_\S+$/);

  await dialog.getByRole("button", { name: "Done" }).click();

  expect(guard.errors, "console errors while minting a token").toEqual([]);

  const tokens = (await (
    await fetch(`${API_URL}/me/tokens`, {
      headers: { authorization: `Bearer ${humanJwt}` },
    })
  ).json()) as Array<{ id: string; name: string; revokedAt: string | null }>;
  const mine = tokens.find((token) => token.name.startsWith(MARKER) && !token.revokedAt);
  agentTokenId = mine?.id ?? "";
}

test.describe("journey 2 — my agents write posts while I code", () => {
  // Deliberately NOT `mode: "serial"`. The order matters — the empty-state test
  // is a statement about the whole account and has to run before anything files
  // a post — and the config already guarantees it (`fullyParallel: false`,
  // `workers: 1`, declaration order). Serial mode would additionally SKIP every
  // later test after the first failure, which would hide the disclosure results
  // behind an unrelated rendering bug.

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const session = await apiLogin(ACCOUNT.email, ACCOUNT.password);
    humanJwt = session.accessToken;
    humanUserInfo = session.user ?? null;
    await deleteMarkedPosts();
    await showPostsPublicly();

    const page = await browser.newPage();
    try {
      await mintAgentTokenThroughSettingsUi(page);
    } finally {
      await page.close();
    }
  });

  test.afterAll(async () => {
    if (!humanJwt) return;
    await deleteMarkedPosts();
    if (agentTokenId) {
      await fetch(`${API_URL}/me/tokens/${agentTokenId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${humanJwt}` },
      });
    }
  });

  test("the review queue tells the human when nothing is waiting", async ({
    page,
    guard,
  }) => {
    await signInAsHuman(page);
    await page.goto("/dashboard/posts/review");

    await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
    await expect(page.getByText("Nothing is waiting for review.")).toBeVisible();
    await expect(
      page.getByText("When a connected tool writes a post unattended it lands here first."),
    ).toBeVisible();

    expect(guard.errors, "console errors on the empty review queue").toEqual([]);
  });

  test("@responsive an unattended agent post waits for review, and approving it publishes it", async ({
    page,
    guard,
  }) => {
    const title = `Shipped idempotent retries ${MARKER} ${uniqueSuffix()}`;
    const created = await callAgentTool(agentToken, "create_commit_summary_post", {
      title,
      summary: `Rewrote the retry pipeline behind the payment worker so a duplicate webhook can no longer double-charge. Written by the agent for ${MARKER}.`,
      period: "weekly",
      repo: "crafthub-v.1",
      commitCount: 7,
      tags: ["typescript", "postgres"],
      status: "pending_review",
    });
    expect(created.isError, `create_commit_summary_post said: ${created.text}`).toBe(false);
    const postId = extractPostId(created.text);

    // Nothing is public yet — that is the promise the queue makes.
    expect(
      (await listPublishedPosts()).some((post) => post.id === postId),
      "a pending_review post must not be on the public feed",
    ).toBe(false);

    await signInAsHuman(page);
    await page.goto("/dashboard/posts/review");

    const card = page.getByRole("listitem").filter({ hasText: title });
    await expect(card, "the agent's post in the human's review queue").toBeVisible();
    await expect(card.getByText("Pending review")).toBeVisible();
    await expect(card.getByText("Commit", { exact: true })).toBeVisible();
    await expect(
      card.getByText("Generated from your commit activity in crafthub-v.1"),
    ).toBeVisible();

    await card.getByRole("button", { name: /Approve & publish/ }).click();
    await expect(card, "the approved post leaves the queue").toBeHidden();

    // Publication itself: the anonymous feed is the only authority on what is
    // public, so this is checked before anything the browser renders.
    const published = await listPublishedPosts();
    const publicRow = published.find((post) => post.id === postId);
    expect(
      publicRow?.status,
      "the approved post is served by the anonymous public feed",
    ).toBe("published");

    /*
     * This once demanded the OPPOSITE — that the public payload carry
     * `metadata` — on the belief that apps/web parsed the feed with
     * `postSchema.array()`, for which `metadata` is required. That belief is
     * stale twice over: `fetchPublicPosts` parses with `publicPostSchema`
     * (apps/web/src/lib/post-queries.ts:91), and `publicPostSchema` is
     * `postSchema.omit({ metadata: true })` (packages/schemas/src/posts).
     *
     * Withholding it is the POINT: post metadata can hold a repository name,
     * so serving it to an anonymous reader would leak exactly what the
     * disclosure policy exists to protect. Assert the privacy property.
     */
    expect
      .soft(
        publicRow ? Object.prototype.hasOwnProperty.call(publicRow, "metadata") : false,
        "the public feed must NOT expose post metadata — it can carry a repository name",
      )
      .toBe(false);

    await page.goto(PUBLIC_PROFILE);
    await expect
      .soft(page.getByText(title), "the approved post on the public profile")
      .toBeVisible();

    expect(guard.errors, "console errors while reviewing and publishing").toEqual([]);
  });

  test("a rejected agent post never becomes public", async ({ page, guard }) => {
    const title = `Rejected draft ${MARKER} ${uniqueSuffix()}`;
    const created = await callAgentTool(agentToken, "create_post", {
      title,
      body: `Something the human does not want on their profile. ${MARKER}`,
      tags: ["typescript"],
      status: "pending_review",
    });
    expect(created.isError, `create_post said: ${created.text}`).toBe(false);
    const postId = extractPostId(created.text);

    await signInAsHuman(page);
    await page.goto("/dashboard/posts/review");

    const card = page.getByRole("listitem").filter({ hasText: title });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: /Delete/ }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm" })
      .click();

    await expect(card, "the rejected post leaves the queue").toBeHidden();

    await expect(
      page.getByText("Nothing is waiting for review."),
      "the queue is empty again after the rejection",
    ).toBeVisible();

    const published = await listPublishedPosts();
    expect(
      published.some((post) => post.id === postId),
      "a rejected post must never reach the public feed",
    ).toBe(false);

    await page.goto(PUBLIC_PROFILE);
    await expect(page.getByText(title)).toHaveCount(0);

    expect(guard.errors, "console errors while rejecting a post").toEqual([]);
  });

  /* ---------------------------------------------------------------- *
   * Disclosure. The rest of this file is about whether a post shows up.
   * This part is about whether publishing one exposes who the human
   * works for — the only failure here that is someone's real job.
   * ---------------------------------------------------------------- */

  test("the agent cannot publish a post that names the human's employer", async ({
    page,
    guard,
  }) => {
    // Read the employer from the human's own public work history rather than
    // hardcoding a seed value, so this keeps testing the real policy input.
    const roles = (await (
      await fetch(`${API_URL}${API_PUBLIC_PROFILE}/work-experiences`)
    ).json()) as Array<{ companyName: string | null }>;
    const employer = roles.find((role) => (role.companyName ?? "").length > 1)?.companyName;
    expect(employer, "the seeded account needs a work history to test disclosure").toBeTruthy();
    const employerName = employer as string;

    const leakSentence = `Rebuilt the ledger reconciliation service at ${employerName} this sprint. ${MARKER}`;

    const attempt = await callAgentTool(agentToken, "create_post", {
      title: `Ledger work at ${employerName} ${MARKER}`,
      body: leakSentence,
      tags: ["typescript"],
      status: "published",
    });

    expect(
      attempt.isError,
      `naming the employer at disclosure level 'summary' must be refused, but the tool answered: ${attempt.text}`,
    ).toBe(true);
    expect(attempt.text).toContain(employerName);
    expect(attempt.text.toLowerCase()).toContain("disclosure level");

    // Same term smuggled through the tags of an otherwise clean post.
    const viaTags = await callAgentTool(agentToken, "create_post", {
      title: `Reconciliation rewrite ${MARKER}`,
      body: `Rebuilt the ledger reconciliation service. ${MARKER}`,
      tags: [employerName.toLowerCase(), "typescript"],
      status: "published",
    });
    expect(
      viaTags.isError,
      `the employer name in a tag must be refused too, but the tool answered: ${viaTags.text}`,
    ).toBe(true);

    // What is ACTUALLY published, re-read with no credentials.
    const published = await listPublishedPosts();
    expect(
      publishedText(published).includes(employerName.toLowerCase()),
      `the public posts feed must not contain the employer name "${employerName}"`,
    ).toBe(false);

    await page.goto(PUBLIC_PROFILE);
    await expect(
      page.getByText(leakSentence),
      "the refused sentence must not be on the public profile",
    ).toHaveCount(0);

    expect(guard.errors, "console errors on the public profile").toEqual([]);
  });

  test("a term the human blocks in settings is refused on every agent write path", async ({
    page,
    guard,
  }) => {
    // A codename that exists nowhere else on the profile, so "it is not on the
    // page" cannot be true for some unrelated reason.
    const codename = `Zephyrline${uniqueSuffix().slice(0, 4)}`;

    await signInAsHuman(page);
    await openAdvancedSettings(page);

    await page.getByLabel("Add a term").fill(codename);
    await page.getByRole("button", { name: /^Add$/ }).click();
    await expect(
      page.getByRole("button", { name: `Remove ${codename}` }),
      "the blocked term the human just added",
    ).toBeVisible();

    try {
      const viaCreate = await callAgentTool(agentToken, "create_post", {
        title: `${codename} migration ${MARKER}`,
        body: `Finished the ${codename} migration. ${MARKER}`,
        tags: ["typescript"],
        status: "published",
      });
      expect(
        viaCreate.isError,
        `create_post must refuse a user-blocked term, but answered: ${viaCreate.text}`,
      ).toBe(true);

      const viaCommitSummary = await callAgentTool(
        agentToken,
        "create_commit_summary_post",
        {
          title: `Weekly update ${MARKER}`,
          summary: `Shipped the ${codename} rollout across the worker fleet. ${MARKER}`,
          period: "weekly",
          commitCount: 4,
          status: "pending_review",
        },
      );
      expect(
        viaCommitSummary.isError,
        `create_commit_summary_post must refuse a user-blocked term, but answered: ${viaCommitSummary.text}`,
      ).toBe(true);

      const published = await listPublishedPosts();
      expect(
        publishedText(published).includes(codename.toLowerCase()),
        `the public posts feed must not contain the blocked term "${codename}"`,
      ).toBe(false);

      await page.goto(PUBLIC_PROFILE);
      await expect(page.getByText(codename)).toHaveCount(0);
      expect(guard.errors, "console errors on the public profile").toEqual([]);
    } finally {
      // Leave the account's policy exactly as it was found.
      await openAdvancedSettings(page);
      await page.getByRole("button", { name: `Remove ${codename}` }).click();
      await expect(
        page.getByRole("button", { name: `Remove ${codename}` }),
      ).toHaveCount(0);
    }
  });

  test("a post waiting for review cannot be published by the agent itself", async ({
    page,
  }) => {
    // The queue's own words: "Nothing here is public until you approve it",
    // and the approve endpoint documents itself as "the only way a
    // machine-authored post becomes public". This test holds the product to
    // that sentence from the side the human cannot see.
    const title = `Self-publish attempt ${MARKER} ${uniqueSuffix()}`;
    const created = await callAgentTool(agentToken, "create_post", {
      title,
      body: `Waiting for a human to read this. ${MARKER}`,
      tags: ["typescript"],
      status: "pending_review",
    });
    expect(created.isError, `create_post said: ${created.text}`).toBe(false);
    const postId = extractPostId(created.text);

    const selfPublish = await callAgentTool(agentToken, "update_post", {
      id: postId,
      status: "published",
    });

    expect(
      selfPublish.isError,
      `the agent flipped its own pending_review post to published without the human: ${selfPublish.text}`,
    ).toBe(true);

    const published = await listPublishedPosts();
    expect(
      published.some((post) => post.id === postId),
      "a post the human never approved must not be on the public feed",
    ).toBe(false);

    await signInAsHuman(page);
    await page.goto("/dashboard/posts/review");
    await expect(
      page.getByRole("listitem").filter({ hasText: title }),
      "the post is still waiting for the human",
    ).toBeVisible();
  });
});
