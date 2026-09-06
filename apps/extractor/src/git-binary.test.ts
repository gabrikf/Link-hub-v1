import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { CANDIDATE_NAMES, GIT_BINARY, resolveGitOnPath } from "./git-binary.js";
import { cleanupTempRepos, createTempDir, run } from "./test-support.js";

afterAll(cleanupTempRepos);

/** The name `resolveGitOnPath` will actually look for on this platform. */
const GIT_FILENAME = CANDIDATE_NAMES[0] ?? "git";

/** A directory holding an executable file that looks like git to the scan. */
function dirWithGit(): string {
  const dir = createTempDir("crafthub-path-");
  const file = join(dir, GIT_FILENAME);
  writeFileSync(file, "#!/bin/sh\nexit 0\n", "utf8");
  chmodSync(file, 0o755);
  return dir;
}

describe("resolveGitOnPath", () => {
  it("returns null when PATH is unset or empty", () => {
    expect(resolveGitOnPath(undefined)).toBeNull();
    expect(resolveGitOnPath("")).toBeNull();
  });

  it("finds git in an absolute PATH entry", () => {
    const dir = dirWithGit();
    expect(resolveGitOnPath(dir)).toBe(join(dir, GIT_FILENAME));
  });

  it("takes the FIRST matching entry, like the shell does", () => {
    const first = dirWithGit();
    const second = dirWithGit();
    expect(resolveGitOnPath([first, second].join(delimiter))).toBe(
      join(first, GIT_FILENAME),
    );
  });

  it("skips relative and empty entries rather than resolving them against cwd", () => {
    const real = dirWithGit();
    // A leading empty entry and a `.` are exactly the caller-controlled lookup
    // this module exists to refuse; they must not shadow the real hit.
    const searchPath = ["", ".", "./bin", real].join(delimiter);
    expect(resolveGitOnPath(searchPath)).toBe(join(real, GIT_FILENAME));
  });

  it("returns null when a relative entry is the only thing that would match", () => {
    expect(resolveGitOnPath([".", "./bin"].join(delimiter))).toBeNull();
  });

  it("ignores a DIRECTORY named git", () => {
    const dir = createTempDir("crafthub-path-");
    mkdirSync(join(dir, GIT_FILENAME));
    expect(resolveGitOnPath(dir)).toBeNull();
  });

  it("ignores a non-executable file named git", () => {
    const dir = createTempDir("crafthub-path-");
    const file = join(dir, GIT_FILENAME);
    writeFileSync(file, "not executable", "utf8");
    chmodSync(file, 0o644);
    expect(resolveGitOnPath(dir)).toBeNull();
  });

  it("skips a PATH entry that does not exist at all", () => {
    const real = dirWithGit();
    const missing = join(real, "definitely-not-here");
    expect(resolveGitOnPath([missing, real].join(delimiter))).toBe(
      join(real, GIT_FILENAME),
    );
  });
});

describe("GIT_BINARY", () => {
  it("resolves to the same git the current PATH would have run", () => {
    expect(GIT_BINARY).toBe(resolveGitOnPath(process.env.PATH) ?? "git");
  });

  it("is usable: running it reports a git version", () => {
    // The whole point of the module is that this path still runs real git.
    const dir = createTempDir("crafthub-path-");
    const output = run(dir, ["--version"]);
    expect(output).toMatch(/^git version /);
  });
});
