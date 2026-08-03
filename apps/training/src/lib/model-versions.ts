/**
 * Version numbering for the published model directories.
 *
 * `parseInt(version.replace(/^v/, ""), 10)` was doing all the work here, which
 * meant any non-numeric pointer ("v2-hotfix", "latest", a truncated file) parsed
 * as NaN, fell back to `"v2"`, and then `model.save()` happily overwrote the
 * existing v2 directory — destroying the artifact the browser was serving.
 */

const VERSION_PATTERN = /^v(\d+)$/;

export function parseVersionNumber(version: string): number | null {
  const match = VERSION_PATTERN.exec(version.trim());
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Next free version, given the current pointer and whatever directories already
 * exist on disk.
 *
 * Never returns a name that is already taken: the maximum of "pointer + 1" and
 * "highest existing + 1". An unparseable pointer is not a reason to reuse a
 * directory — it is a reason to move past every directory there is.
 */
export function resolveNextVersion(
  currentVersion: string | null,
  existingVersions: readonly string[],
): { current: string; next: string } {
  const current = currentVersion ?? "v1";

  const existingNumbers = existingVersions
    .map(parseVersionNumber)
    .filter((value): value is number => value !== null);

  const currentNumber = parseVersionNumber(current);
  const highest = Math.max(0, ...existingNumbers, currentNumber ?? 0);

  return { current, next: `v${highest + 1}` };
}
