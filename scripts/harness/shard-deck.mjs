#!/usr/bin/env node
/**
 * Split a harness-eval claim deck into shards a judge can actually finish.
 *
 * `claims.md` for this repo is ~1,400 rows. A single subagent asked to emit a
 * score row for every one of them writes an enormous table, and the failure mode
 * is not an error — it is a judge that quietly stops at row 400 and summarises
 * the rest. Those missing rows land in Hold at merge time, so the run looks
 * cautious rather than truncated, which is the worst kind of wrong.
 *
 * So: shard the deck by row, repeat the header and rubric verbatim in every
 * shard, and give each judge one shard. The protocol is untouched — Judge1 and
 * Judge2 still score every ID independently, the blind judge still never sees
 * Judge1's file, and the plants stay where the deck put them. `merge_agreement`
 * parses score rows with a regex over the whole file, so concatenating the shard
 * outputs back into `05-…` / `06-…` is exactly equivalent to one big answer.
 *
 * Usage:
 *   node scripts/harness/shard-deck.mjs --run-dir .harness-eval/runs/<id> --shards 5
 */
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
}

const runDir = resolve(flag("--run-dir", ""));
const shards = Number(flag("--shards", "5"));
if (!runDir || !Number.isInteger(shards) || shards < 1) {
  console.error("usage: shard-deck.mjs --run-dir <dir> [--shards N]");
  process.exit(2);
}

const deckPath = join(runDir, "claims.md");
const text = readFileSync(deckPath, "utf8");
const lines = text.split("\n");

/** Everything up to and including the table header + separator is the preamble. */
const firstRow = lines.findIndex((line) => /^\|\s*[CP]\d{3,}\s*\|/.test(line));
if (firstRow === -1) {
  console.error(`no claim rows found in ${deckPath}`);
  process.exit(2);
}
const preamble = lines.slice(0, firstRow);
const rows = lines.slice(firstRow).filter((line) => /^\|\s*[CP]\d{3,}\s*\|/.test(line));

// A stale shard from a previous, larger run would be silently re-judged.
for (const name of readdirSync(runDir)) {
  if (/^claims\.shard-\d+\.md$/.test(name)) unlinkSync(join(runDir, name));
}

const perShard = Math.ceil(rows.length / shards);
const written = [];
for (let index = 0; index < shards; index += 1) {
  const slice = rows.slice(index * perShard, (index + 1) * perShard);
  if (slice.length === 0) continue;
  const first = slice[0].split("|")[1].trim();
  const last = slice[slice.length - 1].split("|")[1].trim();
  const name = `claims.shard-${index + 1}.md`;
  writeFileSync(
    join(runDir, name),
    [
      ...preamble,
      ...slice,
      "",
      `<!-- shard ${index + 1} of ${shards}: ${first}..${last}, ${slice.length} rows -->`,
      "",
    ].join("\n"),
  );
  written.push({ name, first, last, rows: slice.length });
}

console.log(JSON.stringify({ deck: deckPath, total: rows.length, shards: written }, null, 2));
