import type { IngestActivityInput } from "@repo/schemas";
import type { ExtractStats } from "./extract.js";

/**
 * The review step, rendered.
 *
 * This is the product's core promise made legible: a person who is nervous
 * about pointing a tool at their employer's repository should be able to read
 * this block, then open the JSON, and find that the two agree. So the summary
 * states what IS in the file, what is NOT in the file, and where the file is —
 * and the CLI stops here.
 *
 * The "not in the file" list is written out in full rather than summarised as
 * "no sensitive data", because a specific list is checkable and a reassurance
 * is not.
 */

/**
 * Exactly the fields this tool refuses to produce. Each line is something a
 * reader can grep the JSON for and fail to find.
 */
export const OMITTED_FROM_PAYLOAD: readonly string[] = [
  "repository names, remote URLs and local paths (hashed into repoFingerprint)",
  "branch names",
  "commit messages (never even read — git is asked for trailers, not the message)",
  "file names, paths and diffs (reduced to technology tags and a file count)",
  "your name and email, and any collaborator's (hashed into counterpartyFingerprints)",
  "times of day, hours and timezone offsets (dates only, so it cannot show when you sleep)",
  "issue keys, ticket numbers, customer or project names",
];

function formatList(values: readonly string[], max = 20): string {
  if (values.length === 0) return "(none)";
  if (values.length <= max) return values.join(", ");
  return `${values.slice(0, max).join(", ")} … and ${values.length - max} more`;
}

/** Human-readable review block printed after an extract run. */
export function renderExtractSummary(
  envelope: IngestActivityInput,
  stats: ExtractStats,
  outputPath: string,
): string {
  const range =
    stats.earliestDate && stats.latestDate
      ? stats.earliestDate === stats.latestDate
        ? stats.earliestDate
        : `${stats.earliestDate} → ${stats.latestDate}`
      : "(no events)";

  const lines: string[] = [
    "",
    "  LinkHub activity extract — NOTHING HAS BEEN UPLOADED",
    "  ───────────────────────────────────────────────────",
    "",
    `  Written to      ${outputPath}`,
    `  Events          ${envelope.events.length}  (from ${stats.repositories} ${
      stats.repositories === 1 ? "repository" : "repositories"
    })`,
    `  Date range      ${range}`,
    `  Technologies    ${formatList(stats.technologies)}`,
    `  Collaborators   ${stats.counterparties} distinct, as one-way hashes only`,
    `  Connection      ${envelope.connectionId}`,
    "",
    "  What each event contains:",
    "    a date (YYYY-MM-DD), a 64-character repo hash, technology tags,",
    "    a changed-file count, and a deterministic id derived from the hashes.",
    "",
    "  What is NOT in the file:",
    ...OMITTED_FROM_PAYLOAD.map((item) => `    · ${item}`),
    "",
    "  Check it yourself — the file is pretty-printed and is byte-for-byte the",
    "  request body:",
    `    cat ${outputPath}`,
    `    grep -i 'the-name-you-are-worried-about' ${outputPath}`,
    "",
    "  Nothing leaves this machine until you run:",
    `    linkhub-extract upload ${outputPath}`,
    "",
  ];

  if (stats.skippedPaths.length > 0) {
    lines.push(
      "  Skipped (not a git repository):",
      ...stats.skippedPaths.map((path) => `    · ${path}`),
      "",
    );
  }

  if (envelope.events.length === 0) {
    lines.push(
      "  No commits matched. Check --author (it must match the commit author",
      "  email exactly) and --since.",
      "",
    );
  }

  return lines.join("\n");
}

/** Shown before an upload actually happens, so the last word is still a fact. */
export function renderUploadPreamble(envelope: IngestActivityInput): string {
  return [
    "",
    `  Uploading ${envelope.events.length} event(s) to connection ${envelope.connectionId}.`,
    "  Repeats of events already recorded come back as duplicates, not errors.",
    "",
  ].join("\n");
}
