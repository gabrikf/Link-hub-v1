/**
 * Proves `SmtpMailProvider` actually delivers, over a real SMTP connection.
 *
 * NEEDS REAL MAILPIT — `docker compose -f docker-compose.dev.yml --profile
 * tools up -d mailpit` (or `bash db-manage.sh admin`, which starts the same
 * `tools` profile) — SMTP on 1025, HTTP API on 8025. `.e2e.test.ts` name,
 * matching the other files here that cannot run without infrastructure.
 *
 * WHY THIS FILE EXISTS:
 *
 * Every other mail test in this codebase — the auth use-case tests, the
 * hermetic `build-test-app.ts` suite — asserts against `LogMailProvider` or a
 * hand-rolled fake `IMailProvider`. None of them ever construct a real
 * `nodemailer` transport, open a real socket, or exercise the "no
 * SMTP_USER/SMTP_PASSWORD" branch that a local relay like Mailpit exercises in
 * practice. `SmtpMailProvider` shipped without ever having sent one real
 * email; this is the one test that closes that gap.
 *
 * SELF-SKIPPING, not gate-only: a TCP probe against Mailpit's SMTP port runs
 * before the suite is built, so `npx vitest run` (or `related`) on a machine
 * without Mailpit up skips cleanly and PRINTS why, instead of hanging on a
 * connection that will never complete. `scripts/guardrails/pre-push.mjs`
 * ALSO excludes this file by name when Mailpit is unreachable — belt and
 * braces, same as the Postgres-bound files, so the gate's own NOTICE block
 * names it too.
 */
import { connect } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SmtpMailProvider } from "./smtp-mail-provider.js";

const SMTP_HOST = "127.0.0.1";
const SMTP_PORT = 1025;
const MAILPIT_API_BASE = "http://127.0.0.1:8025/api/v1";

function mailpitSmtpReachable(timeoutMs = 700): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = connect(SMTP_PORT, SMTP_HOST);
    const finish = (reachable: boolean) => {
      socket.destroy();
      resolvePromise(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(true));
    socket.on("error", () => finish(false));
    socket.on("timeout", () => finish(false));
  });
}

const mailpitUp = await mailpitSmtpReachable();

if (!mailpitUp) {
  console.warn(
    "[smtp-mail-provider.mailpit.e2e.test.ts] SKIPPED — Mailpit is not " +
      `reachable on ${SMTP_HOST}:${SMTP_PORT}. Start it with: ` +
      "docker compose -f docker-compose.dev.yml --profile tools up -d mailpit " +
      "(or `bash db-manage.sh admin`). SmtpMailProvider's real delivery path " +
      "is therefore UNVERIFIED by this run.",
  );
}

interface MailpitMessageSummary {
  ID: string;
  From: { Name: string; Address: string };
  To: Array<{ Name: string; Address: string }>;
  Subject: string;
}

interface MailpitMessagesResponse {
  messages: MailpitMessageSummary[];
}

interface MailpitMessageDetail {
  From: { Name: string; Address: string };
  To: Array<{ Name: string; Address: string }>;
  Subject: string;
  Text: string;
  HTML: string;
}

async function mailpitDeleteAll(): Promise<void> {
  await fetch(`${MAILPIT_API_BASE}/messages`, { method: "DELETE" });
}

/** Mailpit accepts the message over SMTP asynchronously; give it a moment. */
async function mailpitFindMessageTo(
  address: string,
  timeoutMs = 5000,
): Promise<MailpitMessageSummary | undefined> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(`${MAILPIT_API_BASE}/messages`);
    const body = (await response.json()) as MailpitMessagesResponse;
    const found = body.messages.find((message) =>
      message.To.some((to) => to.Address === address),
    );
    if (found) {
      return found;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  return undefined;
}

async function mailpitGetMessage(id: string): Promise<MailpitMessageDetail> {
  const response = await fetch(`${MAILPIT_API_BASE}/message/${id}`);
  return (await response.json()) as MailpitMessageDetail;
}

describe.skipIf(!mailpitUp)("SmtpMailProvider against real Mailpit", () => {
  const from = "CraftHub Test <no-reply@crafthub.local>";

  beforeAll(async () => {
    await mailpitDeleteAll();
  });

  afterAll(async () => {
    await mailpitDeleteAll();
  });

  it("delivers a real message over SMTP, with no SMTP_USER/SMTP_PASSWORD set", async () => {
    // Mailpit's default config (MP_SMTP_AUTH_ACCEPT_ANY +
    // MP_SMTP_AUTH_ALLOW_INSECURE, set in docker-compose.dev.yml) accepts
    // unauthenticated plaintext SMTP — the same shape as a real dev relay.
    // Omitting `user`/`password` here is the realistic local configuration,
    // and it is also the branch SmtpMailProvider's constructor special-cases
    // to avoid sending `auth: { user: undefined }` (which makes nodemailer
    // attempt AUTH anyway and fail against a server with no credentials to
    // check).
    const provider = new SmtpMailProvider({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      from,
    });

    const to = `smtp-provider-test-${Date.now()}@example.com`;

    await provider.send({
      to,
      subject: "SmtpMailProvider delivery proof",
      text: "plain text body",
      html: "<p>html body</p>",
    });

    const summary = await mailpitFindMessageTo(to);
    expect(summary).toBeDefined();
    expect(summary?.From.Address).toBe("no-reply@crafthub.local");
    expect(summary?.Subject).toBe("SmtpMailProvider delivery proof");

    const detail = await mailpitGetMessage(summary!.ID);
    expect(detail.Text.trim().length).toBeGreaterThan(0);
    expect(detail.HTML.trim().length).toBeGreaterThan(0);
    expect(detail.Text).toContain("plain text body");
    expect(detail.HTML).toContain("html body");

    // Exactly one message for this address — no duplicate send, no retry storm.
    const all = await (
      await fetch(`${MAILPIT_API_BASE}/messages`)
    ).json() as MailpitMessagesResponse;
    const matching = all.messages.filter((m) =>
      m.To.some((t) => t.Address === to),
    );
    expect(matching).toHaveLength(1);
  });
});
