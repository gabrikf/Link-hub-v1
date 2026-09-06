#!/usr/bin/env node
/**
 * CLAUDE CODE PostToolUse HOOK — lint the one file the agent just wrote.
 *
 * WHY THIS EXISTS. The Stop hook already runs the whole gate, so an agent
 * cannot finish on a red tree. But Stop fires at the END: the model writes a
 * file, writes nine more, runs the tests, and only then learns that the first
 * one had an unused import. By that point the fix is an archaeology exercise
 * and the context that would have made it obvious is gone.
 *
 * This fires immediately after the Edit or Write, on that file alone, and feeds
 * the findings straight back. The model fixes it while it still remembers why
 * it wrote the line. Cost is one eslint run over one file — under a second.
 *
 * IT IS DELIBERATELY NOT AUTOFIXING. Rewriting the file the agent just wrote
 * desynchronises it from what the agent believes is on disk, and the next edit
 * lands on top of content it never saw. Reporting is both safer and better
 * teaching.
 *
 * IT FAILS OPEN, ALWAYS. Every unexpected condition — malformed hook payload,
 * a path outside a linted workspace, eslint itself erroring — exits 0. A hook
 * that blocks an agent because of its own bug is worse than no hook.
 *
 * Wire it in .agents/settings.json:
 *
 *   "PostToolUse": [{
 *     "matcher": "Edit|Write",
 *     "hooks": [{ "type": "command",
 *                 "command": "node \"$CLAUDE_PROJECT_DIR/scripts/guardrails/lint-file-hook.mjs\"",
 *                 "timeout": 30 }]
 *   }]
 *
 * Exit 2 is the code Claude Code treats as "blocked, here is why" and feeds
 * stderr back to the model. Every other code is silent.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

const LINTABLE_WORKSPACES = [
  "apps/web",
  "apps/api",
  "apps/mcp",
  "apps/extractor",
  "apps/training",
  "packages/schemas",
];
const LINTABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const NOT_LINTABLE = /(^|\/)eslint(\.typed)?\.config\.(js|mjs)$/;

function readHookPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  const payload = readHookPayload();
  const filePath = payload?.tool_input?.file_path;
  if (typeof filePath !== "string" || !filePath) return 0;

  const absolute = resolve(filePath);
  if (!absolute.startsWith(`${ROOT}/`)) return 0;

  const repoRelative = relative(ROOT, absolute);
  if (!LINTABLE.test(repoRelative) || NOT_LINTABLE.test(repoRelative)) return 0;
  if (!existsSync(absolute)) return 0;

  const workspace = LINTABLE_WORKSPACES.find((ws) =>
    repoRelative.startsWith(`${ws}/`),
  );
  if (!workspace) return 0;

  // Syntactic config only: the type-aware one builds a TypeScript program and
  // would put 40 seconds between the agent's edit and its next thought.
  const result = spawnSync(
    "npx",
    [
      "eslint",
      "--config",
      "eslint.config.js",
      "--no-error-on-unmatched-pattern",
      "--format",
      "json",
      relative(resolve(ROOT, workspace), absolute),
    ],
    {
      cwd: resolve(ROOT, workspace),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  let report;
  try {
    report = JSON.parse(String(result.stdout ?? ""));
  } catch {
    return 0; // eslint could not run — that is the gate's problem, not the agent's
  }

  const errors = report.flatMap((entry) =>
    entry.messages
      .filter((message) => message.severity === 2)
      .map((message) => ({
        line: message.line,
        rule: message.ruleId ?? "(fatal)",
        text: message.message,
      })),
  );
  if (errors.length === 0) return 0;

  const lines = [
    `eslint: ${errors.length} error(s) in ${repoRelative}, from the edit you just made.`,
    "",
    ...errors
      .slice(0, 12)
      .map((e) => `  ${repoRelative}:${e.line}  ${e.rule}\n    ${e.text}`),
  ];
  if (errors.length > 12) lines.push(`  … +${errors.length - 12} more`);
  lines.push(
    "",
    "Fix the cause. Do not add an inline eslint-disable, a type assertion or an",
    "`as any` — the pre-push gate and the ratchet will both catch that, later and",
    "more expensively than fixing it now.",
  );

  process.stderr.write(`${lines.join("\n")}\n`);
  return 2;
}

process.exit(main());
