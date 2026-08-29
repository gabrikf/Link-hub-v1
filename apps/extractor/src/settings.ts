import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The optional on-disk settings file, shared by `crafthub-extract` and
 * `crafthub-hook`.
 *
 * The hook has no command line to speak of — Claude Code invokes it with a
 * fixed argument and a JSON blob on stdin — so anything the hook needs to know
 * has to live here. Keeping the extractor on the same file means "which repos,
 * which emails, which connection" is answered once.
 *
 * Everything is optional. A missing or unreadable file is not an error: the
 * hook must never break a user's session over its own configuration, and the
 * extractor can take everything from flags.
 */
export interface ExtractorSettings {
  /** The CraftHub git connection (uuid) events are attributed to. */
  readonly connectionId?: string;
  /** Author emails that count as "mine". Multiple is the normal case. */
  readonly authors?: readonly string[];
  /** Repositories to scan when none are given on the command line. */
  readonly repos?: readonly string[];
  /** Default `--since` window, e.g. `180.days.ago`. */
  readonly since?: string;
  /**
   * Opt-in to sending Claude Code's own summary of what it did.
   *
   * OFF unless explicitly set to `true`. That prose is a model's description of
   * work that may not be the user's to describe, and the connection carries the
   * authoritative `includeAgentSummary` flag server-side. This local mirror is
   * a second lock, not a replacement: the hook refuses to attach the text
   * unless BOTH the file says true and the connection allows it.
   */
  readonly includeAgentSummary?: boolean;
  /** Where the hook queues events between sessions. */
  readonly spoolDir?: string;
}

export const DEFAULT_CONFIG_PATH = join(homedir(), ".crafthub", "extractor.json");
export const DEFAULT_SPOOL_DIR = join(homedir(), ".crafthub", "spool");

/**
 * Reads the settings file. Returns `{}` for a missing, empty or malformed file
 * rather than throwing — see the note above about never breaking a session.
 */
export function loadSettings(configPath?: string): ExtractorSettings {
  const path =
    configPath ?? process.env.CRAFTHUB_EXTRACTOR_CONFIG ?? DEFAULT_CONFIG_PATH;

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as ExtractorSettings;
  } catch {
    return {};
  }
}

/** `CRAFTHUB_CONNECTION_ID` beats the settings file; an explicit flag beats both. */
export function resolveConnectionId(
  fromFlag: string | undefined,
  settings: ExtractorSettings,
): string | undefined {
  return (
    fromFlag?.trim() ||
    process.env.CRAFTHUB_CONNECTION_ID?.trim() ||
    settings.connectionId?.trim() ||
    undefined
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Checked locally so a typo produces a sentence instead of a 400 from the API
 * — and, more importantly, so the extract step can fail before writing a file
 * the user would otherwise review and then find unusable.
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
