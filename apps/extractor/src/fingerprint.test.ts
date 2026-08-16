import { activityFingerprintSchema } from "@repo/schemas";
import { describe, expect, it } from "vitest";
import {
  deliveryIdForAgentSession,
  deliveryIdForCommit,
  fingerprintCounterparty,
  fingerprintRepo,
  normalizeRepoIdentity,
} from "./fingerprint.js";

/**
 * `activityFingerprintSchema` is used as the oracle rather than a local regex:
 * it is literally the rule the API applies, so a fingerprint that satisfies it
 * here is one the server will accept, and a fingerprint that does not is a
 * clear-text identity that escaped hashing.
 */
describe("fingerprints", () => {
  it("produces values the API's fingerprint schema accepts", () => {
    const values = [
      fingerprintRepo("git@github.com:acme-corp/top-secret.git"),
      fingerprintRepo("/home/someone/work/top-secret"),
      fingerprintCounterparty("Bob.Smith@Acme-Corp.com"),
      deliveryIdForCommit(fingerprintRepo("x"), "deadbeef"),
      deliveryIdForAgentSession(fingerprintRepo("x"), "session-1", "deadbeef"),
    ];

    for (const value of values) {
      expect(value).toMatch(/^[0-9a-f]{64}$/);
      expect(activityFingerprintSchema.safeParse(value).success).toBe(true);
    }
  });

  it("never echoes any part of its input", () => {
    const secrets = ["acme-corp", "top-secret", "bob.smith"];
    const outputs = [
      fingerprintRepo("git@github.com:acme-corp/top-secret.git"),
      fingerprintCounterparty("bob.smith@acme-corp.com"),
    ].join(" ");

    for (const secret of secrets) {
      expect(outputs).not.toContain(secret);
    }
  });

  it("collapses the clone spellings of one repository into one fingerprint", () => {
    // The same work repo cloned over SSH on a laptop and HTTPS on a desktop
    // must not upload its history twice under two identities.
    const expected = fingerprintRepo("git@github.com:acme/thing.git");
    for (const spelling of [
      "https://github.com/acme/thing.git",
      "https://github.com/acme/thing",
      "ssh://git@github.com/acme/thing.git",
      "git+https://github.com/acme/thing.git",
      "GIT@GITHUB.COM:Acme/Thing.git",
      "https://github.com/acme/thing/",
    ]) {
      expect(fingerprintRepo(spelling)).toBe(expected);
    }
  });

  it("strips credentials embedded in a remote URL", () => {
    expect(normalizeRepoIdentity("https://user:ghp_secret@github.com/acme/thing.git")).toBe(
      "github.com/acme/thing",
    );
    expect(fingerprintRepo("https://user:ghp_secret@github.com/acme/thing.git")).toBe(
      fingerprintRepo("https://github.com/acme/thing"),
    );
  });

  it("keeps genuinely different repositories apart", () => {
    expect(fingerprintRepo("git@github.com:acme/a.git")).not.toBe(
      fingerprintRepo("git@github.com:acme/b.git"),
    );
    // Linux paths are case-sensitive, so these are two directories.
    expect(fingerprintRepo("/srv/Thing")).not.toBe(fingerprintRepo("/srv/thing"));
  });

  it("normalises a co-author identity so one person is one hash", () => {
    expect(fingerprintCounterparty(" Bob@Acme.com ")).toBe(
      fingerprintCounterparty("bob@acme.com"),
    );
  });

  it("derives delivery ids only from stable facts", () => {
    const repo = fingerprintRepo("git@github.com:acme/thing.git");
    // Same repo + same commit → same id, forever, on any machine.
    expect(deliveryIdForCommit(repo, "abc123")).toBe(
      deliveryIdForCommit(repo, "abc123"),
    );
    expect(deliveryIdForCommit(repo, "abc123")).not.toBe(
      deliveryIdForCommit(repo, "abc124"),
    );
    // The raw commit sha must not be recoverable from the id.
    expect(deliveryIdForCommit(repo, "abc123")).not.toContain("abc123");
  });

  it("keys an agent session on repo + session + head", () => {
    const repo = fingerprintRepo("git@github.com:acme/thing.git");
    expect(deliveryIdForAgentSession(repo, "s1", "h1")).toBe(
      deliveryIdForAgentSession(repo, "s1", "h1"),
    );
    expect(deliveryIdForAgentSession(repo, "s1", "h1")).not.toBe(
      deliveryIdForAgentSession(repo, "s2", "h1"),
    );
    expect(deliveryIdForAgentSession(repo, "s1", "h1")).not.toBe(
      deliveryIdForAgentSession(repo, "s1", "h2"),
    );
  });

  it("refuses to fingerprint nothing", () => {
    expect(() => fingerprintRepo("   ")).toThrow();
  });
});
