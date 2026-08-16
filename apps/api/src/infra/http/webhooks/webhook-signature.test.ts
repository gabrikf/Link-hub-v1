import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GITLAB_REPLAY_WINDOW_SECONDS,
  gitlabSigningKey,
  verifyGithubSignature,
  verifyGitlabPlaintextToken,
  verifyGitlabSignature,
} from "./webhook-signature.js";

/**
 * The published GitHub example, used verbatim.
 *
 * Its value is that it was produced by GitHub and not by this file: a test that
 * signs with our own code and then verifies with our own code passes just as
 * happily when both sides agree on the wrong algorithm, encoding or key.
 */
const GITHUB_DOCS_SECRET = "It's a Secret to Everybody";
const GITHUB_DOCS_BODY = "Hello, World!";
const GITHUB_DOCS_SIGNATURE =
  "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";

describe("verifyGithubSignature", () => {
  it("accepts the signature from GitHub's own documented test vector", () => {
    const verified = verifyGithubSignature(
      Buffer.from(GITHUB_DOCS_BODY, "utf8"),
      GITHUB_DOCS_SECRET,
      GITHUB_DOCS_SIGNATURE,
    );

    expect(verified).toBe(true);
  });

  it("rejects the documented signature once the body is tampered with", () => {
    const verified = verifyGithubSignature(
      Buffer.from("Hello, World?", "utf8"),
      GITHUB_DOCS_SECRET,
      GITHUB_DOCS_SIGNATURE,
    );

    expect(verified).toBe(false);
  });

  it("rejects a signature computed with a different secret", () => {
    const verified = verifyGithubSignature(
      Buffer.from(GITHUB_DOCS_BODY, "utf8"),
      "some other secret",
      GITHUB_DOCS_SIGNATURE,
    );

    expect(verified).toBe(false);
  });

  it("rejects a missing signature header rather than treating it as unsigned-but-fine", () => {
    expect(
      verifyGithubSignature(
        Buffer.from(GITHUB_DOCS_BODY, "utf8"),
        GITHUB_DOCS_SECRET,
        undefined,
      ),
    ).toBe(false);
  });

  it("ignores the legacy sha1 header format instead of accepting it as a fallback", () => {
    const sha1 = `sha1=${createHmac("sha1", GITHUB_DOCS_SECRET).update(GITHUB_DOCS_BODY).digest("hex")}`;

    expect(
      verifyGithubSignature(
        Buffer.from(GITHUB_DOCS_BODY, "utf8"),
        GITHUB_DOCS_SECRET,
        sha1,
      ),
    ).toBe(false);
  });

  it("does not throw when the header length differs from the expected digest", () => {
    // `timingSafeEqual` raises RangeError on a length mismatch; a short header
    // must return false, not crash the request into a 500.
    expect(() =>
      verifyGithubSignature(
        Buffer.from(GITHUB_DOCS_BODY, "utf8"),
        GITHUB_DOCS_SECRET,
        "sha256=abc",
      ),
    ).not.toThrow();
  });
});

describe("verifyGitlabPlaintextToken", () => {
  const secret = "whsec_kDcSPB0Zvv7uAQxfJKZ0mTAnBmKlmYqLpVYm2jJ0Fzs=";

  it("accepts the configured token echoed back verbatim", () => {
    expect(verifyGitlabPlaintextToken(secret, secret)).toBe(true);
  });

  it("rejects a different token", () => {
    expect(verifyGitlabPlaintextToken(secret, `${secret}x`)).toBe(false);
  });

  it("rejects a token of a completely different length without throwing", () => {
    // Both sides are hashed to 32 bytes first, so the comparison never sees a
    // length mismatch and never leaks the secret's length.
    expect(() => verifyGitlabPlaintextToken(secret, "x")).not.toThrow();
    expect(verifyGitlabPlaintextToken(secret, "x")).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifyGitlabPlaintextToken(secret, undefined)).toBe(false);
  });
});

/** Signs the way GitLab 19.0+ does, so the assertions below exercise the real format. */
function signGitlab(
  secret: string,
  id: string,
  timestamp: number,
  body: string,
): string {
  return createHmac("sha256", gitlabSigningKey(secret))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
}

function makeGitlabSecret(): string {
  return `whsec_${randomBytes(32).toString("base64")}`;
}

describe("verifyGitlabSignature", () => {
  const body = '{"object_kind":"push","total_commits_count":3}';
  const id = "01936c1f-0000-7000-8000-0123456789ab";
  const now = new Date("2026-08-14T12:00:00.000Z");
  const timestamp = Math.floor(now.getTime() / 1000);

  it("accepts a v1 signature over {id}.{timestamp}.{rawBody}", () => {
    const secret = makeGitlabSecret();
    const signature = `v1,${signGitlab(secret, id, timestamp, body)}`;

    expect(
      verifyGitlabSignature(
        Buffer.from(body, "utf8"),
        secret,
        { id, timestamp: String(timestamp), signature },
        now,
      ),
    ).toBe(true);
  });

  it("rejects the signature once the body is tampered with", () => {
    const secret = makeGitlabSecret();
    const signature = `v1,${signGitlab(secret, id, timestamp, body)}`;

    expect(
      verifyGitlabSignature(
        Buffer.from('{"object_kind":"push","total_commits_count":9}', "utf8"),
        secret,
        { id, timestamp: String(timestamp), signature },
        now,
      ),
    ).toBe(false);
  });

  it("rejects a signature bound to a different webhook id", () => {
    const secret = makeGitlabSecret();
    const signature = `v1,${signGitlab(secret, "another-id", timestamp, body)}`;

    expect(
      verifyGitlabSignature(
        Buffer.from(body, "utf8"),
        secret,
        { id, timestamp: String(timestamp), signature },
        now,
      ),
    ).toBe(false);
  });

  it("accepts a rotated key: any entry of the space-separated list may match", () => {
    // What GitLab sends mid-rotation — the old key first, the new one second.
    const retiredSecret = makeGitlabSecret();
    const currentSecret = makeGitlabSecret();

    const header = [
      `v1,${signGitlab(retiredSecret, id, timestamp, body)}`,
      `v1,${signGitlab(currentSecret, id, timestamp, body)}`,
    ].join(" ");

    expect(
      verifyGitlabSignature(
        Buffer.from(body, "utf8"),
        currentSecret,
        { id, timestamp: String(timestamp), signature: header },
        now,
      ),
    ).toBe(true);

    // And the entry order must not matter: the retired key still verifies while
    // it is being phased out.
    expect(
      verifyGitlabSignature(
        Buffer.from(body, "utf8"),
        retiredSecret,
        { id, timestamp: String(timestamp), signature: header },
        now,
      ),
    ).toBe(true);
  });

  it("rejects a list where no entry was signed with our key", () => {
    const ours = makeGitlabSecret();
    const header = [
      `v1,${signGitlab(makeGitlabSecret(), id, timestamp, body)}`,
      `v1,${signGitlab(makeGitlabSecret(), id, timestamp, body)}`,
    ].join(" ");

    expect(
      verifyGitlabSignature(
        Buffer.from(body, "utf8"),
        ours,
        { id, timestamp: String(timestamp), signature: header },
        now,
      ),
    ).toBe(false);
  });

  it("rejects an expired timestamp even though the signature itself is valid", () => {
    const secret = makeGitlabSecret();
    const staleTimestamp = timestamp - (GITLAB_REPLAY_WINDOW_SECONDS + 1);
    const signature = `v1,${signGitlab(secret, id, staleTimestamp, body)}`;

    expect(
      verifyGitlabSignature(
        Buffer.from(body, "utf8"),
        secret,
        { id, timestamp: String(staleTimestamp), signature },
        now,
      ),
    ).toBe(false);
  });

  it("rejects a timestamp from the future, which is as forgeable as an old one", () => {
    const secret = makeGitlabSecret();
    const futureTimestamp = timestamp + (GITLAB_REPLAY_WINDOW_SECONDS + 1);
    const signature = `v1,${signGitlab(secret, id, futureTimestamp, body)}`;

    expect(
      verifyGitlabSignature(
        Buffer.from(body, "utf8"),
        secret,
        { id, timestamp: String(futureTimestamp), signature },
        now,
      ),
    ).toBe(false);
  });

  it("accepts a timestamp at the edge of the replay window", () => {
    const secret = makeGitlabSecret();
    const edge = timestamp - GITLAB_REPLAY_WINDOW_SECONDS;
    const signature = `v1,${signGitlab(secret, id, edge, body)}`;

    expect(
      verifyGitlabSignature(
        Buffer.from(body, "utf8"),
        secret,
        { id, timestamp: String(edge), signature },
        now,
      ),
    ).toBe(true);
  });

  it("rejects an unversioned or unknown-version entry", () => {
    const secret = makeGitlabSecret();
    const raw = signGitlab(secret, id, timestamp, body);

    for (const header of [raw, `v2,${raw}`]) {
      expect(
        verifyGitlabSignature(
          Buffer.from(body, "utf8"),
          secret,
          { id, timestamp: String(timestamp), signature: header },
          now,
        ),
      ).toBe(false);
    }
  });

  it("rejects a delivery missing the id or timestamp it is supposed to be bound to", () => {
    const secret = makeGitlabSecret();
    const signature = `v1,${signGitlab(secret, id, timestamp, body)}`;

    expect(
      verifyGitlabSignature(
        Buffer.from(body, "utf8"),
        secret,
        { id: undefined, timestamp: String(timestamp), signature },
        now,
      ),
    ).toBe(false);

    expect(
      verifyGitlabSignature(
        Buffer.from(body, "utf8"),
        secret,
        { id, timestamp: undefined, signature },
        now,
      ),
    ).toBe(false);
  });
});

describe("gitlabSigningKey", () => {
  it("strips the whsec_ prefix and base64-DECODES the rest into bytes", () => {
    const key = randomBytes(32);
    const secret = `whsec_${key.toString("base64")}`;

    expect(gitlabSigningKey(secret).equals(key)).toBe(true);
    // The printable secret is NOT the key — signing with the string would
    // produce a digest GitLab never sends.
    expect(gitlabSigningKey(secret).toString("utf8")).not.toBe(secret);
  });
});
