#!/usr/bin/env node
/**
 * THE HARNESS SENSOR.
 *
 * The agent harness — `AGENTS.md`, the nested workspace files, the skills,
 * `DESIGN.md`, `docs/mcp-servers.md` — is prose that four different coding
 * tools load as instructions. Prose rots silently: a file gets renamed and the
 * rule that cites it keeps being read as true, an npm script is dropped and the
 * command an agent is told to run stops existing, a file grows past the size
 * its reader will actually load.
 *
 * None of that shows up in a type-check or a test. This script is the check.
 * It is Track A of `harness-eval` made permanent and cheap enough to run on
 * every push (budget: well under a second, no network, no model).
 *
 * WHAT IT ENFORCES, and why each line is here:
 *
 * 1. EVERY PATH CITE RESOLVES. A rule that points at a file that is gone is
 *    worse than no rule — the agent goes looking, finds nothing, and improvises.
 *
 * 2. EVERY `npm run x` CITE EXISTS. Same failure, louder: the agent runs it and
 *    gets "Missing script".
 *
 * 3. SIZE BUDGETS. Claude Code recommends under 200 lines per memory file;
 *    Codex caps the whole root-to-cwd AGENTS.md chain at 32 KiB
 *    (`project_doc_max_bytes`) and silently truncates past it; a SKILL.md over
 *    500 lines is reference material pretending to be a procedure. A budget
 *    that is only written down in a plan is not a budget.
 *
 * 4. SKILL FRONTMATTER. `name` must match the folder — the folder name is how
 *    every tool addresses the skill — and `description` must exist, because it
 *    is the only text a model sees when deciding whether to load the skill.
 *
 * PRECISION OVER RECALL, deliberately. This blocks a push, so a false failure
 * is expensive and teaches people to bypass the gate. Placeholders, elisions
 * (`lib/...`), globs, URLs and anything inside a fenced code block are not
 * cites. Workspace-relative cites (`src/router.tsx` written in a file about
 * `apps/web`) resolve against the workspaces that file names. When in doubt,
 * this script says nothing.
 *
 * Usage:
 *   node scripts/guardrails/harness-check.mjs
 *   node scripts/guardrails/harness-check.mjs --self-test   # prove it still bites
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

/* ──────────────────────────────── budgets ──────────────────────────────── */

/**
 * The root file is read by every tool on every task, so it is the one that has
 * to stay an index. 120 lines is the target the split was designed around;
 * 200 is Claude Code's published ceiling.
 */
const ROOT_MAX_LINES = 120;
const ROOT_MAX_BYTES = 6 * 1024;
/**
 * 200 is Claude Code's published per-file ceiling, and it is the number with an
 * external basis. The split targeted 150, and `apps/api/AGENTS.md` could only
 * reach it by dropping the list of tests that hang without docker — content
 * both usefulness judges scored Keep-core, which the claim ledger then flagged
 * as a regression. Given the choice between an internal target and content two
 * independent judges said to keep, the target moves. The byte budget below is
 * what actually protects the Codex chain, and it does not move.
 */
const NESTED_MAX_LINES = 200;
const NESTED_MAX_BYTES = 8 * 1024;
const SKILL_MAX_LINES = 500;
/** Codex `project_doc_max_bytes`. Past this the chain is truncated, not warned. */
const CHAIN_MAX_BYTES = 32 * 1024;

/* ─────────────────────────────── discovery ─────────────────────────────── */

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".harness-eval",
  ".nightly",
  ".deep-review",
  ".visual",
  ".playwright",
]);

/**
 * Paths pruned wholesale. `.claude/worktrees/` holds complete checkouts of this
 * same repo — every AGENTS.md in there is a copy on another branch, and judging
 * it here reports one real problem four times.
 */
const SKIP_PATHS = [join(ROOT, ".claude/worktrees")];

/** Manifest names that make a directory a workspace a cite can be relative to. */
const MANIFESTS = ["package.json", "pyproject.toml", "go.mod", "Cargo.toml"];

function walk(dir, depth, onFile) {
  if (depth > 6) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (SKIP_PATHS.includes(full)) continue;
      walk(full, depth + 1, onFile);
    } else if (entry.isFile()) {
      onFile(full);
    }
  }
}

function nestedAgentsFiles() {
  const found = [];
  walk(ROOT, 0, (file) => {
    if (file.endsWith("/AGENTS.md") && file !== join(ROOT, "AGENTS.md")) found.push(file);
  });
  return found.sort();
}

function skillMarkdownFiles() {
  const found = [];
  const skillsDir = join(ROOT, ".agents/skills");
  if (existsSync(skillsDir)) {
    walk(skillsDir, 0, (file) => {
      if (file.endsWith(".md")) found.push(file);
    });
  }
  return found.sort();
}

function workspaceDirs() {
  const found = [];
  walk(ROOT, 0, (file) => {
    const name = file.slice(file.lastIndexOf("/") + 1);
    if (!MANIFESTS.includes(name)) return;
    const dir = dirname(file);
    if (dir !== ROOT) found.push(relative(ROOT, dir));
  });
  return [...new Set(found)].sort();
}

/* ───────────────────────────── cite extraction ─────────────────────────── */

const FENCE_RE = /```[\s\S]*?```/g;
const CITE_RE = /`([^`\n]+)`|(?<!!)\[[^\]]*\]\(([^)\s]+)\)/g;
const NPM_RUN_RE = /`npm run ([A-Za-z0-9:_-]+)[^`]*`/g;

/**
 * Not a cite: a URL, an anchor, a glob, an elision, a placeholder, a bare word.
 * Every one of these appeared in the harness as teaching text, and treating any
 * of them as a cite is how a sensor earns a reputation for crying wolf.
 */
function isCheckablePath(raw) {
  if (!raw || raw.includes(" ")) return false;
  if (/^(https?:|#|mailto:)/.test(raw)) return false;
  if (raw.includes("*") || raw.includes("<") || raw.includes("{") || raw.includes("[")) return false;
  if (raw.includes("$")) return false;
  if (raw.includes("...") || raw.includes("…")) return false;
  if (raw.endsWith("/")) return false;
  if (/README/i.test(raw)) return false;
  // A bare filename is not checked, and that is a deliberate gap. The harness
  // cites `router.tsx`, `surface.ts`, `tasks.md` and `en-US.json` as shorthand
  // for files that live elsewhere; it cites `tasks.md` and `definitions.md` for
  // artifacts a skill is about to generate; and `context7-usage` cites
  // `tailwind.config.js` precisely because this repo does NOT have one. Every
  // one of those would fail. A dead `foo.json` at the root slips through — that
  // is the price, and it is much cheaper than a check people learn to bypass.
  if (!raw.includes("/")) return false;
  // `and/or` is not a path. Require a prefix that names a tree this repo commits.
  // Generated trees (`.harness-eval/`, `.deep-review/`, `.visual/`) are excluded
  // on purpose: a skill that cites the output it is about to write is correct,
  // and the file is legitimately absent until it runs.
  return /^(\.agents\/|\.claude\/|\.kiro\/|\.github\/|\.husky\/|docs\/|apps\/|packages\/|scripts\/|src\/|lib\/|infra\/|e2e\/|references\/|assets\/)/.test(
    raw,
  );
}

/**
 * `(e.g. read \`references/view.md\`)` is an illustration of a shape, not a claim
 * that the file is there. Track A applies the identical rule; if the two ever
 * disagree, one of them is producing noise.
 */
const EXAMPLE_MARKER_RE = /\b(e\.g\.|for example|such as|for instance)/i;

function onlyIllustrative(text, cite) {
  let seen = false;
  let index = text.indexOf(cite);
  while (index !== -1) {
    seen = true;
    const lineStart = text.lastIndexOf("\n", index) + 1;
    if (!EXAMPLE_MARKER_RE.test(text.slice(lineStart, index))) return false;
    index = text.indexOf(cite, index + cite.length);
  }
  return seen;
}

function citesIn(text) {
  const prose = text.replace(FENCE_RE, "\n");
  const out = new Set();
  for (const match of prose.matchAll(CITE_RE)) {
    let raw = (match[1] ?? match[2] ?? "").trim();
    raw = raw.split("#")[0].replace(/^\.\//, "").replace(/[.,;:)]+$/, "");
    if (isCheckablePath(raw)) out.add(raw);
  }
  return [...out];
}

function npmScriptCitesIn(text) {
  const out = new Set();
  for (const match of text.matchAll(NPM_RUN_RE)) out.add(match[1]);
  return [...out];
}

/* ─────────────────────────────── resolution ────────────────────────────── */

function pathExists(candidate) {
  try {
    statSync(candidate);
    return true;
  } catch {
    return false;
  }
}

function resolvesFrom(file, cite, workspaces, text) {
  const candidates = [join(ROOT, cite), join(dirname(file), cite)];
  // A cite inside a skill is often relative to the skill root, not the file.
  const skillMatch = file.match(/^(.*\/\.agents\/skills\/[^/]+)\//);
  if (skillMatch) candidates.push(join(skillMatch[1], cite));
  // A monorepo surface writes `src/router.tsx` and means `apps/web/src/...`.
  for (const workspace of workspaces) {
    if (!text.includes(workspace)) continue;
    candidates.push(join(ROOT, workspace, cite));
    candidates.push(join(ROOT, workspace, "src", cite));
  }
  return candidates.some(pathExists);
}

/* ──────────────────────────── the checks ───────────────────────────────── */

function readScriptNames() {
  const names = new Set();
  const addFrom = (manifest) => {
    if (!existsSync(manifest)) return;
    try {
      const scripts = JSON.parse(readFileSync(manifest, "utf8")).scripts ?? {};
      for (const name of Object.keys(scripts)) names.add(name);
    } catch {
      /* a malformed manifest is the type-check's problem, not this script's */
    }
  };
  addFrom(join(ROOT, "package.json"));
  for (const workspace of workspaceDirs()) addFrom(join(ROOT, workspace, "package.json"));
  return names;
}

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (!kv) continue;
    const raw = kv[2].trim();
    fields[kv[1]] = raw.replace(/^["']|["']$/g, "");
    if (kv[1] === "description" && !/^["']/.test(raw) && / #/.test(raw)) {
      fields.description_comment_trap = true;
    }
  }
  return fields;
}

function lineCount(text) {
  return text.split("\n").length;
}

/** Every AGENTS.md a tool loads on the way down to this file, plus this file. */
function chainFor(nestedFile) {
  const chain = [join(ROOT, "AGENTS.md")];
  const parts = relative(ROOT, dirname(nestedFile)).split("/");
  for (let i = 1; i <= parts.length; i += 1) {
    const candidate = join(ROOT, ...parts.slice(0, i), "AGENTS.md");
    if (candidate !== nestedFile && existsSync(candidate)) chain.push(candidate);
  }
  chain.push(nestedFile);
  return [...new Set(chain)];
}

function check(root) {
  const problems = [];
  const say = (file, what, fix) =>
    problems.push({ file: relative(root, file) || relative(ROOT, file), what, fix });

  const rootAgents = join(root, "AGENTS.md");
  const nested = nestedAgentsFiles();
  const skillFiles = skillMarkdownFiles();
  const extras = ["DESIGN.md", "docs/mcp-servers.md"]
    .map((rel) => join(root, rel))
    .filter(existsSync);
  const surfaces = [rootAgents, ...nested, ...skillFiles, ...extras].filter(existsSync);
  const workspaces = workspaceDirs();
  const scriptNames = readScriptNames();

  /* 1 + 2 — cites resolve */
  for (const file of surfaces) {
    const text = readFileSync(file, "utf8");
    for (const cite of citesIn(text)) {
      if (onlyIllustrative(text, cite)) continue;
      if (!resolvesFrom(file, cite, workspaces, text)) {
        say(
          file,
          `cites \`${cite}\`, which does not exist`,
          "fix the path, restore the file, or drop the cite",
        );
      }
    }
    for (const script of npmScriptCitesIn(text)) {
      if (!scriptNames.has(script)) {
        say(
          file,
          `cites \`npm run ${script}\`, which is in no package.json`,
          "add the script or cite the one that exists",
        );
      }
    }
  }

  /* 3 — size budgets */
  if (existsSync(rootAgents)) {
    const text = readFileSync(rootAgents, "utf8");
    const lines = lineCount(text);
    const bytes = Buffer.byteLength(text);
    if (lines > ROOT_MAX_LINES) {
      say(
        rootAgents,
        `${lines} lines, over the ${ROOT_MAX_LINES}-line budget`,
        "move workspace-specific rules to apps/<x>/AGENTS.md or a skill",
      );
    }
    if (bytes > ROOT_MAX_BYTES) {
      say(
        rootAgents,
        `${bytes} bytes, over the ${ROOT_MAX_BYTES}-byte budget`,
        "the root file is an index; the depth belongs in the file it indexes",
      );
    }
  }

  for (const file of nested) {
    const text = readFileSync(file, "utf8");
    const lines = lineCount(text);
    const bytes = Buffer.byteLength(text);
    if (lines > NESTED_MAX_LINES) {
      say(file, `${lines} lines, over the ${NESTED_MAX_LINES}-line budget`, "move depth to a skill");
    }
    if (bytes > NESTED_MAX_BYTES) {
      say(file, `${bytes} bytes, over the ${NESTED_MAX_BYTES}-byte budget`, "move depth to a skill");
    }
    const chain = chainFor(file);
    const chainBytes = chain.reduce((sum, p) => sum + statSync(p).size, 0);
    if (chainBytes > CHAIN_MAX_BYTES) {
      say(
        file,
        `its AGENTS.md chain is ${chainBytes} bytes, over Codex's ${CHAIN_MAX_BYTES}-byte cap`,
        "Codex truncates past this silently — shrink the root or this file",
      );
    }
  }

  /* 3 + 4 — skills */
  for (const file of skillFiles) {
    if (!file.endsWith("/SKILL.md")) continue;
    const text = readFileSync(file, "utf8");
    const lines = lineCount(text);
    if (lines > SKILL_MAX_LINES) {
      say(
        file,
        `${lines} lines, over the ${SKILL_MAX_LINES}-line budget`,
        "move reference material to references/ and keep the contract in SKILL.md",
      );
    }
    const folder = dirname(file).slice(dirname(file).lastIndexOf("/") + 1);
    const fields = frontmatter(text);
    if (!fields) {
      say(file, "has no YAML frontmatter", "add `name:` and `description:` at the top");
      continue;
    }
    if (fields.name !== folder) {
      say(
        file,
        `frontmatter name \`${fields.name ?? "(missing)"}\` does not match its folder \`${folder}\``,
        "the folder name is how every tool addresses the skill; make them equal",
      );
    }
    if (!fields.description) {
      say(
        file,
        "has no `description:`",
        "it is the only text a model reads when deciding to load the skill",
      );
    } else if (fields.description_comment_trap) {
      // Found the hard way: `description: … produced by #spec-writer. Reads …`
      // is valid YAML whose value ends at the `#`. The file looked complete and
      // the model saw eleven words, which is not enough to trigger a skill on.
      say(
        file,
        "`description:` is unquoted and contains ` #`, so YAML truncates it there",
        "wrap the whole description in double quotes, or drop the `#`",
      );
    }
  }

  return { problems, counts: { surfaces: surfaces.length, nested: nested.length } };
}

/* ─────────────────────────────── self-test ─────────────────────────────── */

/**
 * A sensor nobody has seen fire is indistinguishable from a sensor that cannot.
 * Each case below is a violation this script must report; if any stops being
 * reported, the check has gone blind and this exits non-zero.
 */
function selfTest() {
  const cases = [
    {
      name: "dead path cite",
      text: "Read `apps/web/src/does-not-exist.ts` before touching routing.",
      expect: /does not exist/,
    },
    {
      name: "dead npm script cite",
      text: "Run `npm run definitely-not-a-script` to verify.",
      expect: /in no package\.json/,
    },
    {
      name: "elision is not a cite",
      text: "Helpers live in `lib/...` and `.agents/…`.",
      expect: null,
    },
    {
      name: "fenced example is not a cite",
      text: "```bash\ncat apps/web/src/nope.ts\n```",
      expect: null,
    },
    {
      name: "workspace-relative cite resolves",
      text: "In `apps/web`, every route lives in `src/router.tsx`.",
      expect: null,
    },
  ];

  const workspaces = workspaceDirs();
  const scriptNames = readScriptNames();
  const probe = join(ROOT, "AGENTS.md");
  let failures = 0;

  for (const testCase of cases) {
    const found = [];
    for (const cite of citesIn(testCase.text)) {
      if (!resolvesFrom(probe, cite, workspaces, testCase.text)) {
        found.push(`cites \`${cite}\`, which does not exist`);
      }
    }
    for (const script of npmScriptCitesIn(testCase.text)) {
      if (!scriptNames.has(script)) found.push(`cites \`npm run ${script}\`, which is in no package.json`);
    }
    const matched = testCase.expect
      ? found.some((f) => testCase.expect.test(f))
      : found.length === 0;
    if (!matched) {
      failures += 1;
      console.log(`  ✗ ${testCase.name} — got ${JSON.stringify(found)}`);
    } else {
      console.log(`  ✓ ${testCase.name}`);
    }
  }

  console.log(
    failures === 0
      ? "harness-check --self-test: the sensor still bites."
      : `harness-check --self-test: ${failures} case(s) FAILED — the sensor has gone blind.`,
  );
  return failures === 0 ? 0 : 1;
}

/* ───────────────────────────────── the run ─────────────────────────────── */

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  const { problems, counts } = check(ROOT);

  if (problems.length === 0) {
    console.log(
      `harness-check: ${counts.surfaces} surface(s), ${counts.nested} nested AGENTS.md, ` +
        "every cite resolves, every budget met.",
    );
    return 0;
  }

  console.log(`harness-check: ${problems.length} problem(s)\n`);
  for (const problem of problems) {
    console.log(`  ${problem.file}`);
    console.log(`    ${problem.what}`);
    console.log(`    → ${problem.fix}`);
  }
  console.log("");
  console.log("  The harness is instructions four different tools read as true.");
  console.log("  Fix the file, do not delete the check.");
  return 1;
}

process.exit(main());
