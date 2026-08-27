#!/usr/bin/env node
/**
 * Raw-string check — the other half of `i18n-parity.mjs`.
 *
 * Parity proves every key that exists is present in all three locales. It says
 * nothing about the string that never became a key: a hardcoded "Save changes"
 * in a `.tsx` file passes parity forever and renders English to a Brazilian
 * user. This script is that missing side — it scans `apps/web/src` for
 * user-visible text sitting outside `t()`.
 *
 * WHAT IT LOOKS AT
 *   - JSX text nodes (text between `>`/`}` and `<`/`{`)
 *   - the `placeholder`, `title`, `alt` and `aria-label` attributes, when their
 *     value is a plain string literal rather than an expression
 *
 * WHAT IT IGNORES, on purpose
 *   route paths, query keys, testids, CSS class names, import specifiers,
 *   comments, `console.*`, test files, and the locale files themselves. Those
 *   are the four categories that made every naive version of this check noise.
 *
 * THE HEURISTIC
 *   Only text with at least two letters AND a space, or text starting with a
 *   capital letter, is reported. A check that cries wolf gets switched off in a
 *   week, so precision beats recall here — parity plus code review covers the
 *   rest.
 *
 * IT ALSO CHECKS THE KEYS THEMSELVES
 *   Every `t("…")` and `i18nKey="…"` in apps/web/src must resolve in
 *   en-US.json, and every key in en-US.json must be reachable from the code.
 *   This replaces an i18next `CustomTypeOptions` declaration, which caught the
 *   same mistyped-key bug but added 14 seconds to a cold `tsc -b` at a quarter
 *   of the catalogue's size. A mistyped key renders as the raw key to a user,
 *   so it needs a fast check, not an expensive one.
 *
 * Every finding prints `file:line` and the text. A failure that does not say
 * where it is costs more than the bug.
 *
 * Usage: node scripts/guardrails/i18n-raw-strings.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const SRC_DIR = resolve(ROOT, "apps/web/src");

/**
 * Attributes and props whose literal value is read aloud or shown to a user.
 *
 * `label` and `helperText` are this repo's own conventions — `Input`,
 * `SelectField`, `FieldSelect` and `Segmented` all take visible text through
 * them. Leaving them out let a hardcoded `helperText="How often this source…"`
 * survive a whole migration pass unseen, which is exactly the kind of gap that
 * makes a green check misleading.
 */
const VISIBLE_ATTRIBUTES = [
  "placeholder",
  "title",
  "alt",
  "aria-label",
  "label",
  "helperText",
];

/** The source locale — the catalogue every `t()` call is checked against. */
const SOURCE_LOCALE = resolve(ROOT, "apps/web/src/i18n/locales/en-US.json");

/**
 * Runs between `}` and `{` in ordinary TypeScript look exactly like JSX text to
 * a scanner. `} else {`, `} catch {`, `} satisfies {` are code, not copy.
 */
const CODE_WORDS = new Set([
  "as", "async", "await", "case", "catch", "const", "default", "do", "else",
  "export", "extends", "finally", "for", "from", "function", "if", "implements",
  "import", "in", "instanceof", "keyof", "let", "new", "of", "return",
  "satisfies", "switch", "throw", "try", "typeof", "var", "void", "while",
  "yield",
]);

function isSkipped(path) {
  return (
    /\.test\.tsx?$/.test(path) ||
    /\.fixture\.ts$/.test(path) ||
    /[\\/]test-setup\.ts$/.test(path) ||
    /[\\/]i18n[\\/]/.test(path)
  );
}

function collectTsxFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry);
    if (statSync(path).isDirectory()) {
      collectTsxFiles(path, out);
    } else if (path.endsWith(".tsx") && !isSkipped(path)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Replaces every character of comments — and, when `blankStrings` is set, of
 * string and template literals — with a space, keeping newlines.
 *
 * Length is preserved so a byte offset still maps to the right line. Blanking
 * rather than deleting is the whole trick: it lets one cheap scanner answer
 * both "is this inside a comment" and "what line is this on".
 */
function blank(source, { blankStrings }) {
  const out = source.split("");
  let index = 0;

  const wipe = (from, to) => {
    for (let i = from; i < to; i += 1) {
      if (out[i] !== "\n") out[i] = " ";
    }
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    // `https://` inside JSX prose is not a line comment. Treating it as one
    // swallows the rest of the line and truncates the finding.
    const isUrlScheme = char === "/" && next === "/" && source[index - 1] === ":";

    if (char === "/" && next === "/" && !isUrlScheme) {
      const end = source.indexOf("\n", index);
      wipe(index, end === -1 ? source.length : end);
      index = end === -1 ? source.length : end;
      continue;
    }

    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      wipe(index, stop);
      index = stop;
      continue;
    }

    // An apostrophe in JSX prose ("you can't") is not a string delimiter. A
    // real quote never follows an identifier character; `can't` always does.
    // Getting this wrong blanks the rest of the file and desynchronises every
    // finding after it.
    const isApostrophe =
      char === "'" && /[A-Za-z0-9]/.test(source[index - 1] ?? "");

    if ((char === '"' || char === "'" || char === "`") && !isApostrophe) {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") {
          cursor += 2;
          continue;
        }
        if (source[cursor] === char) break;
        cursor += 1;
      }
      const stop = Math.min(cursor + 1, source.length);
      // The quotes stay: blanking them would merge the two sides of the
      // literal into one run and invent JSX text that is not there.
      if (blankStrings) wipe(index + 1, stop - 1);
      index = stop;
      continue;
    }

    index += 1;
  }

  return out.join("");
}

/** Byte offset → 1-indexed line, counted once per file rather than per finding. */
function makeLineLookup(source) {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "\n") lineStarts.push(i + 1);
  }
  return (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (lineStarts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}

/**
 * The reporting threshold: two letters and a space, or an initial capital.
 * `items`, `px`, `·` and `{{count}}` fall below it; "Save changes", "Cancel"
 * and "No posts yet" clear it.
 */
function isUserVisibleText(text) {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (CODE_WORDS.has(trimmed)) return false;
  // A run made only of JSX punctuation/operators, e.g. `} : {` or `&&`.
  if (!/[A-Za-z]{2}/.test(trimmed)) return false;
  // Interpolation-only runs like `{{count}}` never reach here (braces bound the
  // run), but a bare entity such as `&nbsp;` would.
  if (/^&[a-z]+;$/.test(trimmed)) return false;

  const hasTwoLettersAndSpace = /[A-Za-z]{2}/.test(trimmed) && /\s/.test(trimmed);
  const startsCapitalised = /^[A-Z]/.test(trimmed);
  return hasTwoLettersAndSpace || startsCapitalised;
}

/**
 * Collects JSX text nodes.
 *
 * A regex cannot do this on its own: `>` and `}` are everywhere in TypeScript,
 * and an earlier version of this file reported 2113 findings, nearly all of
 * them import statements. So this walks the file with a two-entry stack —
 * `jsx` for element children, `expr` for a `{...}` inside them — and collects
 * text only while the top of that stack is `jsx`.
 *
 * The one genuinely hard call is telling `<div>` from `useState<Theme>`. The
 * discriminator is the character immediately before the `<`: a generic is
 * always glued to the identifier that owns it (`Array<string>`), a JSX tag
 * never is.
 */
function collectJsxText(source) {
  const runs = [];
  const stack = [];
  let index = 0;
  let textStart = -1;

  const inChildren = () => stack[stack.length - 1] === "jsx";

  const flush = (end) => {
    if (textStart !== -1 && end > textStart) {
      runs.push({ start: textStart, text: source.slice(textStart, end) });
    }
    textStart = -1;
  };

  const looksLikeTag = (at) => {
    const after = source[at + 1] ?? "";
    if (!/[A-Za-z/>]/.test(after)) return false;
    // `</` is unambiguous — no generic ever contains it — and inside element
    // children every `<` is markup. The identifier-glue rule below is only
    // needed to tell a tag from a generic out in plain TypeScript.
    if (after === "/" || inChildren()) return true;
    const before = at === 0 ? "" : source[at - 1];
    return !/[A-Za-z0-9_$)\]]/.test(before);
  };

  /** End of an opening tag: the first `>` not nested in an attribute `{...}`. */
  const endOfTag = (at) => {
    let cursor = at + 1;
    let depth = 0;
    while (cursor < source.length) {
      const char = source[cursor];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0) return cursor;
      cursor += 1;
    }
    return source.length;
  };

  while (index < source.length) {
    const char = source[index];

    if (char === "<" && looksLikeTag(index)) {
      flush(index);

      if (source[index + 1] === "/") {
        const close = source.indexOf(">", index);
        if (stack[stack.length - 1] === "jsx") stack.pop();
        index = (close === -1 ? source.length : close) + 1;
        textStart = inChildren() ? index : -1;
        continue;
      }

      const close = endOfTag(index);

      // `const update = <Key extends keyof FormState>(...)` — a generic arrow
      // function, which in a .tsx file is spelled exactly like an element. Two
      // tells no JSX tag has: type-parameter keywords inside, and a `(`
      // immediately after the `>`.
      const tagBody = source.slice(index + 1, close);
      const isTypeParameters =
        /\b(extends|keyof|infer)\b/.test(tagBody) || source[close + 1] === "(";
      if (isTypeParameters) {
        index += 1;
        continue;
      }

      const isSelfClosing = source[close - 1] === "/";
      if (!isSelfClosing) stack.push("jsx");
      index = close + 1;
      textStart = inChildren() ? index : -1;
      continue;
    }

    if (inChildren()) {
      if (char === "{") {
        flush(index);
        stack.push("expr");
        index += 1;
        continue;
      }
      if (textStart === -1) textStart = index;
      index += 1;
      continue;
    }

    if (stack[stack.length - 1] === "expr") {
      if (char === "{") stack.push("expr");
      else if (char === "}") {
        stack.pop();
        index += 1;
        textStart = inChildren() ? index : -1;
        continue;
      }
      index += 1;
      continue;
    }

    index += 1;
  }

  flush(source.length);
  return runs;
}

function findInFile(path) {
  const source = readFileSync(path, "utf8");
  const lineOf = makeLineLookup(source);
  const displayPath = relative(ROOT, path);
  const findings = [];

  // --- JSX text nodes -------------------------------------------------------
  // String contents are blanked so a `<` or `>` inside a class name or a URL
  // cannot open a fake element.
  for (const run of collectJsxText(blank(source, { blankStrings: true }))) {
    if (!isUserVisibleText(run.text)) continue;
    const leadingWhitespace = run.text.length - run.text.trimStart().length;
    findings.push({
      path: displayPath,
      line: lineOf(run.start + leadingWhitespace),
      kind: "jsx text",
      text: run.text.trim().replace(/\s+/g, " "),
    });
  }

  // --- Visible attributes ---------------------------------------------------
  // Comments only: the literal value IS what we are checking here.
  const withoutComments = blank(source, { blankStrings: false });
  const attribute = new RegExp(
    `\\b(${VISIBLE_ATTRIBUTES.join("|")})\\s*=\\s*(["'])(.*?)\\2`,
    "g",
  );
  let match;
  while ((match = attribute.exec(withoutComments)) !== null) {
    const text = match[3];
    if (!isUserVisibleText(text)) continue;
    findings.push({
      path: displayPath,
      line: lineOf(match.index),
      kind: `${match[1]}=`,
      text,
    });
  }

  return findings;
}

/** Flattens the locale tree to the dotted paths `t()` actually asks for. */
function flattenKeys(value, prefix = "", out = new Set()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flattenKeys(child, path, out);
    } else {
      out.add(path);
    }
  }
  return out;
}

function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!/[\\/]locales$/.test(path)) collectSourceFiles(path, out);
    } else if (/\.tsx?$/.test(path)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Keys referenced from code.
 *
 * `\bt\(` and not `t\(`: `expect(`, `.at(` and `format(` all end in a `t`,
 * and a word boundary is what tells them apart from the translation function.
 *
 * Template calls — `` t(`enum.workModel.${value}`) `` — cannot be resolved
 * statically, so their static prefix is recorded instead and every catalogue
 * key underneath it counts as reached. Without that, every enum key in the
 * catalogue reads as dead.
 */
function collectUsedKeys(files) {
  const used = new Map();
  const prefixes = new Set();
  const mentioned = new Set();

  for (const path of files) {
    const source = readFileSync(path, "utf8");
    const lineOf = makeLineLookup(source);
    const displayPath = relative(ROOT, path);

    for (const re of [
      /\bt\(\s*(["'])([\w.-]+)\1/g,
      /i18nKey\s*=\s*(["'])([\w.-]+)\1/g,
    ]) {
      let match;
      while ((match = re.exec(source)) !== null) {
        if (!used.has(match[2])) {
          used.set(match[2], { path: displayPath, line: lineOf(match.index) });
        }
      }
    }

    const templateCall = /\bt\(\s*`([\w.-]*)\$\{/g;
    let match;
    while ((match = templateCall.exec(source)) !== null) {
      if (match[1]) prefixes.add(match[1]);
    }

    /*
     * Any quoted string that looks like a dotted key also counts as a
     * reference. Keys reach `t()` in more ways than a literal first argument:
     * through a ternary (`t(dark ? "nav.themeLight" : "nav.themeDark")`),
     * through a field on a catalogue row (`labelKey: "enum.icon.arrow"`, read
     * later as `t(option.labelKey)`), or through a lookup table. Matching the
     * literal wherever it appears costs a little strictness — a key named in a
     * comment counts — and removes the entire false-positive class, which
     * matters more for a check whose findings are advisory.
     */
    const anyKeyLiteral = /(["'`])([a-z][\w-]*(?:\.[\w-]+)+)\1/g;
    while ((match = anyKeyLiteral.exec(source)) !== null) {
      mentioned.add(match[2]);
    }
  }

  return { used, prefixes, mentioned };
}

function checkKeys() {
  if (!existsSync(SOURCE_LOCALE)) {
    return { problems: [], unreachable: [], skipped: true };
  }

  const catalogue = flattenKeys(JSON.parse(readFileSync(SOURCE_LOCALE, "utf8")));
  const files = collectSourceFiles(SRC_DIR);
  const { used, prefixes, mentioned } = collectUsedKeys(files);
  const problems = [];

  for (const [key, where] of used) {
    // A pluralised key is stored as `key_one` / `key_other`; the call site
    // asks for the base name and i18next picks the suffix from `count`.
    const exists =
      catalogue.has(key) ||
      catalogue.has(`${key}_one`) ||
      catalogue.has(`${key}_other`);
    if (!exists) {
      problems.push(`${where.path}:${where.line}  t("${key}") — not in en-US.json`);
    }
  }

  /*
   * Unreachable keys are a NOTICE, not a failure.
   *
   * A key can legitimately be reached in ways this scanner cannot see: through
   * a variable (`t(option.labelKey)`), or from inside another locale value via
   * i18next's own `$t()` nesting. Failing on those would make the gate red for
   * correct code, and the skill is explicit that a check which cries wolf gets
   * switched off within a week. A missing key is the opposite — a user reads
   * `common.save` off the screen — so that half stays a hard failure.
   */
  const unreachable = [];
  for (const key of catalogue) {
    const base = key.replace(/_(one|other)$/, "");
    if (used.has(base) || used.has(key)) continue;
    if (mentioned.has(base) || mentioned.has(key)) continue;
    if ([...prefixes].some((prefix) => key.startsWith(prefix))) continue;
    unreachable.push(key);
  }

  return { problems, unreachable, skipped: false };
}

function main() {
  const files = collectTsxFiles(SRC_DIR);
  const findings = files.flatMap(findInFile);

  if (findings.length > 0) {
    console.log(
      `i18n-raw-strings: ${findings.length} untranslated string(s) in ${files.length} file(s)\n`,
    );
    for (const finding of findings.slice(0, 60)) {
      console.log(`  ${finding.path}:${finding.line}  [${finding.kind}]  ${finding.text}`);
    }
    if (findings.length > 60) {
      console.log(`  … +${findings.length - 60} more`);
    }
    console.log(
      "\nMove each one into apps/web/src/i18n/locales/ and render it with t().",
    );
    return 1;
  }

  const { problems, unreachable, skipped } = checkKeys();
  if (unreachable.length > 0) {
    console.log(
      `i18n-raw-strings: note — ${unreachable.length} key(s) no literal t() call reaches. ` +
        "Reached through a variable or an $t() nesting is fine; a genuinely dead key is not.",
    );
    for (const key of unreachable.slice(0, 15)) console.log(`  · ${key}`);
    if (unreachable.length > 15) console.log(`  · … +${unreachable.length - 15} more`);
  }

  if (problems.length > 0) {
    console.log(`i18n-raw-strings: ${problems.length} key problem(s)\n`);
    for (const problem of problems.slice(0, 60)) console.log(`  ${problem}`);
    if (problems.length > 60) console.log(`  … +${problems.length - 60} more`);
    return 1;
  }

  console.log(
    `i18n-raw-strings: ${files.length} .tsx file(s) scanned, no raw user-visible text` +
      (skipped ? " (no en-US.json yet — key check skipped)." : "; every t() key resolves."),
  );
  return 0;
}

process.exit(main());
