import type { GitConnectionHealth, Post } from "@repo/schemas";
import { useEffect, useState } from "react";
import { FiCheckCircle, FiHelpCircle, FiLoader } from "react-icons/fi";
import { BADGE } from "../../../../shared-components/surface";
import type { WizardSourceKey } from "./wizard-shared";

/**
 * The trust moment. Never a dead spinner: while listening there is an animated
 * bar plus a sentence saying exactly what would flip it to green, and after a
 * minute of silence the step switches to per-source recovery guidance instead
 * of spinning forever.
 */

/** ~60s. Long enough for a webhook redelivery, short enough to not feel hung. */
const RECOVERY_GUIDANCE_AFTER_MS = 60_000;

const RECOVERY_GUIDANCE: Record<Exclude<WizardSourceKey, "mcp">, string> = {
  claude_code:
    "Finish a Claude Code session in a git repo — the hook fires when a session ends, not while you work.",
  extractor:
    "Run the extract command against a repo, read the JSON it wrote, then run the upload command.",
  forge:
    "Push a commit or merge a PR in the connected repository, then check the webhook's recent deliveries page for a 2xx response.",
};

function ListeningPanel({ instruction }: { instruction: string }) {
  return (
    // `role="status"` (implicit polite live region): the flip from listening
    // to connected happens without user input, so it must be announced, not
    // just painted green.
    <div
      role="status"
      className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-500/30 dark:bg-violet-500/10"
    >
      <p className="flex items-center gap-2.5 text-sm font-medium text-violet-900 dark:text-violet-100">
        <FiLoader className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        Listening for first activity…
      </p>
      <p className="mt-1 text-xs text-violet-800/80 dark:text-violet-200/80">
        {instruction}
      </p>
      <div
        aria-hidden="true"
        className="anim-sheen mt-3 h-1.5 rounded-full bg-violet-200/80 dark:bg-violet-500/25"
      />
    </div>
  );
}

function SuccessPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="anim-scale-in rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/10"
    >
      <p className="flex items-start gap-2 text-sm text-emerald-900 dark:text-emerald-100">
        <FiCheckCircle
          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <span>
          <span
            className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE.success}`}
          >
            Connected
          </span>
          {children}
        </span>
      </p>
    </div>
  );
}

function RecoveryPanel({ guidance }: { guidance: string }) {
  return (
    // Appears on a timer, not a click — same announce-or-be-missed rule.
    <div
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/5"
    >
      <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
        <FiHelpCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold">Nothing yet — that's normal.</span>{" "}
          {guidance} You can also skip for now: the connection keeps listening
          whether this dialog is open or not.
        </span>
      </p>
    </div>
  );
}

/** Shared 60s "show recovery guidance" timer. */
function useRecoveryTimer(active: boolean) {
  const [waitedLong, setWaitedLong] = useState(false);

  useEffect(() => {
    if (!active) {
      setWaitedLong(false);
      return;
    }
    const timer = window.setTimeout(
      () => setWaitedLong(true),
      RECOVERY_GUIDANCE_AFTER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [active]);

  return waitedLong;
}

export function ConnectionVerifyBody({
  sourceKey,
  health,
  isError,
}: {
  sourceKey: Exclude<WizardSourceKey, "mcp">;
  health: GitConnectionHealth | undefined;
  isError: boolean;
}) {
  const isConnected = (health?.totalEvents ?? 0) > 0;
  const waitedLong = useRecoveryTimer(!isConnected);

  if (isConnected && health) {
    return (
      <SuccessPanel>
        {health.totalEvents} event{health.totalEvents === 1 ? "" : "s"} received
        from {health.distinctReposLast30Days} repo
        {health.distinctReposLast30Days === 1 ? "" : "s"} (fingerprints only).
      </SuccessPanel>
    );
  }

  return (
    <div className="space-y-3">
      <ListeningPanel
        instruction={`Checked every 5 seconds; this flips green the moment the first event lands. To trigger one: ${RECOVERY_GUIDANCE[sourceKey]}`}
      />
      {waitedLong ? <RecoveryPanel guidance={RECOVERY_GUIDANCE[sourceKey]} /> : null}
      {isError ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          Could not check this connection's status. Still retrying — the
          connection itself is unaffected.
        </p>
      ) : null}
    </div>
  );
}

export function McpVerifyBody({ detectedPost }: { detectedPost: Post | null }) {
  const waitedLong = useRecoveryTimer(detectedPost === null);

  if (detectedPost) {
    return (
      <SuccessPanel>
        Your agent posted{" "}
        <strong className="font-semibold">
          {detectedPost.title ?? "an untitled update"}
        </strong>
        . It is in your review queue, not public.
      </SuccessPanel>
    );
  }

  return (
    <div className="space-y-3">
      <ListeningPanel instruction="Run the weekly_update prompt in your agent now — Claude Code: type /mcp__linkhub__weekly_update; Claude Desktop: + menu → linkhub → weekly_update; other tools: the prompt picker, or just ask for “my LinkHub weekly update”. This flips green the moment the post arrives." />
      {waitedLong ? (
        <RecoveryPanel guidance="Check that your agent lists the linkhub server as connected (see the Connect step's verify list), then run the prompt again — in Claude Code it is /mcp__linkhub__weekly_update, not /weekly_update." />
      ) : null}
    </div>
  );
}
