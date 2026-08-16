#!/usr/bin/env node
import { readStdin, runHookCli } from "../cli/hook-cli.js";

/**
 * Exit code 0, unconditionally.
 *
 * Claude Code treats 2 as "block the agent" and any other non-zero as a
 * reported error. Neither is an acceptable outcome for a profile tool, so the
 * catch here is not a fallback — it is the guarantee. If this package throws,
 * the user's session must not notice.
 */
async function main(): Promise<void> {
  try {
    const stdinText = await readStdin();
    await runHookCli(process.argv.slice(2), stdinText);
  } catch {
    // Intentionally silent. See above.
  }
  process.exitCode = 0;
}

void main();
