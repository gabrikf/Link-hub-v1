import type { IngestActivityEventInput } from "@repo/schemas";
import { LinkHubActivityClient } from "../api-client.js";
import { loadConfig } from "../config.js";
import {
  deliveryIdForAgentSession,
  fingerprintRepo,
} from "../fingerprint.js";
import {
  configuredAuthorEmail,
  headSha,
  isGitRepository,
  readCommits,
  repositoryIdentity,
} from "../git.js";
import { DEFAULT_SPOOL_DIR, type ExtractorSettings } from "../settings.js";
import { inferTechnologies } from "../technologies.js";
import { debounceKey, Spool } from "./spool.js";

/**
 * The two hook handlers.
 *
 * A rule that outranks everything else in this file: **neither handler may ever
 * block or slow a Claude Code session.** Exit code 2 blocks the agent and any
 * other non-zero is a reported error, so every path here returns 0 — a
 * misconfigured LinkHub, an unreachable API, a corrupt spool and an unexpected
 * exception all look the same to the user, which is: nothing happened.
 *
 * The handlers return a small result object instead of exiting, so the tests
 * can assert on *what was written* rather than only on the exit code.
 */

/** The `Stop` payload, as Claude Code delivers it on stdin. */
export interface StopHookInput {
  readonly session_id?: string;
  readonly transcript_path?: string;
  readonly cwd?: string;
  readonly last_assistant_message?: string;
  readonly permission_mode?: string;
  /** True when this hook already fired and Claude is continuing. */
  readonly stop_hook_active?: boolean;
}

/** The `SessionEnd` payload. */
export interface SessionEndHookInput {
  readonly session_id?: string;
  readonly transcript_path?: string;
  readonly cwd?: string;
  readonly session_end_reason?: string;
}

export interface HookDeps {
  readonly settings: ExtractorSettings;
  readonly spoolDir?: string;
  /** Injected for tests; defaults to today in the local calendar. */
  readonly today?: () => string;
}

export interface StopResult {
  readonly spooled: boolean;
  /** Why nothing was spooled. Diagnostic only — never printed to the user. */
  readonly reason?:
    | "stop_hook_active"
    | "no_session_id"
    | "not_a_git_repo"
    | "no_head"
    | "head_unchanged"
    | "no_connection"
    | "error";
}

/** Payload values are capped at 300 characters by `activityPayloadSchema`. */
const MAX_SUMMARY_LENGTH = 300;

function todayIso(): string {
  // Local calendar date, matching how a person would describe "today".
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * `Stop` — fires once per TURN.
 *
 * Which is exactly why it does no network I/O. A naive implementation POSTs on
 * every single agent response: dozens of requests per session, each one latency
 * the user pays for and noise the ingestion endpoint has to de-duplicate. This
 * one appends at most one line to a local file, and only when the repository's
 * HEAD has actually moved since the last line it wrote for this session — so a
 * turn that answered a question, read some code, or was interrupted costs
 * nothing at all.
 */
export function handleStop(
  input: StopHookInput,
  deps: HookDeps,
): StopResult {
  try {
    // Claude sets this when it is continuing after a Stop hook already ran.
    // Doing anything here is how a hook loop starts.
    if (input.stop_hook_active === true) {
      return { spooled: false, reason: "stop_hook_active" };
    }

    const sessionId = input.session_id?.trim();
    if (!sessionId) return { spooled: false, reason: "no_session_id" };

    const cwd = input.cwd?.trim();
    if (!cwd || !isGitRepository(cwd)) {
      return { spooled: false, reason: "not_a_git_repo" };
    }

    const head = headSha(cwd);
    if (!head) return { spooled: false, reason: "no_head" };

    const connectionId = deps.settings.connectionId?.trim();
    if (!connectionId) return { spooled: false, reason: "no_connection" };

    const repoFingerprint = fingerprintRepo(repositoryIdentity(cwd));
    const spool = new Spool(deps.spoolDir ?? deps.settings.spoolDir ?? DEFAULT_SPOOL_DIR);
    const state = spool.readState();
    const key = debounceKey(sessionId, repoFingerprint);
    const previousHead = state[key];

    if (previousHead === head) {
      return { spooled: false, reason: "head_unchanged" };
    }

    // Only on a second and later record is there a range to look at; the first
    // record of a session has no baseline, so it carries no technologies rather
    // than guessing from history that predates the session.
    const authors = resolveHookAuthors(deps.settings, cwd);
    const landed =
      previousHead && authors.length > 0
        ? readCommits(cwd, {
            authors,
            revisionRange: `${previousHead}..${head}`,
          })
        : [];

    const technologies = inferTechnologies(
      landed.flatMap((commit) => [...commit.changedPaths]),
    );

    const event: IngestActivityEventInput = {
      externalDeliveryId: deliveryIdForAgentSession(
        repoFingerprint,
        sessionId,
        head,
      ),
      kind: "agent_session",
      occurredOn: (deps.today ?? todayIso)(),
      repoFingerprint,
      technologies,
      actorIsOwner: true,
      payload: buildAgentPayload(input, landed.length, deps.settings),
    };

    spool.append({ connectionId, event });
    spool.writeState({ ...state, [key]: head });
    return { spooled: true };
  } catch {
    // See the file header: a failure here is invisible, by design.
    return { spooled: false, reason: "error" };
  }
}

/**
 * The agent-session payload.
 *
 * `last_assistant_message` is the agent's own prose about what it just did. It
 * is the single most likely field to describe an employer's systems by name,
 * and it is written by a model rather than by the user — so it is attached ONLY
 * when the local settings file explicitly opts in. Omission means "no", and no
 * amount of configuration elsewhere turns it on by accident. The connection's
 * server-side `includeAgentSummary` flag is a second, independent gate; this
 * one exists so the text does not leave the machine in the first place.
 */
function buildAgentPayload(
  input: StopHookInput,
  commitCount: number,
  settings: ExtractorSettings,
): Record<string, string | number | boolean> {
  const payload: Record<string, string | number | boolean> = {
    tool: "claude_code",
    commits: commitCount,
  };

  if (settings.includeAgentSummary === true) {
    const summary = input.last_assistant_message?.trim();
    if (summary) {
      payload.agentSummary = summary.slice(0, MAX_SUMMARY_LENGTH);
    }
  }

  return payload;
}

function resolveHookAuthors(
  settings: ExtractorSettings,
  cwd: string,
): string[] {
  const configured = (settings.authors ?? [])
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length > 0) return [...new Set(configured)];

  const email = configuredAuthorEmail(cwd);
  return email ? [email.trim().toLowerCase()] : [];
}

export interface SessionEndResult {
  readonly flushed: number;
  readonly duplicates: number;
  readonly reason?: "empty_spool" | "no_token" | "upload_failed" | "error";
}

/**
 * `SessionEnd` — fires once per session, sharing a ~1.5 second budget with
 * every other SessionEnd hook.
 *
 * That budget is why this is the only place that touches the network AND why
 * the settings snippet marks it `"async": true`: Claude Code does not wait for
 * it, so the HTTP round trip happens off the critical path.
 *
 * On failure the spool is LEFT IN PLACE. Nothing is lost when the user is
 * offline, when the API is down, or when the token has expired — the next
 * session that ends successfully carries the backlog, and the events are
 * idempotent so a partially-successful earlier attempt costs nothing.
 */
export async function handleSessionEnd(
  input: SessionEndHookInput,
  deps: HookDeps,
): Promise<SessionEndResult> {
  try {
    const spool = new Spool(
      deps.spoolDir ?? deps.settings.spoolDir ?? DEFAULT_SPOOL_DIR,
    );
    const records = spool.read();

    // Prune this session's debounce state either way: it is only meaningful
    // while the session is alive, and leaving it would grow the file forever.
    pruneState(spool, input.session_id);

    if (records.length === 0) return { flushed: 0, duplicates: 0, reason: "empty_spool" };

    const config = loadConfig();
    const client = new LinkHubActivityClient(config);

    let flushed = 0;
    let duplicates = 0;
    const delivered = new Set<string>();

    // One envelope per connection; the client splits anything over 500 events.
    for (const [connectionId, events] of groupByConnection(records)) {
      const result = await client.ingest({
        connectionId,
        source: "hook",
        events,
      });
      flushed += result.recorded;
      duplicates += result.duplicates;
      for (const event of events) delivered.add(event.externalDeliveryId);
    }

    // Only the ids that actually made it are dropped, and only after the POST
    // resolved — so an exception above leaves the whole spool for next time.
    spool.removeDelivered(delivered);
    return { flushed, duplicates };
  } catch (err) {
    // A missing token is the common, benign case: the user installed the hook
    // before minting a PAT. Keep spooling; it will flush once they do.
    const reason =
      err instanceof Error && err.name === "ConfigError"
        ? "no_token"
        : "upload_failed";
    return { flushed: 0, duplicates: 0, reason };
  }
}

function groupByConnection(
  records: readonly { connectionId: string; event: IngestActivityEventInput }[],
): Map<string, IngestActivityEventInput[]> {
  const grouped = new Map<string, IngestActivityEventInput[]>();
  for (const record of records) {
    const existing = grouped.get(record.connectionId);
    if (existing) existing.push(record.event);
    else grouped.set(record.connectionId, [record.event]);
  }
  return grouped;
}

function pruneState(spool: Spool, sessionId: string | undefined): void {
  if (!sessionId) return;
  try {
    const state = spool.readState();
    let changed = false;
    for (const key of Object.keys(state)) {
      if (key.startsWith(`${sessionId}:`)) {
        delete state[key];
        changed = true;
      }
    }
    if (changed) spool.writeState(state);
  } catch {
    // Debounce state is a cache; failing to prune it is harmless.
  }
}
