import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { IngestActivityEventInput } from "@repo/schemas";

/**
 * The spool: a local, append-only queue of events the hook has observed but not
 * yet uploaded.
 *
 * It exists because of when the two hooks fire. `Stop` fires once per TURN —
 * dozens of times in a working session — so it must not do network I/O; it
 * appends a line here instead. `SessionEnd` fires once and shares a ~1.5 second
 * budget with every other SessionEnd hook, so it kicks off the upload
 * asynchronously and, crucially, LEAVES THE SPOOL ALONE if the upload fails.
 *
 * That last property is what makes the design offline-safe: a session on a
 * plane spools normally, fails to flush, and the next session that ends
 * successfully carries the backlog. The events are idempotent server-side, so a
 * retry costs nothing even if the earlier attempt got further than it looked.
 */

/** One queued event, plus the connection it belongs to. */
export interface SpoolRecord {
  readonly connectionId: string;
  readonly event: IngestActivityEventInput;
}

/** Per-session debounce state: the HEAD we last spooled for a session+repo. */
export interface SpoolState {
  [sessionAndRepoKey: string]: string;
}

export const SPOOL_FILE = "events.jsonl";
export const STATE_FILE = "state.json";

export class Spool {
  constructor(private readonly dir: string) {}

  private get eventsPath(): string {
    return join(this.dir, SPOOL_FILE);
  }

  private get statePath(): string {
    return join(this.dir, STATE_FILE);
  }

  /**
   * Appends one record. JSONL rather than a JSON array so a concurrent session
   * appending at the same moment cannot corrupt the file — there is no closing
   * bracket to race over, and a single short line is written atomically.
   */
  append(record: SpoolRecord): void {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    appendFileSync(this.eventsPath, `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  /**
   * Every queued record. Unparseable lines are dropped rather than thrown over:
   * one truncated line (a crash mid-append) must not permanently wedge the
   * queue behind it.
   */
  read(): SpoolRecord[] {
    let raw: string;
    try {
      raw = readFileSync(this.eventsPath, "utf8");
    } catch {
      return [];
    }

    const records: SpoolRecord[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as SpoolRecord;
        if (parsed?.connectionId && parsed?.event?.externalDeliveryId) {
          records.push(parsed);
        }
      } catch {
        // Ignore; see above.
      }
    }
    return records;
  }

  /**
   * Removes exactly the records that were successfully uploaded, identified by
   * `externalDeliveryId`.
   *
   * The file is re-read first rather than truncated, because a parallel session
   * may have appended while the upload was in flight and truncating would throw
   * that work away. Written via a temp file + rename so a crash mid-write
   * leaves the old spool intact rather than a half-file.
   */
  removeDelivered(deliveredIds: ReadonlySet<string>): void {
    const remaining = this.read().filter(
      (record) => !deliveredIds.has(record.event.externalDeliveryId),
    );

    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const temp = `${this.eventsPath}.tmp`;
    const body = remaining.map((r) => `${JSON.stringify(r)}\n`).join("");
    writeFileSync(temp, body, { encoding: "utf8", mode: 0o600 });
    renameSync(temp, this.eventsPath);
  }

  readState(): SpoolState {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.statePath, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as SpoolState;
      }
    } catch {
      // A missing or corrupt state file means "no debounce baseline", which
      // costs one extra spooled record — never a lost session.
    }
    return {};
  }

  writeState(state: SpoolState): void {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const temp = `${this.statePath}.tmp`;
    writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temp, this.statePath);
  }
}

/** Debounce key. Per session AND per repo: one session can touch two repos. */
export function debounceKey(sessionId: string, repoFingerprint: string): string {
  return `${sessionId}:${repoFingerprint}`;
}
