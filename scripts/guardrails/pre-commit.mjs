#!/usr/bin/env node
/**
 * THE COMMIT HOOK. Format, autofix, and refuse what is left.
 *
 * This is deliberately NOT a small version of the push gate. The two hooks
 * answer different questions:
 *
 *   pre-commit   is this file well-formed and free of new lint findings?
 *                Staged files only. Autofixes. Measured on this repo: 2.8s for
 *                a commit inside one workspace, ~5s when it spans two (eslint
 *                is started once per workspace, and most of that is startup).
 *   pre-push     does the whole affected graph still build, type-check, test,
 *                and hold its guardrails? Budget: 90 seconds.
 *
 * A commit hook that runs tests is a commit hook people disable, so this one
 * does the cheapest thing that still catches something real: prettier, then
 * eslint --fix, then block if anything unfixable remains.
 *
 * SYNTACTIC RULES ONLY. The type-aware rules build a TypeScript program, which
 * is a large fixed cost rather than a per-file one: 18 seconds to check two
 * changed files, against 5 for the same two syntactically. That is fine inside
 * the 90-second push gate and wrong between typing `git commit` and getting
 * your terminal back, so they run through `lint-changed.mjs` at push time and
 * in CI instead.
 *
 * IT RE-STAGES WHAT IT FIXED. Otherwise prettier's changes sit in the working
 * tree and the commit records the unformatted version — the single most
 * confusing way for a format-on-commit hook to fail.
 *
 * `git commit --no-verify` exists and this file cannot stop you. If you reach
 * for it, say so in the PR.
 */
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const LINTABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const FORMATTABLE = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|yml|yaml)$/;
/** Linting a flat config with the type-aware config crashes; see lint-changed. */
const NOT_LINTABLE = /(^|\/)eslint(\.typed)?\.config\.(js|mjs)$/;

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return result.status === 0 ? String(result.stdout) : "";
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    encoding: "utf8",
  });
}

function main() {
  const started = Date.now();

  /**
   * `--diff-filter=ACMR` drops deletions: a file staged for deletion still
   * appears in `--name-only`, and formatting a path that is gone is a crash.
   *
   * Symlinks are dropped too. `.claude/agents/*.md` are per-file links into
   * `.agents/agents/`, and prettier refuses an explicitly named symlink with an
   * `[error]` line while still exiting 0 — a hook that prints errors and passes
   * is a hook people stop reading. The link's target is formatted on its own.
   */
  const staged = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => existsSync(resolve(ROOT, file)))
    .filter((file) => !lstatSync(resolve(ROOT, file)).isSymbolicLink());

  if (staged.length === 0) {
    console.log("pre-commit: nothing staged.");
    return 0;
  }

  const toFormat = staged.filter((f) => FORMATTABLE.test(f));
  const toLint = staged.filter(
    (f) => LINTABLE.test(f) && !NOT_LINTABLE.test(f),
  );

  if (toFormat.length === 0 && toLint.length === 0) {
    console.log(
      `pre-commit: ${staged.length} staged file(s), none formattable or lintable.`,
    );
    return 0;
  }

  console.log("");
  console.log(`── pre-commit ${"─".repeat(50)}`);

  if (toFormat.length > 0) {
    run("npx", ["prettier", "--write", "--log-level", "warn", ...toFormat]);
  }

  let lintStatus = 0;
  if (toLint.length > 0) {
    lintStatus = run(process.execPath, [
      resolve(ROOT, "scripts/guardrails/lint-changed.mjs"),
      "--syntactic",
      "--fix",
      "--files",
      ...toLint,
    ]).status;
  }

  // Re-stage AFTER both passes, so the commit contains what was actually
  // written to disk rather than the version you typed.
  const touched = [...new Set([...toFormat, ...toLint])];
  if (touched.length > 0) git(["add", "--", ...touched]);

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  if (lintStatus === 0) {
    console.log(
      `   ${touched.length} file(s) formatted and linted in ${elapsed}s`,
    );
    console.log("pre-commit PASS");
    console.log("");
    return 0;
  }

  console.log("");
  console.log(`pre-commit FAIL — ${elapsed}s`);
  console.log(
    "   Autofixable problems were fixed and re-staged. What is left needs you.",
  );
  console.log(
    "   Fix the cause: no inline eslint-disable, no `as any`, no --no-verify.",
  );
  console.log("");
  return 1;
}

process.exit(main());
