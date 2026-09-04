#!/usr/bin/env node
/**
 * ESLint with a RATCHET: fails on findings you introduced, not on the backlog.
 *
 * THE PROBLEM THIS SOLVES. Two obvious designs both fail:
 *
 *   (a) `npm run lint` on the whole repo — red on an empty commit, because
 *       apps/web carries recorded debt and apps/api has never been linted at
 *       all. A gate that is red before you type anything is a gate people
 *       learn to pass with `--no-verify`.
 *
 *   (b) "lint only the files this change touched" — sounds right, and is what
 *       this script did first. It breaks the moment you have a genuinely large
 *       change in flight: every pre-existing violation in every file you have
 *       open becomes "yours", and you are blocked on somebody else's debt.
 *
 * So: BOTH. Scope to the changed files (fast, and about your work), and compare
 * what is found against a recorded baseline of known findings, keyed by file +
 * rule. A finding already in the baseline is known debt and passes. A finding
 * that is not — a new rule violation, or one more instance of an existing one
 * in the same file — fails. This is the same idea as the `LINT_ERROR_BASELINE`
 * ratchet in .github/workflows/ci.yml, at file+rule granularity instead of one
 * repo-wide integer, so it cannot be gamed by fixing one error and adding
 * another somewhere else.
 *
 * WHY COUNTS AND NOT LINE NUMBERS. The baseline stores how many times each rule
 * fires in each file, never where. Line numbers shift on every edit above them,
 * so a line-keyed baseline reports a wave of phantom "new" findings after any
 * insertion — which is how a ratchet becomes noise and gets deleted.
 *
 * WHAT IT ADDS OVER `npm run lint`. Since 2026-09-04 every workspace has a
 * `lint` script, so the syntactic rules are covered repo-wide by that. This
 * script exists for the layer that is NOT: the type-aware rules in
 * `eslint.typed.config.js`, which cost about five times the runtime and carry a
 * 589-finding backlog. Running those repo-wide would be red on arrival; running
 * them here, against the baseline, blocks the 590th without blocking anybody on
 * the 589.
 *
 * Usage:
 *   node scripts/guardrails/lint-changed.mjs                    # vs merge-base with origin/main
 *   node scripts/guardrails/lint-changed.mjs --base <ref>
 *   node scripts/guardrails/lint-changed.mjs --files a.ts b.tsx
 *   node scripts/guardrails/lint-changed.mjs --update-baseline  # re-record ALL known debt
 *
 * `--update-baseline` lints every lintable file in the repo and rewrites
 * scripts/guardrails/lint-baseline.json. Run it when you FIX debt, to lock the
 * improvement in. Running it to silence a finding you just introduced is a
 * workaround — the diff on that file is reviewable precisely so that shows up.
 *
 * Exit codes: 0 clean or only known debt, 1 new findings.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const BASELINE_PATH = resolve(ROOT, "scripts/guardrails/lint-baseline.json");

/**
 * Workspaces that own an eslint flat config. ESLint 9 resolves a flat config's
 * `files`/`ignores` patterns and its plugin imports relative to the config's own
 * directory, so each workspace is linted with `cwd` set to it. Linting from the
 * repo root with one `--config` flag silently matches nothing.
 */
const LINTABLE_WORKSPACES = [
  "apps/web",
  "apps/api",
  "apps/mcp",
  "apps/extractor",
  "apps/training",
  "packages/schemas",
  "packages/ui",
];

/**
 * The ratchet lints with `eslint.typed.config.js`, not `eslint.config.js`.
 *
 * That config is the syntactic rules PLUS the type-aware ones —
 * `no-unsafe-assignment`, `no-unsafe-member-access`, `no-floating-promises`,
 * `no-misused-promises`. They are the only rules that can answer "is this value
 * actually typed?", and they are the reason this ratchet exists: turning them on
 * reported 788 findings across api and web. Every one is recorded in
 * lint-baseline.json, and the 789th fails.
 *
 * They are NOT in `eslint.config.js` because that is what `npm run lint` runs,
 * repo-wide, and it is meant to be green. Type-aware linting also costs about
 * five times the runtime (40s for apps/api against 8s), which is fine for a
 * handful of changed files and far too slow for a whole-repo script.
 */
const RATCHET_CONFIG = "eslint.typed.config.js";

const LINTABLE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * The config files themselves. Linting `eslint.config.js` with the type-aware
 * config is a chicken-and-egg crash — the file is not in any tsconfig.
 */
const NOT_LINTABLE = /(^|\/)eslint(\.typed)?\.config\.(js|mjs)$/;

/* ─────────────────────────────── git plumbing ──────────────────────────── */

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return result.status === 0 ? String(result.stdout).trim() : null;
}

/**
 * `merge-base` rather than `origin/main` directly: once main moves ahead, a
 * plain diff against it reports every file someone else changed as yours.
 */
function resolveBase(explicit) {
  if (explicit) return explicit;
  for (const ref of ["origin/main", "main"]) {
    const base = git(["merge-base", ref, "HEAD"]);
    if (base) return base;
  }
  return git(["rev-parse", "HEAD~1"]) ?? "HEAD";
}

function changedFiles(base) {
  // Committed changes in the range, plus staged and dirty ones, so the same
  // script is useful from a hook AND from a half-finished edit.
  const ranges = [
    ["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`],
    ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"],
    ["diff", "--name-only", "--diff-filter=ACMR", "--cached"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  const seen = new Set();
  for (const range of ranges) {
    const out = git(range);
    if (!out) continue;
    for (const line of out.split("\n")) if (line) seen.add(line);
  }
  return [...seen];
}

/** Every lintable file in the repo — used only by `--update-baseline`. */
function allTrackedFiles() {
  const tracked = git(["ls-files"]) ?? "";
  const untracked = git(["ls-files", "--others", "--exclude-standard"]) ?? "";
  return [...tracked.split("\n"), ...untracked.split("\n")].filter(Boolean);
}

/* ──────────────────────────────── grouping ─────────────────────────────── */

function groupByWorkspace(files) {
  const groups = new Map();
  for (const file of files) {
    if (!LINTABLE_EXTENSIONS.test(file)) continue;
    if (NOT_LINTABLE.test(file)) continue;
    // A file deleted in the range still appears in some diff filters on a dirty
    // tree; linting a path that is gone is a crash, not a finding.
    if (!existsSync(resolve(ROOT, file))) continue;

    const workspace = LINTABLE_WORKSPACES.find(
      (ws) => file === ws || file.startsWith(`${ws}/`),
    );
    if (!workspace) continue;
    if (!existsSync(resolve(ROOT, workspace, RATCHET_CONFIG))) continue;

    if (!groups.has(workspace)) groups.set(workspace, []);
    groups.get(workspace).push(relative(workspace, file));
  }
  return groups;
}

/* ──────────────────────────────── linting ──────────────────────────────── */

/**
 * Returns `{ "<repo-relative file>": { "<ruleId>": count } }` for ERRORS only.
 * Warnings are reported but never gate.
 */
function lintWorkspace(
  workspace,
  files,
  { syntactic = false, fix = false } = {},
) {
  const result = spawnSync(
    "npx",
    [
      "eslint",
      "--config",
      syntactic ? "eslint.config.js" : RATCHET_CONFIG,
      ...(fix ? ["--fix"] : []),
      "--no-error-on-unmatched-pattern",
      "--format",
      "json",
      ...files,
    ],
    {
      cwd: resolve(ROOT, workspace),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  const stdout = String(result.stdout ?? "").trim();
  if (!stdout) {
    // No JSON at all means eslint itself failed (bad config, missing plugin) —
    // that is a broken gate, not a clean run, and must not silently pass.
    const stderr = String(result.stderr ?? "").trim();
    throw new Error(`eslint produced no output in ${workspace}:\n${stderr}`);
  }

  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    throw new Error(
      `eslint output in ${workspace} was not JSON:\n${stdout.slice(0, 800)}`,
    );
  }

  const counts = {};
  const details = [];
  for (const entry of report) {
    const repoRelative = relative(ROOT, entry.filePath);
    for (const message of entry.messages) {
      if (message.severity !== 2) continue;
      const rule = message.ruleId ?? "(fatal)";
      counts[repoRelative] ??= {};
      counts[repoRelative][rule] = (counts[repoRelative][rule] ?? 0) + 1;
      details.push({
        file: repoRelative,
        rule,
        line: message.line,
        text: message.message,
      });
    }
  }
  return { counts, details };
}

function lintFileGroups(groups, options) {
  const counts = {};
  const details = [];
  for (const [workspace, files] of groups) {
    const result = lintWorkspace(workspace, files, options);
    Object.assign(counts, result.counts);
    details.push(...result.details);
  }
  return { counts, details };
}

/* ─────────────────────────────── the ratchet ───────────────────────────── */

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")).findings ?? {};
  } catch {
    return {};
  }
}

function writeBaseline(counts) {
  const total = Object.values(counts).reduce(
    (sum, rules) => sum + Object.values(rules).reduce((a, b) => a + b, 0),
    0,
  );
  const sortedFiles = Object.keys(counts).sort();
  const findings = {};
  for (const file of sortedFiles) {
    findings[file] = Object.fromEntries(
      Object.entries(counts[file]).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify(
      {
        _comment:
          "Recorded eslint debt, keyed by file and rule. This may only ever go DOWN. " +
          "Regenerate with `node scripts/guardrails/lint-changed.mjs --update-baseline` " +
          "AFTER fixing findings, never to silence one you just introduced. " +
          "Counts, not line numbers, so ordinary edits do not produce phantom findings.",
        _generated: new Date().toISOString().slice(0, 10),
        _totalErrors: total,
        findings,
      },
      null,
      2,
    )}\n`,
  );
  return total;
}

/** Findings in excess of what the baseline records for that file+rule. */
function newFindings(counts, baseline, details) {
  const budget = new Map();
  for (const [file, rules] of Object.entries(counts)) {
    for (const [rule, count] of Object.entries(rules)) {
      const allowed = baseline[file]?.[rule] ?? 0;
      if (count > allowed) budget.set(`${file} ${rule}`, count - allowed);
    }
  }
  if (budget.size === 0) return [];

  // Report the LAST occurrences in each over-budget file+rule pair. Which
  // specific instance is "new" is unknowable from counts alone; saying so
  // honestly beats pointing confidently at the wrong line.
  const surplus = [];
  for (const [key, over] of budget) {
    const [file, rule] = key.split(" ");
    const matching = details.filter((d) => d.file === file && d.rule === rule);
    surplus.push(...matching.slice(-over));
  }
  return surplus;
}

/* ──────────────────────────────── the run ──────────────────────────────── */

function parseArgs(argv) {
  const base = argv.includes("--base")
    ? argv[argv.indexOf("--base") + 1]
    : null;
  const filesIndex = argv.indexOf("--files");
  const files =
    filesIndex === -1
      ? null
      : argv.slice(filesIndex + 1).filter((arg) => !arg.startsWith("--"));
  return {
    base,
    files,
    updateBaseline: argv.includes("--update-baseline"),
    /**
     * `--syntactic` lints with `eslint.config.js` instead of the type-aware
     * config. The pre-commit hook uses it: type-aware linting costs about five
     * times the runtime, which is fine at push time and not fine between typing
     * `git commit` and getting your editor back.
     */
    syntactic: argv.includes("--syntactic"),
    /** `--fix` writes autofixes back before reporting what is left. */
    fix: argv.includes("--fix"),
  };
}

function main() {
  const {
    base: explicitBase,
    files: explicitFiles,
    updateBaseline,
    syntactic,
    fix,
  } = parseArgs(process.argv.slice(2));

  if (updateBaseline) {
    // The baseline must cover the WHOLE repo, not just what changed — a partial
    // baseline would mark every untouched file's debt as "new" the first time
    // somebody edits it.
    const groups = groupByWorkspace(allTrackedFiles());
    console.log(
      `lint-changed: re-recording the baseline over ${[...groups.values()].flat().length} file(s)…`,
    );
    const { counts } = lintFileGroups(groups);
    const total = writeBaseline(counts);
    console.log(`lint-changed: baseline written — ${total} recorded error(s).`);
    console.log(`  ${relative(ROOT, BASELINE_PATH)}`);
    return 0;
  }

  const base = explicitFiles ? null : resolveBase(explicitBase);
  const files = explicitFiles ?? changedFiles(base);
  const groups = groupByWorkspace(files);

  if (groups.size === 0) {
    console.log("lint-changed: no lintable changed files.");
    return 0;
  }

  const fileCount = [...groups.values()].flat().length;
  const { counts, details } = lintFileGroups(groups, { syntactic, fix });
  const baseline = readBaseline();
  const surplus = newFindings(counts, baseline, details);

  const knownCount = details.length - surplus.length;

  if (surplus.length === 0) {
    console.log(
      `lint-changed: ${fileCount} file(s)${syntactic ? " (syntactic)" : ""} — clean` +
        (knownCount > 0
          ? `, ${knownCount} known recorded finding(s) ignored.`
          : "."),
    );
    return 0;
  }

  console.log(
    `\nlint-changed: ${surplus.length} NEW eslint error(s) in files this change touched.\n`,
  );
  for (const finding of surplus.slice(0, 30)) {
    console.log(`  ${finding.file}:${finding.line}`);
    console.log(`    ${finding.rule} — ${finding.text}`);
  }
  if (surplus.length > 30) console.log(`  … +${surplus.length - 30} more`);

  console.log(
    `\n${knownCount} pre-existing finding(s) were ignored — those are recorded debt\n` +
      `in scripts/guardrails/lint-baseline.json. The ${surplus.length} above are not.\n\n` +
      "Fix them. Do not add an inline eslint-disable, and do not run\n" +
      "--update-baseline to record a finding you just introduced.",
  );
  return 1;
}

try {
  process.exit(main());
} catch (error) {
  console.error(`lint-changed: ${error.message}`);
  process.exit(1);
}
