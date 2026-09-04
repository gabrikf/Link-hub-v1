#!/usr/bin/env node
/**
 * The palette check.
 *
 * `DESIGN.md` says: `violet` accent, `zinc` neutrals, seven semantic colours,
 * and **no `slate`, `gray`, `blue` or `indigo`**. That last rule is the one
 * that gets broken, because the difference is invisible in isolation — a
 * `text-gray-500` looks completely fine on its own and obviously wrong the
 * moment it sits next to a `text-zinc-500`. Nobody catches it in review for the
 * same reason nobody catches it while writing it.
 *
 * A rule that only a careful reader can enforce is a rule that erodes. This is
 * the same rule as a check, so it cannot erode.
 *
 * TWO CHECKS, and the line between them:
 *
 * 1. THE BANNED SCALES, anywhere a Tailwind colour utility appears in
 *    `apps/web/src`.
 *
 * 2. AN ARBITRARY HEX INSIDE A TAILWIND CLASS — `text-[#0A66C2]`. That is the
 *    part of "no hardcoded hex in a component" with teeth: it bypasses the
 *    token system at the exact place the token system is supposed to apply.
 *
 * What is NOT checked, deliberately: hex in a data structure. The third-party
 * brand colours for link icons and the profile accent presets are real hex and
 * always will be — `#E4405F` is Instagram's, not a design choice. `DESIGN.md`
 * says those live in `index.css`; they now live in `lib/link-icons.tsx` and
 * `features/profile/components/profile-theme.ts`, and firing on them would
 * make this a check people switch off rather than a rule people follow.
 *
 * Usage:
 *   node scripts/guardrails/design-tokens.mjs
 *   node scripts/guardrails/design-tokens.mjs --self-test
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const WEB_SRC = join(ROOT, "apps/web/src");

/** `zinc` is the neutral. These four are the ones that get typed by accident. */
const BANNED_SCALES = ["slate", "gray", "blue", "indigo"];

/**
 * Only utility prefixes that actually take a colour. Matching a bare
 * `slate-500` anywhere would fire on a comment, a locale string, or a variable
 * named `blue-500`, and each of those is a false failure that costs more trust
 * than the rule is worth.
 */
const COLOR_PREFIXES = [
  "text", "bg", "border", "ring", "outline", "divide", "from", "to", "via",
  "fill", "stroke", "shadow", "decoration", "accent", "caret", "placeholder",
];

const UTILITY_RE = new RegExp(
  `(?<![\\w-])(?:dark:|hover:|focus:|active:|group-hover:|peer-focus:|disabled:|sm:|md:|lg:|xl:|2xl:)*` +
    `(?:${COLOR_PREFIXES.join("|")})-(?:${BANNED_SCALES.join("|")})-\\d{2,3}(?![\\w-])`,
  "g",
);

/**
 * An arbitrary colour in a Tailwind class: `text-[#0A66C2]`, `bg-[#fff]`.
 * `[#...]` only — `w-[42px]` and the like are arbitrary VALUES, not colours,
 * and are perfectly normal.
 */
const ARBITRARY_HEX_RE = /(?<![\w-])[a-z-]+-\[#[0-9a-fA-F]{3,8}\](?![\w-])/g;

/**
 * Files that render a third-party brand mark in its own brand colour. Same
 * exception the icon-family rule carves out in `apps/web/eslint.config.js`, for
 * the same reason: nobody gets to redesign LinkedIn's blue. Keep it short — a
 * long list means the rule stopped meaning anything.
 */
const BRAND_MARK_FILES = new Set([
  "apps/web/src/features/auth/pages/auth-page.tsx",
  "apps/web/src/lib/link-icons.tsx",
]);

const EXTENSIONS = [".ts", ".tsx", ".css"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage"]);

function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...sourceFiles(full));
    } else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

function findings() {
  const problems = [];
  for (const file of sourceFiles(WEB_SRC)) {
    const lines = readFileSync(file, "utf8").split("\n");
    const rel = relative(ROOT, file);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(UTILITY_RE)) {
        problems.push({ file: rel, line: index + 1, utility: match[0], kind: "scale" });
      }
      if (BRAND_MARK_FILES.has(rel)) return;
      for (const match of line.matchAll(ARBITRARY_HEX_RE)) {
        problems.push({ file: rel, line: index + 1, utility: match[0], kind: "hex" });
      }
    });
  }
  return problems;
}

function selfTest() {
  const cases = [
    { name: "banned scale in a className", text: 'className="text-gray-500"', expect: true },
    { name: "banned scale behind a variant", text: 'className="dark:bg-slate-900"', expect: true },
    { name: "allowed neutral", text: 'className="text-zinc-500"', expect: false },
    { name: "allowed accent", text: 'className="bg-violet-600"', expect: false },
    { name: "a word that merely contains a scale name", text: "const blueprint = 1;", expect: false },
    { name: "arbitrary hex in a class", text: 'className="text-[#0A66C2]"', expect: true, re: ARBITRARY_HEX_RE },
    { name: "arbitrary size is not a colour", text: 'className="w-[42px]"', expect: false, re: ARBITRARY_HEX_RE },
    { name: "hex in a data structure is not a class", text: 'const brand = "#E4405F";', expect: false, re: ARBITRARY_HEX_RE },
  ];
  let failures = 0;
  for (const testCase of cases) {
    const pattern = testCase.re ?? UTILITY_RE;
    pattern.lastIndex = 0;
    const hit = [...testCase.text.matchAll(pattern)].length > 0;
    if (hit === testCase.expect) {
      console.log(`  ✓ ${testCase.name}`);
    } else {
      failures += 1;
      console.log(`  ✗ ${testCase.name} — expected ${testCase.expect}, got ${hit}`);
    }
  }
  console.log(
    failures === 0
      ? "design-tokens --self-test: the check still bites."
      : `design-tokens --self-test: ${failures} case(s) FAILED.`,
  );
  return failures === 0 ? 0 : 1;
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  try {
    statSync(WEB_SRC);
  } catch {
    console.log("design-tokens: skipped — apps/web/src does not exist.");
    return 0;
  }

  const problems = findings();
  if (problems.length === 0) {
    console.log("design-tokens: no banned colour scales in apps/web/src.");
    return 0;
  }

  console.log(`design-tokens: ${problems.length} problem(s)\n`);
  for (const problem of problems.slice(0, 40)) {
    console.log(`  ${problem.file}:${problem.line}  ${problem.utility}`);
  }
  if (problems.length > 40) console.log(`  … +${problems.length - 40} more`);
  console.log("");
  console.log("  DESIGN.md: violet accent, zinc neutrals, seven semantic colours.");
  console.log("  No slate, gray, blue or indigo — zinc is the neutral scale, and a");
  console.log("  colour in a class is a token or a --profile-accent-* variable, not a hex.");
  return 1;
}

process.exit(main());
