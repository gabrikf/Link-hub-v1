/**
 * Reading the mail the API actually sent.
 *
 * The verification and password-reset flows are only real end to end if the
 * token comes out of a delivered MESSAGE rather than out of the database or a
 * test seam. Mailpit is the local relay that makes that possible: the API is
 * pointed at its SMTP port and this module reads the result back over its HTTP
 * API.
 *
 *   docker compose -f docker-compose.dev.yml --profile tools up -d mailpit
 *   SMTP 1025 · HTTP 8025
 *
 * There is a precedent for these exact calls in
 * `apps/api/src/infra/providers/smtp-mail-provider.mailpit.e2e.test.ts`, which
 * proves the provider delivers. This module is the other half: proving the app
 * built the right link and that the link works in a browser.
 *
 * SELF-SKIPPING, AND IT SAYS WHY. `mailpitReachable()` probes the HTTP API once
 * and memoises the answer, so a journey can `test.skip()` with an explanatory
 * message on a machine that has no Mailpit instead of hanging for a message
 * that is never going to arrive. That is this repo's stated rule for
 * infrastructure-bound tests — see the header of the provider test above and
 * the NOTICE block in `scripts/guardrails/pre-push.mjs`.
 *
 * TWO WAYS TO HAVE NO MAIL, AND THEY NEED DIFFERENT MESSAGES. Mailpit being
 * down is one. Mailpit being up while the API resolves `MAIL_TRANSPORT` to
 * `log` — the default when `SMTP_HOST` is unset — is the other, and it looks
 * identical from here: the mailbox simply stays empty. `waitForMail` therefore
 * fails with a message that names BOTH causes rather than a bare timeout,
 * because "no message arrived" sends a reader hunting in the product when the
 * cause is almost always the second one.
 */

const MAILPIT_BASE =
  process.env.E2E_MAILPIT_URL?.replace(/\/+$/, "") || "http://127.0.0.1:8025";
const MAILPIT_API = `${MAILPIT_BASE}/api/v1`;

export const MAILPIT_HINT =
  `Mailpit is not answering on ${MAILPIT_BASE}. Start it with: ` +
  "docker compose -f docker-compose.dev.yml --profile tools up -d mailpit " +
  "(or `bash db-manage.sh admin`), and point the api at it with " +
  "MAIL_TRANSPORT=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=1025.";

type MailpitSummary = {
  ID: string;
  To: Array<{ Address: string }>;
  Subject: string;
};

type MailpitDetail = {
  ID: string;
  To: Array<{ Address: string }>;
  Subject: string;
  Text: string;
  HTML: string;
};

/**
 * One probe per process, memoised.
 *
 * `AbortSignal.timeout` rather than a bare fetch: an unreachable host that
 * blackholes packets (a stopped container behind a firewall rule, rather than a
 * refused connection) would otherwise hold the whole suite for the OS connect
 * timeout before the first test even starts.
 */
let reachableProbe: Promise<boolean> | null = null;

export function mailpitReachable(): Promise<boolean> {
  reachableProbe ??= fetch(`${MAILPIT_API}/messages?limit=1`, {
    signal: AbortSignal.timeout(1500),
  })
    .then((response) => response.ok)
    .catch(() => false);

  return reachableProbe;
}

async function listMessages(): Promise<MailpitSummary[]> {
  // `limit` is generous on purpose: the nightly loop shares one mailbox with
  // journey 1, which registers an account per test, so the message this call
  // wants can sit well below the default page size.
  const response = await fetch(`${MAILPIT_API}/messages?limit=200`);

  if (!response.ok) {
    throw new Error(`mailpit list failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as { messages: MailpitSummary[] };
  return body.messages ?? [];
}

/**
 * Waits for a message to `address`, newest first.
 *
 * `subjectMatch` is required rather than optional. A single address receives
 * BOTH a verification mail and, later in the same journey, a password-reset
 * mail; "the latest message for this address" would hand back whichever the
 * previous step left behind and the journey would follow a stale link that
 * still works — a green test proving nothing.
 */
export async function waitForMail(
  address: string,
  subjectMatch: RegExp,
  timeoutMs = 15_000,
): Promise<MailpitDetail> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const summaries = await listMessages();
    const found = summaries.find(
      (message) =>
        message.To.some((to) => to.Address === address) &&
        subjectMatch.test(message.Subject),
    );

    if (found) {
      const response = await fetch(`${MAILPIT_API}/message/${found.ID}`);

      if (!response.ok) {
        throw new Error(`mailpit fetch failed: HTTP ${response.status}`);
      }

      return (await response.json()) as MailpitDetail;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(
    `no message matching ${subjectMatch} arrived for ${address} within ` +
      `${timeoutMs}ms. Either Mailpit is not receiving, or — far more likely — ` +
      "the api resolved MAIL_TRANSPORT to 'log' and printed the email to its " +
      "own terminal instead of sending it. " +
      MAILPIT_HINT,
  );
}

/**
 * Pulls the app link out of a message and returns it as a ROUTE-RELATIVE path.
 *
 * Returning a path rather than the absolute URL is what keeps the journey
 * honest about which origin it is driving. The API builds these links from
 * `APP_PUBLIC_URL`, which on a developer machine is usually — but not always —
 * the same origin Playwright's `baseURL` points at; handing `page.goto` the
 * absolute URL would silently navigate away from the app under test the moment
 * those two disagree. `expectedPath` is asserted for the same reason.
 */
export function extractLinkPath(
  message: MailpitDetail,
  expectedPath: `/${string}`,
): string {
  // The plain-text part, not the HTML: it carries the same URL without the
  // entity escaping an HTML attribute can introduce.
  const match = message.Text.match(/https?:\/\/\S+/g)?.find((url) =>
    url.includes(expectedPath),
  );

  if (!match) {
    throw new Error(
      `no ${expectedPath} link found in the message "${message.Subject}". ` +
        `Body was:\n${message.Text.slice(0, 500)}`,
    );
  }

  // Trailing punctuation a mail client (or a line wrap) can glue on.
  const url = new URL(match.replace(/[).,]+$/, ""));

  return `${url.pathname}${url.search}`;
}

/** The single-use credential itself, for the API-level half of an assertion. */
export function extractToken(message: MailpitDetail, expectedPath: `/${string}`): string {
  const path = extractLinkPath(message, expectedPath);
  const token = new URLSearchParams(path.split("?")[1] ?? "").get("token");

  if (!token) {
    throw new Error(`the ${expectedPath} link carried no token: ${path}`);
  }

  return token;
}

/**
 * Drops every message for one address.
 *
 * Scoped to the address rather than `DELETE /messages`, which empties the whole
 * mailbox: a developer watching the Mailpit UI while this suite runs should not
 * lose the message they were reading, and two journeys running back to back in
 * the nightly loop must not wipe each other's mail mid-flight.
 */
export async function deleteMailFor(address: string): Promise<void> {
  try {
    const summaries = await listMessages();
    const ids = summaries
      .filter((message) => message.To.some((to) => to.Address === address))
      .map((message) => message.ID);

    if (ids.length === 0) {
      return;
    }

    await fetch(`${MAILPIT_API}/messages`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ IDs: ids }),
    });
  } catch {
    // Cleanup only. A mailbox that could not be tidied is not a product
    // failure, and throwing here would turn a passing journey red in its
    // teardown.
  }
}
