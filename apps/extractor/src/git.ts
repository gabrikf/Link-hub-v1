import { spawnSync } from "node:child_process";

/**
 * The only place this package shells out to `git`.
 *
 * Everything is read-only (`log`, `config --get`, `rev-parse`) and every call
 * is scoped to an explicit `-C <repo>` so a mis-specified path can never make
 * the extractor read the *current* directory by surprise.
 *
 * `spawnSync` with an argument array — never a shell string — so a repository
 * path containing spaces, quotes or `$(…)` is an argument and not something the
 * shell gets an opinion about.
 */

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

/** ASCII record/unit/group separators: bytes that cannot occur in a git path. */
const RECORD = "\x1e";
const FIELD = "\x1f";
const GROUP = "\x1d";

/**
 * Spawned by bare name so it resolves through `PATH`, same as typing `git` at
 * a shell — the standard, expected way to invoke it for a tool like this one.
 * Hoisted to a named const per the repo's os-command-from-path convention.
 */
const GIT_BIN = "git";

function git(repoPath: string, args: readonly string[]): string {
  const result = spawnSync(GIT_BIN, ["-C", repoPath, ...args], {
    encoding: "utf8",
    // A decade of history in a large monorepo is comfortably megabytes of
    // path listings; the default 1 MB buffer would silently truncate it.
    maxBuffer: 256 * 1024 * 1024,
  });

  if (result.error) {
    throw new GitError(
      `Could not run git in ${repoPath}: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    const stderrSuffix = stderr ? `: ${stderr}` : "";
    throw new GitError(
      `git ${args[0] ?? ""} failed in ${repoPath}${stderrSuffix}`,
    );
  }
  return result.stdout ?? "";
}

/** Non-throwing variant for the many "this may legitimately be unset" reads. */
function gitOrNull(repoPath: string, args: readonly string[]): string | null {
  try {
    const value = git(repoPath, args).trim();
    return value === "" ? null : value;
  } catch {
    return null;
  }
}

export function isGitRepository(repoPath: string): boolean {
  return gitOrNull(repoPath, ["rev-parse", "--git-dir"]) !== null;
}

/** Absolute path of the repository root, used to key one repo per work unit. */
export function repositoryRoot(repoPath: string): string {
  const root = gitOrNull(repoPath, ["rev-parse", "--show-toplevel"]);
  if (!root) throw new GitError(`${repoPath} is not inside a git repository`);
  return root;
}

/**
 * The string that gets fingerprinted as the repo identity.
 *
 * Preferring the remote over the path is what makes the fingerprint stable
 * across machines and checkouts — two clones of the same work repo must produce
 * the same `repoFingerprint` or the server cannot de-duplicate them. A repo with
 * no remote falls back to its absolute path, which is at least stable locally.
 *
 * The returned value is CLEAR TEXT and must be handed straight to
 * `fingerprintRepo` — never stored, logged or written to the payload.
 */
export function repositoryIdentity(repoPath: string): string {
  const remote =
    gitOrNull(repoPath, ["config", "--get", "remote.origin.url"]) ??
    gitOrNull(repoPath, ["remote", "get-url", "origin"]);
  return remote ?? repositoryRoot(repoPath);
}

/** `git config user.email` — the default answer to "which commits are mine". */
export function configuredAuthorEmail(repoPath: string): string | null {
  return gitOrNull(repoPath, ["config", "--get", "user.email"]);
}

/** Current HEAD commit sha, or null in a repo with no commits yet. */
export function headSha(repoPath: string): string | null {
  return gitOrNull(repoPath, ["rev-parse", "HEAD"]);
}

/** One commit, still holding clear-text identities. Never serialize this. */
export interface RawCommit {
  readonly sha: string;
  readonly authorEmail: string;
  /** `YYYY-MM-DD` already — see `readCommits` for why it is not a timestamp. */
  readonly date: string;
  readonly coAuthorEmails: readonly string[];
  readonly changedPaths: readonly string[];
}

export interface ReadCommitsOptions {
  /** Lower-cased author emails to accept. Matching is exact, not fuzzy. */
  readonly authors: readonly string[];
  /** Anything `git log --since` accepts, e.g. `90.days.ago` or `2026-01-01`. */
  readonly since?: string;
  readonly until?: string;
  readonly maxCommits?: number;
  /**
   * What to walk. Defaults to `HEAD`. The hook passes `<oldHead>..<newHead>` to
   * ask "what landed during this stretch of the session" without re-reading
   * history it has already accounted for.
   */
  readonly revisionRange?: string;
}

/**
 * Reads the user's own commits out of a repository.
 *
 * Three deliberate choices:
 *
 * 1. **`--date=short`** — the date is formatted by git in the commit's own
 *    recorded timezone and never reaches this process as a timestamp. There is
 *    no hour to accidentally forward, and the value does not shift if the
 *    extractor is run from a laptop in another timezone.
 *
 * 2. **Trailers, not the message.** The format asks git for
 *    `%(trailers:key=Co-authored-by,valueonly)` rather than `%B`. The commit
 *    message — the single richest source of an employer's confidential
 *    information — is therefore never read into memory at all, which is a
 *    stronger guarantee than reading it and promising not to use it.
 *
 * 3. **`--author` prefilters, JavaScript decides.** git's `--author` is a
 *    substring regex, so `a@corp.com` would also match `xa@corp.com`. It is
 *    passed for speed (git can skip most of the history) and then every commit
 *    is re-checked against an exact, case-insensitive set. Multiple emails are
 *    ORed, because the same person routinely commits as `me@work.com` and
 *    `me@personal.dev` and losing half their history is the bug this guards.
 */
/** Builds the `git log` argv for {@link readCommits}. */
function buildReadCommitsArgs(
  accepted: ReadonlySet<string>,
  options: ReadCommitsOptions,
): string[] {
  const format =
    `${RECORD}%H${FIELD}%ae${FIELD}%ad${FIELD}` +
    `%(trailers:key=Co-authored-by,valueonly,separator=${GROUP})`;

  const args = [
    "log",
    // Merges carry no diff of their own, so they would add commits with zero
    // technologies while double-counting work already counted on the branch.
    "--no-merges",
    "--name-only",
    `--format=${format}`,
    "--date=short",
    // Email addresses are case-insensitive, and the same person routinely
    // appears as `Me@Work.com` and `me@work.com` across machines. Without this
    // the git-side prefilter silently drops half their history before the exact
    // check below ever sees it.
    "--regexp-ignore-case",
  ];
  for (const author of accepted) args.push(`--author=${author}`);
  if (options.since) args.push(`--since=${options.since}`);
  if (options.until) args.push(`--until=${options.until}`);
  if (options.maxCommits) args.push(`--max-count=${options.maxCommits}`);
  args.push(options.revisionRange ?? "HEAD");
  return args;
}

/**
 * Parses one `RECORD`-delimited chunk of `git log` output into a commit, or
 * `null` when the chunk is blank or its author does not match `accepted`.
 */
function parseCommitChunk(
  chunk: string,
  accepted: ReadonlySet<string>,
): RawCommit | null {
  if (!chunk.trim()) return null;

  // The header line, then a blank line, then one path per line.
  const newline = chunk.indexOf("\n");
  const header = newline === -1 ? chunk : chunk.slice(0, newline);
  const rest = newline === -1 ? "" : chunk.slice(newline + 1);

  const [sha, authorEmail, date, trailers] = header.split(FIELD);
  if (!sha || !authorEmail || !date) return null;
  if (!accepted.has(authorEmail.trim().toLowerCase())) return null;

  return {
    sha,
    authorEmail: authorEmail.trim(),
    date: date.trim(),
    coAuthorEmails: parseCoAuthorEmails(trailers ?? ""),
    changedPaths: rest
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  };
}

export function readCommits(
  repoPath: string,
  options: ReadCommitsOptions,
): RawCommit[] {
  const accepted = new Set(options.authors.map((a) => a.trim().toLowerCase()));
  if (accepted.size === 0) return [];

  const args = buildReadCommitsArgs(accepted, options);

  // An empty repository has no HEAD; that is "no activity", not a failure.
  if (headSha(repoPath) === null) return [];

  // A range whose left side has been rewritten or garbage-collected makes git
  // exit non-zero. That is a reason to record nothing, not to fail the caller —
  // the hook in particular must never surface an error into a user's session.
  let stdout: string;
  try {
    stdout = git(repoPath, args);
  } catch {
    return [];
  }

  const commits: RawCommit[] = [];
  for (const chunk of stdout.split(RECORD)) {
    const commit = parseCommitChunk(chunk, accepted);
    if (commit) commits.push(commit);
  }
  return commits;
}

/**
 * Pulls the email out of `Co-authored-by` trailer values (`Name <a@b.c>`).
 *
 * A trailer without a bracketed address falls back to the whole value: it is
 * still an identity, it still gets hashed, and dropping it would silently lose
 * a collaborator rather than protect one.
 */
export function parseCoAuthorEmails(trailerBlock: string): string[] {
  const emails: string[] = [];
  for (const raw of trailerBlock.split(GROUP)) {
    const value = raw.trim();
    if (!value) continue;
    emails.push(extractAngledAddress(value).trim());
  }
  return emails;
}

/**
 * Pulls `a@b.c` out of `Name <a@b.c>`, or returns `value` unchanged when it
 * carries no bracketed address. Written as an explicit scan rather than a
 * `/<([^>]+)>/` regex: a linter's static analyzer cannot prove the unanchored
 * `+` never backtracks, where this is provably O(n) by construction.
 */
function extractAngledAddress(value: string): string {
  const open = value.indexOf("<");
  const close = open === -1 ? -1 : value.indexOf(">", open + 1);
  return close > open + 1 ? value.slice(open + 1, close) : value;
}
