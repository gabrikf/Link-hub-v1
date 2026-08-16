import { resolve } from "node:path";

/**
 * The API-side half of the fingerprint contract it shares with the extractor.
 *
 * The same repository reaches the activity log by two routes: a webhook relay
 * or hook sends the identity IN CLEAR for the API to hash on arrival, and the
 * extractor hashes locally and sends only the fingerprint. Those two hashes
 * must be byte-identical, or one repo becomes two identities and every
 * per-repo aggregate — sustained engagement above all — double-counts it.
 *
 * `normalizeRepoIdentity` and the two prefixed hash inputs below are therefore
 * a byte-for-byte copy of `apps/extractor/src/fingerprint.ts`, and the
 * colocated test pins them to the extractor's own vectors. Change either side
 * only together, and know that changing them at all orphans every fingerprint
 * already stored.
 *
 * Only the HASH INPUTS are built here; the sha-256 itself stays on the
 * injected `ITokenProvider` so core keeps a single hash implementation and no
 * `node:crypto` import. `node:path` is the one exception to the no-node rule:
 * absolutising a local path is part of the normalization contract, not infra.
 */

/**
 * Collapses the many spellings of "the same repository" into one string.
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
    value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^[^@/]*@/, "");
    value = value.toLowerCase();
  } else if (scpLike && !value.startsWith("/") && !value.startsWith(".")) {
    // `git@github.com:acme/thing.git` → `github.com/acme/thing`
    value = `${scpLike[2]}/${scpLike[3]}`.toLowerCase();
  } else {
    // A local path. Absolutise so `.` and `../thing` agree with the real path.
    value = resolve(value);
  }

  // Trailing `.git` and slashes are noise the two clone forms disagree about.
  value = value.replace(/\/+$/, "").replace(/\.git$/i, "").replace(/\/+$/, "");

  return value;
}

/**
 * The exact string whose sha-256 is a `repoFingerprint`. The `linkhub:repo:`
 * prefix domain-separates it from every other hash in the product, so a repo
 * fingerprint can never collide with a counterparty's or a token's.
 */
export function repoFingerprintInput(identity: string): string {
  return `linkhub:repo:${normalizeRepoIdentity(identity)}`;
}

/**
 * The exact string whose sha-256 is a `counterpartyFingerprints` entry.
 *
 * Lower-cased and trimmed so `Bob@Corp.com` and `bob@corp.com ` are one person
 * — mirroring the extractor, which already applies the same folding.
 */
export function counterpartyFingerprintInput(identity: string): string {
  return `linkhub:counterparty:${identity.trim().toLowerCase()}`;
}
