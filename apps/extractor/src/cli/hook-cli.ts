import { parseArgs, value } from "../args.js";
import { loadSettings } from "../settings.js";
import {
  handleSessionEnd,
  handleStop,
  type SessionEndHookInput,
  type StopHookInput,
} from "../hook/handlers.js";
import {
  claudeSettingsSnippet,
  SETTINGS_SNIPPET_NOTES,
} from "../hook/settings-snippet.js";

/**
 * `crafthub-hook` — the Claude Code hook entry point.
 *
 * Claude Code invokes it with one subcommand and a JSON object on stdin.
 *
 * The contract with the user's session is absolute: **this command always exits
 * 0.** Exit code 2 blocks the agent and any other non-zero surfaces as an
 * error, so an unreachable API, a missing token, a corrupt spool or an outright
 * bug in this package must all be indistinguishable from "nothing to do". A
 * profile tool has no business interrupting someone's work.
 *
 * It also prints nothing on the happy path. stdout from a hook is noise in
 * someone's terminal; the spool file is the observable output.
 */

const HELP = `
crafthub-hook — Claude Code hook for CraftHub activity.

USAGE
  crafthub-hook stop            Read a Stop payload on stdin; spool locally.
  crafthub-hook session-end     Read a SessionEnd payload on stdin; flush the spool.
  crafthub-hook print-settings  Print the ~/.claude/settings.json snippet.

OPTIONS
  --config <file>   Config file (default: ~/.crafthub/extractor.json).
  --command <path>  print-settings only: how the hook is invoked in the snippet.

This command always exits 0. It never blocks or delays a Claude Code session.
`;

/**
 * Runs the hook. Returns an exit code so tests can assert on it, but the bin
 * wrapper forces 0 regardless — belt and braces on the one guarantee that
 * cannot be allowed to fail.
 */
export async function runHookCli(
  argv: readonly string[],
  stdinText: string,
): Promise<number> {
  const args = parseArgs(argv);
  const command = args.command;

  if (command === "print-settings") {
    console.log(
      claudeSettingsSnippet({
        command: value(args, "command"),
        configPath: value(args, "config"),
      }),
    );
    const notes = SETTINGS_SNIPPET_NOTES.map((n) => `# ${n}`).join("\n");
    console.log(`\n${notes}`);
    return 0;
  }

  if (command !== "stop" && command !== "session-end") {
    console.log(HELP.trim());
    return 0;
  }

  const payload = parsePayload(stdinText);
  if (!payload) return 0;

  const settings = loadSettings(value(args, "config"));

  if (command === "stop") {
    handleStop(payload as StopHookInput, { settings });
    return 0;
  }

  await handleSessionEnd(payload as SessionEndHookInput, { settings });
  return 0;
}

/** Malformed or absent stdin is a no-op, not an error. */
function parsePayload(stdinText: string): Record<string, unknown> | null {
  const trimmed = stdinText.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Drains stdin. Returns "" when there is nothing to read (a TTY, or a closed
 * pipe), which `runHookCli` treats as a no-op.
 */
export async function readStdin(
  stream: NodeJS.ReadStream = process.stdin,
): Promise<string> {
  if (stream.isTTY) return "";
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
  } catch {
    return "";
  }
  return Buffer.concat(chunks).toString("utf8");
}
