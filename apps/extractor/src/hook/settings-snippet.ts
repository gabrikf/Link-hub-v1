/**
 * The Claude Code settings snippet, as data.
 *
 * This is exported as a string-producing function rather than printed inline so
 * the LinkHub web settings page can render exactly the same block for
 * copy-paste that `linkhub-hook print-settings` prints in a terminal. There is
 * one source of truth for the configuration, and it is here.
 *
 * This package NEVER writes to `~/.claude/settings.json`. A tool whose pitch is
 * "we do not touch things without asking" does not begin by editing the user's
 * agent configuration behind their back — it prints the block and lets them
 * paste it.
 */

export interface SettingsSnippetOptions {
  /**
   * How the hook is invoked. `linkhub-hook` once the package is installed
   * globally; an absolute path to `dist/bin/linkhub-hook.js` when running from
   * a checkout.
   */
  readonly command?: string;
  /** Set when the user keeps config somewhere other than ~/.linkhub. */
  readonly configPath?: string;
}

const DEFAULT_COMMAND = "linkhub-hook";

/**
 * Timeouts, chosen against how each event actually behaves:
 *
 * - `Stop` does no network I/O at all — a couple of `git rev-parse` calls and an
 *   append. 5 seconds is already absurdly generous, and it is there only so a
 *   pathological filesystem cannot hang a turn.
 * - `SessionEnd` hooks share a ~1.5 second budget, which is not enough for an
 *   HTTP round trip. It is therefore declared `"async": true` so Claude Code
 *   does not wait for it; the 30 seconds is the ceiling for the detached
 *   process, not latency the user experiences.
 */
const STOP_TIMEOUT_SECONDS = 5;
const SESSION_END_TIMEOUT_SECONDS = 30;

/** The settings object, so callers can merge rather than paste if they prefer. */
export function claudeSettingsHooks(
  options: SettingsSnippetOptions = {},
): Record<string, unknown> {
  const command = options.command ?? DEFAULT_COMMAND;
  const suffix = options.configPath ? ` --config ${options.configPath}` : "";

  return {
    hooks: {
      Stop: [
        {
          // An empty matcher means "every occurrence of this event".
          matcher: "",
          hooks: [
            {
              type: "command",
              command: `${command} stop${suffix}`,
              timeout: STOP_TIMEOUT_SECONDS,
            },
          ],
        },
      ],
      SessionEnd: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command: `${command} session-end${suffix}`,
              timeout: SESSION_END_TIMEOUT_SECONDS,
              // Non-blocking: the flush must never sit in the ~1.5s budget
              // SessionEnd hooks share.
              async: true,
            },
          ],
        },
      ],
    },
  };
}

/** Pretty-printed JSON for `~/.claude/settings.json` (or a project's own). */
export function claudeSettingsSnippet(
  options: SettingsSnippetOptions = {},
): string {
  return JSON.stringify(claudeSettingsHooks(options), null, 2);
}

/** The prose that must travel with the snippet wherever it is shown. */
export const SETTINGS_SNIPPET_NOTES: readonly string[] = [
  "Paste this into ~/.claude/settings.json (all projects) or .claude/settings.json (one project).",
  "If the file already has a \"hooks\" key, merge the Stop and SessionEnd arrays into it.",
  "Stop runs on every turn and does NO network I/O — it appends to ~/.linkhub/spool/ only when the repo's HEAD has moved.",
  "SessionEnd uploads the spool. It is async, so it never delays your session; if it fails the spool is kept and the next session retries.",
  "Both hooks exit 0 on every failure, so LinkHub can never block or slow down Claude Code.",
  "Set connectionId in ~/.linkhub/extractor.json and LINKHUB_API_TOKEN in your environment, or the hook spools quietly and uploads nothing.",
];
