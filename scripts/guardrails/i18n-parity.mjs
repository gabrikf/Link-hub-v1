#!/usr/bin/env node
/**
 * Locale parity check — a NO-OP today, on purpose.
 *
 * CraftHub ships react-i18next with three locales — pt-BR, en-US, es-ES —
 * under `apps/web/src/i18n/locales/`, with en-US as the source and fallback.
 *
 * The failure mode this guards against is not "a locale file is malformed", it
 * is "somebody added a key to en-US and shipped, and pt-BR silently renders the
 * raw key three weeks later in front of a user". Nothing else catches that: the
 * type-checker cannot see into a JSON file, and the component renders happily
 * with a key where a sentence should be.
 *
 * This script was written before the locales existed, so that parity was
 * enforced from the first one. It still degrades to one line and exit 0 if the
 * directory is ever missing.
 *
 * Rules once locales exist:
 *   - every locale must hold exactly the same key set (deep, dotted paths)
 *   - no empty string values (an empty value renders as nothing, which reads
 *     as a layout bug rather than a missing translation)
 *   - JSON must parse
 *
 * Usage: node scripts/guardrails/i18n-parity.mjs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const LOCALES_DIR = resolve(ROOT, "apps/web/src/i18n/locales");

/** The three locales the product is planned to ship. */
const EXPECTED_LOCALES = ["pt-BR", "en-US", "es-ES"];

/** Flattens `{a:{b:"x"}}` to `["a.b"]` so nesting differences are real findings. */
function flatten(value, prefix = "", out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flatten(child, path, out);
    } else {
      out.set(path, child);
    }
  }
  return out;
}

function main() {
  if (!existsSync(LOCALES_DIR)) {
    console.log(
      "i18n-parity: skipped — apps/web/src/i18n/locales/ does not exist. That " +
        "directory is supposed to be there; see the `i18n` skill.",
    );
    return 0;
  }

  const files = readdirSync(LOCALES_DIR).filter((name) => name.endsWith(".json"));
  if (files.length === 0) {
    console.log("i18n-parity: skipped — no locale files in apps/web/src/i18n/locales/.");
    return 0;
  }

  const loaded = new Map();
  const problems = [];

  for (const file of files) {
    const locale = file.replace(/\.json$/, "");
    try {
      const parsed = JSON.parse(readFileSync(resolve(LOCALES_DIR, file), "utf8"));
      loaded.set(locale, flatten(parsed));
    } catch (error) {
      problems.push(`${file}: does not parse — ${error.message}`);
    }
  }

  for (const locale of EXPECTED_LOCALES) {
    if (!loaded.has(locale)) {
      problems.push(`missing locale file: ${locale}.json`);
    }
  }

  // The reference is the union of every key seen, not one designated locale:
  // designating en-US as the source of truth hides a key that exists only in
  // pt-BR, which is exactly how an orphaned translation survives for months.
  const allKeys = new Set();
  for (const keys of loaded.values()) {
    for (const key of keys.keys()) allKeys.add(key);
  }

  for (const [locale, keys] of loaded) {
    for (const key of allKeys) {
      if (!keys.has(key)) {
        problems.push(`${locale}: missing key "${key}"`);
      } else if (keys.get(key) === "") {
        problems.push(`${locale}: empty value for "${key}"`);
      }
    }
  }

  if (problems.length > 0) {
    console.log(`i18n-parity: ${problems.length} problem(s)\n`);
    for (const problem of problems.slice(0, 40)) console.log(`  - ${problem}`);
    if (problems.length > 40) console.log(`  … +${problems.length - 40} more`);
    return 1;
  }

  console.log(
    `i18n-parity: ${loaded.size} locale(s), ${allKeys.size} key(s), full parity.`,
  );
  return 0;
}

process.exit(main());
