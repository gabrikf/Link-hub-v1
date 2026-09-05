import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

/**
 * Resolves `git` to an absolute path, once, when this module is first loaded.
 *
 * **Why this exists.** Spawning the bare name `git` makes the OS re-run the
 * `PATH` search on every call, so whichever directory happens to sit earliest
 * on `PATH` at that moment decides which binary executes. On a machine where
 * any entry is writeable — a stale `./node_modules/.bin`, a shared
 * `/usr/local/bin`, a `.` someone left on `PATH` — that is an
 * arbitrary-code-execution seam in a tool that reads people's git history.
 * `sonarjs/no-os-command-from-path` (SonarSource S4036) flags exactly that,
 * and it is right to.
 *
 * **Why it still runs the same binary.** The scan mirrors what the shell would
 * have done: walk `PATH` left to right and take the FIRST directory holding an
 * executable `git`. On a normal developer machine the result is the identical
 * binary a bare `git` would have selected — this hardens *when* the lookup
 * happens (once, at load, against a snapshot of `PATH`) and *which* entries are
 * eligible, not *what* gets run. That mattered enough to rule out the obvious
 * alternative of a hard-coded list like `/usr/bin/git` before
 * `/opt/homebrew/bin/git`: on macOS that would pick a genuinely different git
 * from the one the developer's shell uses.
 *
 * **Why relative entries are skipped.** An empty or relative `PATH` entry
 * (`""`, `.`, `./bin`) resolves against the *current working directory*, which
 * for this CLI is whatever repository the user happened to run it from. That is
 * the caller-controlled lookup the rule is about, so those entries are dropped
 * rather than resolved.
 *
 * **Why there is a fallback.** An unusual `PATH`, a container that populates it
 * after start-up, or Windows (where the file is `git.exe` and is found by the
 * candidate list below, but a hand-rolled scan should never be the last word)
 * would otherwise leave the extractor unable to run at all. Falling back to the
 * bare name keeps it working exactly as it did before, and lets the failure —
 * if there is one — arrive as git's own "command not found" rather than a
 * confusing message of ours.
 */

const GIT_COMMAND = "git";

/**
 * POSIX executables carry no suffix. Windows needs the extension spelled out,
 * and these are hard-coded rather than read from `PATHEXT` so the candidate set
 * cannot itself be steered by the environment.
 */
export const CANDIDATE_NAMES: readonly string[] =
  process.platform === "win32"
    ? [`${GIT_COMMAND}.exe`, `${GIT_COMMAND}.cmd`, `${GIT_COMMAND}.bat`]
    : [GIT_COMMAND];

function isExecutableFile(candidate: string): boolean {
  try {
    // `statSync` follows symlinks on purpose: `/usr/bin/git` is one on plenty
    // of distributions, and the link target is what actually runs.
    if (!statSync(candidate).isFile()) return false;
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Takes the `PATH` string rather than reading it, so the scan is a pure
 * function the tests can drive with a fabricated search path.
 */
export function resolveGitOnPath(
  searchPath: string | undefined,
): string | null {
  if (!searchPath) return null;

  for (const entry of searchPath.split(delimiter)) {
    if (!entry || !isAbsolute(entry)) continue;
    for (const name of CANDIDATE_NAMES) {
      const candidate = join(entry, name);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * The absolute path to `git`, or the bare name when `PATH` yielded nothing.
 * Every `spawnSync` / `execFileSync` of git in this package goes through this.
 */
export const GIT_BINARY: string =
  resolveGitOnPath(process.env.PATH) ?? GIT_COMMAND;
