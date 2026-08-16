import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { GITLAB_SIGNING_SECRET_PREFIX } from "../../../core/providers/webhook-secret/webhook-secret-provider.js";

/**
 * Signature verification for inbound forge webhooks.
 *
 * Pure functions over the RAW request bytes: every one of these signs the body
 * exactly as it arrived on the wire, because `JSON.parse` followed by
 * `JSON.stringify` reorders keys, drops whitespace and normalises escapes — any
 * of which turns a valid signature into an invalid one.
 */

/**
 * How far a GitLab signing timestamp may be from our clock. GitLab's own guidance
 * is five minutes; wider makes captured deliveries replayable for longer,
 * narrower starts rejecting honest deliveries over ordinary clock skew.
 */
export const GITLAB_REPLAY_WINDOW_SECONDS = 300;

/**
 * `timingSafeEqual` THROWS `RangeError` when the buffers differ in length, so
 * every caller must length-check first. The early return leaks only the length
 * of the value — which the attacker already chose — and never a prefix of the
 * expected digest.
 */
function constantTimeEquals(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function constantTimeEqualsString(left: string, right: string): boolean {
  return constantTimeEquals(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/**
 * Verifies `X-Hub-Signature-256`: `sha256=<lowercase hex>` of an HMAC-SHA256 over
 * the raw body, keyed with the connection's secret.
 *
 * The legacy `X-Hub-Signature` (SHA-1) header is deliberately ignored rather
 * than accepted as a fallback: honouring it would let anyone who can forge a
 * SHA-1 HMAC bypass the SHA-256 one just by sending the older header.
 */
export function verifyGithubSignature(
  rawBody: Buffer,
  secret: string,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

  return constantTimeEqualsString(expected, signatureHeader);
}

/**
 * Legacy GitLab path: `X-Gitlab-Token` is the configured secret, sent verbatim.
 *
 * Both sides are hashed before the comparison so the buffers are always 32
 * bytes. A direct comparison would return early on a length mismatch and hand
 * an attacker the length of the secret for free.
 */
export function verifyGitlabPlaintextToken(
  secret: string,
  tokenHeader: string | undefined,
): boolean {
  if (!tokenHeader || !secret) {
    return false;
  }

  return constantTimeEquals(sha256(secret), sha256(tokenHeader));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export interface GitlabSigningHeaders {
  /** `webhook-id` — the delivery id, part of the signed string. */
  id: string | undefined;
  /** `webhook-timestamp` — unix SECONDS, part of the signed string. */
  timestamp: string | undefined;
  /** `webhook-signature` — a space-separated list of `v1,<base64>` entries. */
  signature: string | undefined;
}

/**
 * GitLab 19.0+ path (Standard Webhooks).
 *
 * Three details that are each easy to get wrong and silently fail closed:
 * - the header is the lowercase `webhook-signature`, NOT `X-Gitlab-Signature`;
 * - the HMAC key is the BASE64-DECODED bytes after the `whsec_` prefix, not the
 *   printable secret;
 * - the digest is BASE64, not hex.
 *
 * The header is a SPACE-SEPARATED LIST so a secret can be rotated without a
 * window of dropped deliveries — during rotation GitLab signs with both keys and
 * sends both entries — so any matching entry authenticates the delivery.
 */
export function verifyGitlabSignature(
  rawBody: Buffer,
  secret: string,
  headers: GitlabSigningHeaders,
  now: Date = new Date(),
): boolean {
  const { id, timestamp, signature } = headers;

  if (!id || !timestamp || !signature || !secret) {
    return false;
  }

  if (!isWithinReplayWindow(timestamp, now)) {
    return false;
  }

  const key = gitlabSigningKey(secret);

  if (key.length === 0) {
    return false;
  }

  // `{webhook-id}.{webhook-timestamp}.{rawBody}`, assembled as BYTES: the body
  // must not make a round trip through a string, which would re-encode any
  // non-UTF8 sequence the forge happened to send.
  const signedPayload = Buffer.concat([
    Buffer.from(`${id}.${timestamp}.`, "utf8"),
    rawBody,
  ]);

  const expected = createHmac("sha256", key)
    .update(signedPayload)
    .digest("base64");

  return signature
    .split(" ")
    .filter((entry) => entry.length > 0)
    .some((entry) => {
      if (!entry.startsWith("v1,")) {
        return false;
      }

      return constantTimeEqualsString(expected, entry.slice("v1,".length));
    });
}

/**
 * A timestamp outside the window means the delivery is either a replay of a
 * captured request or so delayed that accepting it proves nothing about when it
 * was signed. Both directions are checked — a FUTURE timestamp is just as
 * forgeable as an old one.
 */
function isWithinReplayWindow(timestamp: string, now: Date): boolean {
  const signedAtSeconds = Number(timestamp);

  if (!Number.isFinite(signedAtSeconds)) {
    return false;
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);

  return (
    Math.abs(nowSeconds - signedAtSeconds) <= GITLAB_REPLAY_WINDOW_SECONDS
  );
}

/** The HMAC key: base64-decoded bytes, with the `whsec_` prefix stripped if present. */
export function gitlabSigningKey(secret: string): Buffer {
  const encoded = secret.startsWith(GITLAB_SIGNING_SECRET_PREFIX)
    ? secret.slice(GITLAB_SIGNING_SECRET_PREFIX.length)
    : secret;

  return Buffer.from(encoded, "base64");
}
