import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ingestActivitySchemaInput } from "@repo/schemas";
import type { IngestActivityInput } from "@repo/schemas";
import { LinkHubActivityClient, LinkHubApiError } from "../api-client.js";
import { ArgError, flag, parseArgs, value, values } from "../args.js";
import { ConfigError, loadConfig } from "../config.js";
import { buildEnvelope, extract, resolveAuthors } from "../extract.js";
import { isUuid, loadSettings, resolveConnectionId } from "../settings.js";
import { renderExtractSummary, renderUploadPreamble } from "../summary.js";

/**
 * `linkhub-extract` — extract, review, then (separately) upload.
 *
 * The split between `extract` and `upload` is the product, not ergonomics.
 * Extraction is local, needs no token, and works with the network unplugged; it
 * ends by telling the user where the file is and stopping. Uploading is a
 * second command the user types, or an explicit `--yes` they pass. There is no
 * code path on which extracting causes an upload as a side effect.
 */

const DEFAULT_OUTPUT = "linkhub-activity.json";
const DEFAULT_SINCE = "90.days.ago";

const KNOWN_COMMANDS = new Set(["extract", "upload", "help"]);

const HELP = `
linkhub-extract — turn local git history into hashed, aggregated activity
                  metadata you review before anything is uploaded.

USAGE
  linkhub-extract [extract] [<repo-path>...] [options]
  linkhub-extract upload <file> [options]
  linkhub-extract help

COMMANDS
  extract   Read git history, write a JSON payload, print a summary, and STOP.
            This is the default command. It never uploads.
  upload    POST a previously extracted file to LinkHub. This is the only
            command that touches the network.

OPTIONS
  -a, --author <email>   Commit author email to treat as yours. Repeatable —
                         pass it once per address you commit under. Defaults to
                         each repository's own \`git config user.email\`.
  -r, --repo <path>      Extra repository to scan. Repeatable. Repositories may
                         also be given as positional arguments, or listed in the
                         config file.
      --since <when>     Anything git understands (default: ${DEFAULT_SINCE}).
      --until <when>     Upper bound on the history walked.
      --max-commits <n>  Stop after n commits per repository.
      --connection <id>  LinkHub git connection uuid to attribute events to.
                         Also read from LINKHUB_CONNECTION_ID or the config file.
  -o, --out <file>       Where to write the payload (default: ${DEFAULT_OUTPUT}).
  -c, --config <file>    Config file (default: ~/.linkhub/extractor.json).
  -y, --yes              Upload immediately after extracting, skipping review.
                         Off by default, and deliberately awkward to reach.
  -h, --help             This text.

ENVIRONMENT
  LINKHUB_API_TOKEN   Personal access token (lh_pat_...) with activity:write.
                      Needed ONLY for upload.
  LINKHUB_API_URL     API base URL (default http://localhost:3333).
  LINKHUB_CONNECTION_ID
                      Default connection uuid.
`;

/**
 * Runs the CLI and returns a process exit code. Exported (rather than calling
 * `process.exit` inline) so tests can drive the whole command surface without
 * spawning.
 */
export async function runExtractCli(argv: readonly string[]): Promise<number> {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err instanceof ArgError ? err.message : String(err));
    return 1;
  }

  if (flag(args, "help") || args.command === "help") {
    console.log(HELP.trim());
    return 0;
  }

  const command = KNOWN_COMMANDS.has(args.command ?? "")
    ? (args.command as string)
    : "extract";

  // When the command word was omitted, every positional is a repo path.
  const positionals = KNOWN_COMMANDS.has(args.command ?? "")
    ? args.positionals.slice(1)
    : [...args.positionals];

  try {
    if (command === "upload") return await runUpload(positionals[0], args);
    return await runExtract(positionals, args);
  } catch (err) {
    console.error(describe(err));
    return 1;
  }
}

async function runExtract(
  positionals: readonly string[],
  args: ReturnType<typeof parseArgs>,
): Promise<number> {
  const settings = loadSettings(value(args, "config"));

  const repoPaths = [
    ...positionals,
    ...values(args, "repo"),
    ...(positionals.length === 0 && values(args, "repo").length === 0
      ? (settings.repos ?? [])
      : []),
  ].map((path) => resolve(path));

  // No paths anywhere means "the repository I am standing in".
  const targets = repoPaths.length > 0 ? repoPaths : [process.cwd()];

  const connectionId = resolveConnectionId(value(args, "connection"), settings);
  if (!connectionId || !isUuid(connectionId)) {
    console.error(
      connectionId
        ? `--connection must be a uuid; got "${connectionId}".`
        : "No connection id. Create a git connection in LinkHub settings, then pass " +
          "--connection <uuid>, set LINKHUB_CONNECTION_ID, or add \"connectionId\" to " +
          "~/.linkhub/extractor.json.",
    );
    return 1;
  }

  const authors = resolveAuthors(values(args, "author"), settings.authors, targets);
  if (authors.length === 0) {
    console.error(
      "No author email to match. Pass --author <email> (repeatable — use it once " +
        "per address you commit under), or set `git config user.email` in the repository.",
    );
    return 1;
  }

  const maxCommitsRaw = value(args, "max-commits");
  const maxCommits = maxCommitsRaw ? Number.parseInt(maxCommitsRaw, 10) : undefined;
  if (maxCommits !== undefined && (!Number.isFinite(maxCommits) || maxCommits < 1)) {
    console.error("--max-commits must be a positive integer.");
    return 1;
  }

  const { events, stats } = extract(targets, {
    authors,
    since: value(args, "since") ?? settings.since ?? DEFAULT_SINCE,
    until: value(args, "until"),
    maxCommits,
  });

  const outputPath = resolve(value(args, "out") ?? DEFAULT_OUTPUT);

  if (events.length === 0) {
    console.log(
      "\n  No commits matched, so no file was written.\n" +
        `  Author emails tried: ${authors.length} (${authors.length === 1 ? "one address" : "several addresses"}).\n` +
        "  Check --author against the commit author email, and widen --since.\n",
    );
    if (stats.skippedPaths.length > 0) {
      console.log(
        `  Skipped (not a git repository):\n${stats.skippedPaths
          .map((p) => `    · ${p}`)
          .join("\n")}\n`,
      );
    }
    return 0;
  }

  // Validated against the SAME schema the API validates with, before the file
  // is written. A payload that would be rejected is a bug in this tool, and the
  // user should not be the one to discover it at upload time. Parsing also
  // applies the schema's defaults, so what lands on disk is byte-for-byte the
  // request body — which is what makes reviewing the file meaningful.
  const envelope: IngestActivityInput = ingestActivitySchemaInput.parse(
    buildEnvelope(connectionId, events),
  );

  writeFileSync(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  console.log(renderExtractSummary(envelope, stats, outputPath));

  if (!flag(args, "yes")) return 0;

  console.log("  --yes was passed, so the review step is being skipped.");
  return await upload(envelope);
}

async function runUpload(
  filePath: string | undefined,
  args: ReturnType<typeof parseArgs>,
): Promise<number> {
  if (!filePath) {
    console.error("Usage: linkhub-extract upload <file>");
    return 1;
  }

  const path = resolve(filePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(
      `Could not read ${path} as JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  const result = ingestActivitySchemaInput.safeParse(parsed);
  if (!result.success) {
    // Re-validating a hand-edited file is the point: a user is invited to open
    // and edit this payload, so the tool has to say clearly when an edit made
    // it un-sendable rather than letting the API answer with a 400.
    console.error(
      `${path} is not a valid activity payload:\n${result.error.issues
        .map((issue) => `  · ${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n")}`,
    );
    return 1;
  }

  const overrideConnection = resolveConnectionId(
    value(args, "connection"),
    loadSettings(value(args, "config")),
  );
  const envelope: IngestActivityInput =
    overrideConnection && isUuid(overrideConnection)
      ? { ...result.data, connectionId: overrideConnection }
      : result.data;

  return await upload(envelope);
}

async function upload(envelope: IngestActivityInput): Promise<number> {
  // Config first: announcing "uploading…" and then failing on a missing token
  // reads as though something was attempted. Nothing was.
  const client = new LinkHubActivityClient(loadConfig());

  console.log(renderUploadPreamble(envelope));
  const outcome = await client.ingest(envelope);

  console.log(
    `  Done — ${outcome.recorded} recorded, ${outcome.duplicates} already known.\n`,
  );
  return 0;
}

function describe(err: unknown): string {
  if (err instanceof ConfigError) return err.message;
  if (err instanceof LinkHubApiError) return err.message;
  if (err instanceof ArgError) return err.message;
  return err instanceof Error ? err.message : String(err);
}
