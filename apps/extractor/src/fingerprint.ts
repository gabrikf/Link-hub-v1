import { createHash } from "node:crypto";
import { resolve } from "node:path";

/**
 * Every identifying string this package handles goes through here before it can
 * reach a file, a spool entry or the network.
 *
 * The API's `activityFingerprintSchema` rejects anything that is not 64 hex
 * characters, which makes it impossible for a clear-text identity to be stored
 * *by accident* — but "the server would have rejected it" is not the promise
 * this tool makes. The promise is that the identity never leaves the machine at
 * all, so hashing happens here, at the earliest possible point, and the
 * clear-text value is never written to the payload the user reviews.
 */

/** Hex sha-256. The one hash function in this package; there is no second one. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Removes every trailing `/`. Written as an explicit scan rather than a
 * `/\/+$/` regex: the regex is unanchored at the start and a linter's static
 * analyzer cannot prove it never backtracks, where this loop is provably O(n)
 * by construction.
 */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

/**
 * Collapses the many spellings of "the same repository" into one string.
 *
 * This matters for de-duplication, not just tidiness: the same repo cloned over
 * SSH on a laptop and over HTTPS on a desktop must fingerprint identically, or
 * re-running the extractor from the second machine would upload the whole
 * history a second time under a different repo identity.
 *
 * URL forms are lowercased (hosts and forge paths are case-insensitive in
 * practice); a filesystem path is only absolutised, because paths on Linux are
 * case-sensitive and lowercasing one would merge two genuinely distinct repos.
 */
export function normalizeRepoIdentity(identity: string): string {
  let value = identity.trim();
  if (!value) throw new Error("Cannot fingerprint an empty repo identity");

  // `git+https://…` (npm-style) and `ssh://…` both describe the same remote.
  value = value.replace(/^git\+/i, "");

  const scpLike = /^([^/@]+@)?([^/:]+):(.+)$/.exec(value);
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

  if (hasScheme) {
    // Strip scheme and any embedded credentials — a token pasted into a remote
    // URL is exactly the kind of secret that must not become part of a hash
    // input the user cannot audit.
    value = value
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
      .replace(/^[^@/]*@/, "");
    value = value.toLowerCase();
  } else if (scpLike && !value.startsWith("/") && !value.startsWith(".")) {
    // `git@github.com:acme/thing.git` → `github.com/acme/thing`
    value = `${scpLike[2]}/${scpLike[3]}`.toLowerCase();
  } else {
    // A local path. Absolutise so `.` and `../thing` agree with the real path.
    value = resolve(value);
  }

  // Trailing `.git` and slashes are noise the two clone forms disagree about.
  value = stripTrailingSlashes(value).replace(/\.git$/i, "");
  value = stripTrailingSlashes(value);

  return value;
}

/** `repoFingerprint` for an event. Accepts a remote URL or a local path. */
export function fingerprintRepo(identity: string): string {
  return sha256Hex(`crafthub:repo:${normalizeRepoIdentity(identity)}`);
}

/**
 * `counterpartyFingerprints` entry for a co-author, reviewer or approver.
 *
 * Lower-cased and trimmed so `Bob@Corp.com` and `bob@corp.com ` are one person.
 * The domain — which is usually the employer's — is hashed along with the rest
 * and never appears anywhere in the output.
 */
export function fingerprintCounterparty(identity: string): string {
  return sha256Hex(`crafthub:counterparty:${identity.trim().toLowerCase()}`);
}

/**
 * `externalDeliveryId` for a commit.
 *
 * The API treats `(source, externalDeliveryId)` as an idempotency key and
 * reports repeats as `duplicates` rather than errors, so this value decides
 * whether re-running the extractor over the same history is a free no-op or a
 * way to inflate someone's activity graph. It is therefore derived ONLY from
 * facts that cannot change for a given commit: the repo fingerprint and the
 * commit sha. No clock, no run id, no file ordering, no author — nothing that
 * differs between two runs, two machines, or a fresh clone.
 *
 * Both inputs are already opaque, and the result is hashed again so the commit
 * sha itself is not published: a raw sha would let anyone holding the private
 * repo confirm which commits are the user's.
 */
export function deliveryIdForCommit(
  repoFingerprint: string,
  commitSha: string,
): string {
  return sha256Hex(`crafthub:commit:${repoFingerprint}:${commitSha}`);
}

/**
 * `externalDeliveryId` for an agent session record.
 *
 * Keyed on the repo, the Claude Code session and the HEAD the session left
 * behind. HEAD is part of the key on purpose: it is what makes a re-spooled or
 * re-flushed record collapse into the same event, so a failed upload that is
 * retried next session cannot double-count.
 */
export function deliveryIdForAgentSession(
  repoFingerprint: string,
  sessionId: string,
  headSha: string,
): string {
  return sha256Hex(
    `crafthub:agent-session:${repoFingerprint}:${sessionId}:${headSha}`,
  );
}
