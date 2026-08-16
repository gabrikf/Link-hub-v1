import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Throwaway git repositories for the tests.
 *
 * Every git-dependent test builds its own repository in a temp directory and
 * deletes it afterwards. Nothing here reads THIS repository's history: a test
 * suite for a privacy tool that quietly scanned the developer's own commits
 * would be self-refuting, and a test whose expectations depend on real history
 * fails the day someone commits.
 */

const created: string[] = [];

/** An empty repository on a known branch, with commit signing disabled. */
export function createTempRepo(prefix = "linkhub-extractor-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  run(dir, ["init", "--quiet", "--initial-branch=main"]);
  run(dir, ["config", "commit.gpgsign", "false"]);
  run(dir, ["config", "user.name", "Test User"]);
  run(dir, ["config", "user.email", "default@example.test"]);
  return dir;
}

export interface CommitOptions {
  /** Repo-relative paths to create/overwrite. */
  readonly files: Readonly<Record<string, string>>;
  readonly authorEmail?: string;
  readonly authorName?: string;
  readonly message?: string;
  /** `Co-authored-by` trailers, as raw email addresses. */
  readonly coAuthors?: readonly string[];
  /** `YYYY-MM-DD`; pinned so date assertions do not depend on the clock. */
  readonly date?: string;
}

/** Writes files and commits them. Returns the new commit sha. */
export function commit(repo: string, options: CommitOptions): string {
  for (const [path, contents] of Object.entries(options.files)) {
    const full = join(repo, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents, "utf8");
  }
  run(repo, ["add", "--all"]);

  // git only recognises trailers in ONE final paragraph, so every
  // `Co-authored-by` line has to share a single block.
  const coAuthors = options.coAuthors ?? [];
  const trailers =
    coAuthors.length > 0
      ? `\n\n${coAuthors
          .map((email) => `Co-authored-by: Someone <${email}>`)
          .join("\n")}`
      : "";
  const message = `${options.message ?? "chore: change"}${trailers}`;

  const stamp = options.date ? `${options.date}T12:00:00+00:00` : undefined;

  run(
    repo,
    [
      "-c",
      `user.email=${options.authorEmail ?? "default@example.test"}`,
      "-c",
      `user.name=${options.authorName ?? "Test User"}`,
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      message,
    ],
    stamp
      ? { GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp }
      : undefined,
  );

  return run(repo, ["rev-parse", "HEAD"]).trim();
}

/** Points the repo at a remote URL so the fingerprint uses it, not the path. */
export function setRemote(repo: string, url: string): void {
  run(repo, ["remote", "add", "origin", url]);
}

export function createBranch(repo: string, name: string): void {
  run(repo, ["checkout", "--quiet", "-b", name]);
}

/** Sets a repo-local git config value, e.g. the `user.email` for discovery. */
export function setConfig(repo: string, key: string, value: string): void {
  run(repo, ["config", key, value]);
}

export function run(
  repo: string,
  args: readonly string[],
  env?: Record<string, string>,
): string {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

/** Removes every repo made during the run. Call from `afterAll`. */
export function cleanupTempRepos(): void {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A scratch directory that is not a git repository (spool dirs, output files). */
export function createTempDir(prefix = "linkhub-scratch-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}
