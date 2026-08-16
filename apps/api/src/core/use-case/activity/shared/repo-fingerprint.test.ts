import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  counterpartyFingerprintInput,
  normalizeRepoIdentity,
  repoFingerprintInput,
} from "./repo-fingerprint.js";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * These vectors pin the API's hashing to the EXTRACTOR's, byte for byte
 * (`apps/extractor/src/fingerprint.ts` and its test). The whole point of the
 * module is that a repo reported in clear by a webhook and pre-hashed by the
 * extractor lands on ONE fingerprint — if any expectation here has to change,
 * the extractor's must change identically, and every stored fingerprint is
 * orphaned. Treat a failure as a contract break, not a test to update.
 */
describe("repo-fingerprint — parity with the extractor", () => {
  it("reproduces the extractor's prefixed hash inputs exactly", () => {
    expect(repoFingerprintInput("git@github.com:acme/thing.git")).toBe(
      "linkhub:repo:github.com/acme/thing",
    );
    expect(counterpartyFingerprintInput(" Bob@Acme.com ")).toBe(
      "linkhub:counterparty:bob@acme.com",
    );
  });

  it("gives the SSH and HTTPS clone of one repo the same fingerprint", () => {
    // The bug this module fixes: `git@github.com:acme/api.git` via the hook and
    // `https://github.com/acme/api` via a webhook used to double-count.
    expect(sha256(repoFingerprintInput("git@github.com:acme/api.git"))).toBe(
      sha256(repoFingerprintInput("https://github.com/acme/api")),
    );
  });

  it("collapses the clone spellings of one repository into one fingerprint", () => {
    const expected = sha256(repoFingerprintInput("git@github.com:acme/thing.git"));

    for (const spelling of [
      "https://github.com/acme/thing.git",
      "https://github.com/acme/thing",
      "ssh://git@github.com/acme/thing.git",
      "git+https://github.com/acme/thing.git",
      "GIT@GITHUB.COM:Acme/Thing.git",
      "https://github.com/acme/thing/",
    ]) {
      expect(sha256(repoFingerprintInput(spelling))).toBe(expected);
    }
  });

  it("strips credentials embedded in a remote URL", () => {
    expect(
      normalizeRepoIdentity("https://user:ghp_secret@github.com/acme/thing.git"),
    ).toBe("github.com/acme/thing");
  });

  it("keeps genuinely different repositories apart", () => {
    expect(repoFingerprintInput("git@github.com:acme/a.git")).not.toBe(
      repoFingerprintInput("git@github.com:acme/b.git"),
    );
    // Linux paths are case-sensitive, so these are two directories.
    expect(repoFingerprintInput("/srv/Thing")).not.toBe(
      repoFingerprintInput("/srv/thing"),
    );
  });

  it("normalises a co-author identity so one person is one hash", () => {
    expect(counterpartyFingerprintInput(" Bob@Acme.com ")).toBe(
      counterpartyFingerprintInput("bob@acme.com"),
    );
  });

  it("never echoes any part of its input in the hash", () => {
    const secrets = ["acme-corp", "top-secret", "bob.smith"];
    const outputs = [
      sha256(repoFingerprintInput("git@github.com:acme-corp/top-secret.git")),
      sha256(counterpartyFingerprintInput("bob.smith@acme-corp.com")),
    ].join(" ");

    for (const secret of secrets) {
      expect(outputs).not.toContain(secret);
    }
  });

  it("refuses to fingerprint nothing", () => {
    expect(() => repoFingerprintInput("   ")).toThrow();
  });
});
