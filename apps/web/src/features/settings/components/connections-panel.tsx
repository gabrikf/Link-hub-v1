import type {
  AgentPolicy,
  GitConnection,
  WorkExperienceResponse,
} from "@repo/schemas";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FiActivity,
  FiChevronDown,
  FiEdit2,
  FiPlay,
  FiPlus,
  FiShield,
  FiTerminal,
  FiTrash2,
} from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import { LoadingLabel, Skeleton } from "../../../shared-components/skeleton";
import {
  BADGE,
  FOCUS_RING,
  SURFACE_EMPTY,
  SURFACE_GLASS,
} from "../../../shared-components/surface";
import {
  useAgentPolicy,
  useWorkExperiencesForPolicy,
} from "../lib/agent-policy-queries";
import {
  claudeHookNotes,
  CLAUDE_HOOK_SNIPPET,
  claudeHookSummary,
  CLAUDE_HOOK_TARGET,
  CONNECTIONS_PANEL_ID,
  disclosureConsequence,
  disclosureLevelLabel,
  disclosureSourceLabel,
  formatLastDigest,
  getCadenceLabels,
  kindInheritsWorkRules,
  KIND_LABELS,
  PROVIDER_LABELS,
  resolveEffectiveDisclosure,
} from "../lib/connection-format";
import type { CreateGitConnectionOutput } from "../lib/connection-queries";
import {
  useDeleteConnection,
  useMyConnections,
} from "../lib/connection-queries";
import { ConnectionDialog } from "./connection-dialog";
import {
  clearStashedConnection,
  InstructionList,
  NewConnectionSetup,
  readStashedConnection,
  stashConnection,
  type StashedConnection,
} from "./new-connection-setup";
import { SnippetBlock } from "./snippet-block";

// Re-exported for existing importers; the definition moved to
// `new-connection-setup.tsx` so the auto-post wizard can reuse it.
export type { StashedConnection };

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

function ClaudeHookDisclosure() {
  const { t } = useTranslation();
  return (
    <details className="group mt-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 ${FOCUS_RING} rounded-md`}
      >
        <FiTerminal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t("settings.connections.hookTarget", { target: CLAUDE_HOOK_TARGET })}
        <FiChevronDown
          className="ml-auto h-3.5 w-3.5 shrink-0 transition group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
        {claudeHookSummary()}
      </p>
      <div className="mt-2">
        <SnippetBlock
          snippet={{
            target: CLAUDE_HOOK_TARGET,
            language: "json",
            code: CLAUDE_HOOK_SNIPPET,
          }}
        />
      </div>
      <InstructionList steps={claudeHookNotes()} />
    </details>
  );
}

/**
 * What a work connection's digests will actually be held to, and where that
 * came from.
 *
 * Rendered before the auto-posting badge is even read, because the whole point
 * is that the user understands the consequence BEFORE turning auto-posting on —
 * a work source at Summary never names the employer, and that is a promise the
 * server keeps, not advice the model is given.
 */
function EffectiveDisclosure({
  connection,
  policy,
  roles,
}: {
  connection: GitConnection;
  policy: AgentPolicy | undefined;
  roles: WorkExperienceResponse[];
}) {
  const { t } = useTranslation();
  const { level, source } = resolveEffectiveDisclosure(connection, policy);
  const companyName =
    roles.find((role) => role.id === connection.workExperienceId)
      ?.companyName ??
    policy?.perEmployer.find(
      (entry) => entry.workExperienceId === connection.workExperienceId,
    )?.companyName ??
    null;

  return (
    <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-violet-200 bg-violet-50/60 px-2.5 py-1.5 text-xs text-zinc-700 dark:border-violet-500/30 dark:bg-violet-500/5 dark:text-zinc-300">
      <FiShield className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {t("settings.connections.disclosureLevel", {
            level: disclosureLevelLabel(level),
          })}
        </span>{" "}
        <span className="text-zinc-600 dark:text-zinc-400">
          ({disclosureSourceLabel(source, companyName)})
        </span>
        <span className="mt-0.5 block">
          {disclosureConsequence(level, companyName)}
        </span>
      </span>
    </p>
  );
}

function ConnectionRow({
  connection,
  policy,
  roles,
  onEdit,
  onDelete,
  onFinishSetup,
  isDeleting,
}: {
  connection: GitConnection;
  policy: AgentPolicy | undefined;
  roles: WorkExperienceResponse[];
  onEdit: (connection: GitConnection) => void;
  onDelete: (id: string) => void;
  onFinishSetup?: (connection: GitConnection) => void;
  isDeleting: boolean;
}) {
  const { t } = useTranslation();
  return (
    <li className={`anim-fade-up p-4 ${SURFACE_GLASS}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {connection.displayName}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE.accent}`}
            >
              {PROVIDER_LABELS[connection.provider]}
            </span>
            <span
              className={cx(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                // `mixed` reads as work here on purpose: it carries an
                // employer's exposure, so it must not look as harmless as a
                // personal source.
                connection.kind === "personal" ? BADGE.neutral : BADGE.info,
              )}
            >
              {KIND_LABELS[connection.kind]}
            </span>
            <span
              className={cx(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                connection.autoPostEnabled ? BADGE.success : BADGE.neutral,
              )}
            >
              {connection.autoPostEnabled
                ? t("settings.connections.autoPostingOn")
                : t("settings.connections.autoPostingOff")}
            </span>
          </div>

          <dl className="flex flex-wrap gap-x-5 gap-y-1 pt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            <div className="flex gap-1">
              <dt>{t("settings.connections.cadence")}</dt>
              <dd className="text-zinc-700 dark:text-zinc-300">
                {getCadenceLabels(t)[connection.cadence]}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>{t("settings.connections.lastDigest")}</dt>
              <dd className="text-zinc-700 dark:text-zinc-300">
                {formatLastDigest(connection.lastDigestAt)}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>{t("settings.connections.agentSummary")}</dt>
              <dd className="text-zinc-700 dark:text-zinc-300">
                {connection.includeAgentSummary
                  ? t("settings.connections.sent")
                  : t("settings.connections.notSent")}
              </dd>
            </div>
          </dl>

          {kindInheritsWorkRules(connection.kind) ? (
            <EffectiveDisclosure
              connection={connection}
              policy={policy}
              roles={roles}
            />
          ) : null}

          {connection.provider === "claude_code" ? (
            <ClaudeHookDisclosure />
          ) : null}
        </div>

        {/* `w-full` under sm: three buttons cannot shrink, and `shrink-0` on a
            flex item inside a 375px row pushed the whole page to ~397px. Full
            width lets them wrap inside the viewport; desktop keeps the old
            right-aligned column. */}
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
          {onFinishSetup ? (
            // Reopens the wizard at Verify for this connection — the recovery
            // path for a wizard closed halfway. Kept unconditional on purpose:
            // whether setup is "finished" is a fact only the health endpoint
            // knows, and the wizard is where that answer is shown.
            <Button
              type="button"
              variant="soft"
              size="sm"
              fullWidth={false}
              onClick={() => onFinishSetup(connection)}
            >
              <FiPlay className="h-4 w-4" aria-hidden="true" />
              {t("settings.connections.finishSetup")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            fullWidth={false}
            onClick={() => onEdit(connection)}
          >
            <FiEdit2 className="h-4 w-4" aria-hidden="true" />
            {t("common.edit")}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            fullWidth={false}
            isLoading={isDeleting}
            loadingLabel={t("settings.connections.disconnecting")}
            shouldHaveConfirmation
            confirmationTitle={t("settings.connections.disconnectTitle")}
            confirmationDescription={t("settings.connections.disconnectBody")}
            onClick={() => onDelete(connection.id)}
          >
            <FiTrash2 className="h-4 w-4" aria-hidden="true" />
            {t("settings.connections.disconnect")}
          </Button>
        </div>
      </div>
    </li>
  );
}

/**
 * Stand-in for a single `<ConnectionRow>` — same `<li>` chrome, same `p-4`, and
 * the same three stacked bands (name + badges, the metadata `<dl>`, the actions
 * column) so the list keeps its height when the query resolves.
 */
function ConnectionRowSkeleton() {
  return (
    <li className={`p-4 ${SURFACE_GLASS}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          {/* display name + provider / kind / auto-post badges */}
          <div className="flex h-6 flex-wrap items-center gap-2">
            <Skeleton shape="text" height={14} width={124} />
            <Skeleton shape="circle" height={20} width={58} />
            <Skeleton shape="circle" height={20} width={64} />
            <Skeleton shape="circle" height={20} width={96} />
          </div>

          {/* Cadence / Last digest / Agent summary */}
          <div className="pt-0.5">
            <div className="flex h-4 flex-wrap items-center gap-x-5">
              <Skeleton shape="text" height={11} width={104} />
              <Skeleton shape="text" height={11} width={128} />
              <Skeleton shape="text" height={11} width={116} />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <Skeleton height={36} width={80} className="rounded-md" />
          <Skeleton height={36} width={124} className="rounded-md" />
        </div>
      </div>
    </li>
  );
}

function ConnectionListSkeleton() {
  const { t } = useTranslation();
  return (
    <>
      <LoadingLabel>{t("settings.connections.loading")}</LoadingLabel>
      <ul className="mt-4 space-y-3">
        {Array.from({ length: 2 }, (_, index) => (
          <ConnectionRowSkeleton key={index} />
        ))}
      </ul>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Panel
 * ------------------------------------------------------------------ */

type ConnectionsPanelProps = {
  enabled?: boolean;
  /**
   * Renders the rows without the panel's own surface, header and Add button —
   * for embedding under the unified "Automatic posts" header on the settings
   * page, whose wizard is the create path.
   */
  embedded?: boolean;
  /** Routes the Add-source affordances somewhere else (the wizard). */
  onAddSource?: () => void;
  /** Adds a "Finish setup" action per row — reopens the wizard at Verify. */
  onFinishSetup?: (connection: GitConnection) => void;
  /**
   * Whether the auto-post wizard is currently open. The wizard stashes the
   * connection it creates, and promises this panel resurfaces the one-time
   * secret if it is closed mid-flight — which requires re-reading the stash on
   * close, not only at mount.
   */
  wizardOpen?: boolean;
};

export function ConnectionsPanel({
  enabled = true,
  embedded = false,
  onAddSource,
  onFinishSetup,
  wizardOpen = false,
}: ConnectionsPanelProps) {
  const { t } = useTranslation();
  const connectionsQuery = useMyConnections(enabled);
  const policyQuery = useAgentPolicy(enabled);
  const workExperiencesQuery = useWorkExperiencesForPolicy(enabled);
  const deleteConnection = useDeleteConnection();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GitConnection | null>(null);
  // Seeded from sessionStorage so navigating away and back does not strand the
  // user with a secret they can no longer read.
  const [lastCreated, setLastCreated] = useState<StashedConnection | null>(
    readStashedConnection,
  );

  // The mount-time seed above misses a connection created inside the wizard
  // during this visit; re-reading when the wizard closes keeps the promise
  // that closing it mid-flight loses nothing.
  useEffect(() => {
    if (wizardOpen) {
      return;
    }
    const stashed = readStashedConnection();
    if (stashed) {
      setLastCreated(stashed);
    }
  }, [wizardOpen]);

  const connections = connectionsQuery.data ?? [];
  const roles = workExperiencesQuery.data ?? [];

  const openCreate = () => {
    if (onAddSource) {
      onAddSource();
      return;
    }
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (connection: GitConnection) => {
    setEditing(connection);
    setDialogOpen(true);
  };

  const handleCreated = (result: CreateGitConnectionOutput) => {
    const stashed: StashedConnection = {
      connectionId: result.id,
      provider: result.provider,
      displayName: result.displayName,
      webhookSecret: result.webhookSecret,
    };
    setLastCreated(stashed);
    stashConnection(stashed);

    // The Add button sits in this panel's header, but the setup block renders
    // under it and above a potentially long list — scroll it into view so a
    // secret that is shown exactly once cannot be missed.
    window.requestAnimationFrame(() => {
      document
        .getElementById(CONNECTIONS_PANEL_ID)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleDismissSetup = () => {
    setLastCreated(null);
    clearStashedConnection();
  };

  const handleDelete = (id: string) => {
    deleteConnection.mutate(id);

    // The setup block belongs to a connection that no longer exists.
    if (lastCreated?.connectionId === id) {
      handleDismissSetup();
    }
  };

  const body = (
    <>
      {lastCreated ? (
        <NewConnectionSetup
          created={lastCreated}
          onDismiss={handleDismissSetup}
        />
      ) : null}

      {connectionsQuery.isLoading ? (
        <ConnectionListSkeleton />
      ) : connectionsQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {t("settings.connections.loadFailed")}
        </p>
      ) : connections.length === 0 ? (
        <div className={`anim-fade-up mt-4 p-10 text-center ${SURFACE_EMPTY}`}>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("settings.connections.empty")}
          </p>
          <Button
            type="button"
            variant="soft"
            fullWidth={false}
            className="mt-4 rounded-full"
            onClick={openCreate}
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" />
            {t("settings.connections.connectFirst")}
          </Button>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {connections.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              policy={policyQuery.data}
              roles={roles}
              onEdit={openEdit}
              onDelete={handleDelete}
              onFinishSetup={onFinishSetup}
              // Scoped to the row actually being removed — `isPending` alone is
              // mutation-wide and would spin every Disconnect button at once.
              isDeleting={
                deleteConnection.isPending &&
                deleteConnection.variables === connection.id
              }
            />
          ))}
        </ul>
      )}

      <ConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        connection={editing}
        onCreated={handleCreated}
      />
    </>
  );

  if (embedded) {
    return <div id={CONNECTIONS_PANEL_ID}>{body}</div>;
  }

  return (
    <section
      id={CONNECTIONS_PANEL_ID}
      className={`anim-fade-up p-5 sm:p-6 ${SURFACE_GLASS}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
            <FiActivity className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {t("settings.connections.sectionTitle")}
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t("settings.connections.sectionHelp")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          fullWidth={false}
          className="shrink-0 rounded-full"
          onClick={openCreate}
        >
          <FiPlus className="h-4 w-4" aria-hidden="true" />
          {t("settings.addSource")}
        </Button>
      </div>

      {body}
    </section>
  );
}
