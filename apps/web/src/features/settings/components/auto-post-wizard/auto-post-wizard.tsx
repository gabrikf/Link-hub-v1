import type {
  CreateApiTokenOutput,
  DigestPreview,
  GitConnection,
  GitConnectionHealth,
  GitConnectionKind,
  GitConnectionProvider,
  Post,
  UpdateGitConnectionInput,
} from "@repo/schemas";
import axios from "axios";
import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiCheckCircle, FiCircle, FiPlus } from "react-icons/fi";
import { useMyPosts } from "../../../../lib/post-queries";
import { reportError } from "../../../../lib/report-error";
import { Button } from "../../../../shared-components/button";
import { Dialog } from "../../../../shared-components/dialog";
import { FeedbackMessage } from "../../../../shared-components/feedback-message";
import { useWorkExperiencesForPolicy } from "../../lib/agent-policy-queries";
import { KIND_LABELS, PROVIDER_LABELS } from "../../lib/connection-format";
import {
  useConnectionHealth,
  useCreateConnection,
  useDeleteConnection,
  useDigestPreview,
  useUpdateConnection,
} from "../../lib/connection-queries";
import {
  clearStashedConnection,
  stashConnection,
  type StashedConnection,
} from "../../lib/connection-stash";
import { ConnectStep } from "./connect-step";
import { ConnectionPreviewBody, McpPreviewBody } from "./preview-step";
import {
  McpScheduleBody,
  ScheduleStepBody,
  type WizardCadence,
} from "./schedule-step";
import { SourceStep } from "./source-step";
import { ConnectionVerifyBody, McpVerifyBody } from "./verify-step";
import {
  defaultLocalDisplayName,
  getDefaultForgeDisplayNames,
  type ForgeProvider,
  type WizardSourceKey,
  type WizardStepKey,
} from "./wizard-vocabulary";
import { WizardStepper } from "./wizard-stepper";

/** How often the verify step asks "did anything arrive yet?". */
const VERIFY_POLL_MS = 5_000;

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

function sourceKeyForProvider(
  provider: GitConnectionProvider,
): WizardSourceKey {
  if (provider === "github" || provider === "gitlab") {
    return "forge";
  }
  return provider;
}

/**
 * The provider a connection would be created for. MCP creates none, and the
 * forge card carries its own github/gitlab sub-choice.
 */
function resolveEffectiveProvider(
  sourceKey: WizardSourceKey | null,
  forgeProvider: ForgeProvider,
): GitConnectionProvider | null {
  if (sourceKey === null || sourceKey === "mcp") {
    return null;
  }
  return sourceKey === "forge" ? forgeProvider : sourceKey;
}

/** The token name the Connect step suggests, per source. */
function getTokenNameHint(
  t: TFunction,
  sourceKey: WizardSourceKey | null,
  displayName: string,
): string {
  if (sourceKey === "mcp") {
    return t("wizard.namePreset.codingAgent");
  }
  const name = displayName.trim() || t("wizard.namePreset.workLaptop");
  return sourceKey === "extractor"
    ? t("wizard.token.nameHintExtractor", { displayName: name })
    : t("wizard.token.nameHintUploads", { displayName: name });
}

type ChecklistItem = { label: string; done: boolean };

/** The Done step's recap of what this run actually achieved. */
function buildChecklist(
  t: TFunction,
  progress: {
    isMcp: boolean;
    hasConnection: boolean;
    verified: boolean;
    previewSeen: boolean;
    scheduleSaved: boolean;
  },
): ChecklistItem[] {
  return [
    {
      label: t("wizard.stepSourceConnected"),
      done: progress.isMcp || progress.hasConnection,
    },
    { label: t("wizard.stepFirstData"), done: progress.verified },
    { label: t("wizard.stepPreviewSeen"), done: progress.previewSeen },
    progress.isMcp
      ? { label: t("wizard.stepWeeklyRhythm"), done: false }
      : { label: t("wizard.stepScheduleSet"), done: progress.scheduleSaved },
  ];
}

/** The settings a connection was created — or last patched — with. */
type ConnectionSettings = {
  kind: GitConnectionKind;
  workExperienceId: string | null;
  displayName: string;
};

/**
 * What actually changed between the settings the connection carries and the
 * ones the form now holds. An empty patch means the reuse path can skip the
 * PATCH entirely.
 */
function diffConnectionSettings(
  previous: ConnectionSettings | null,
  next: ConnectionSettings,
): UpdateGitConnectionInput {
  const patch: UpdateGitConnectionInput = {};
  if (!previous) {
    return patch;
  }
  if (next.kind !== previous.kind) {
    patch.kind = next.kind;
  }
  if (next.workExperienceId !== previous.workExperienceId) {
    patch.workExperienceId = next.workExperienceId;
  }
  if (next.displayName !== previous.displayName) {
    patch.displayName = next.displayName;
  }
  return patch;
}

/**
 * Seeds wizard state from the connection the "Finish setup" path resumes into,
 * once per connection. Done during render rather than from an effect so the
 * seeded step is already there in the first commit instead of the Source step
 * painting for a frame first — see
 * https://react.dev/learn/you-might-not-need-an-effect.
 *
 * `resumeTarget` is null whenever there is nothing to resume (including while
 * the wizard is closed), so closing and reopening on the same connection seeds
 * again, exactly as reopening should.
 */
function useResumedConnection(
  resumeTarget: GitConnection | null,
  seed: (connection: GitConnection) => void,
) {
  const [seeded, setSeeded] = useState<GitConnection | null>(null);
  if (seeded !== resumeTarget) {
    setSeeded(resumeTarget);
    if (resumeTarget) {
      seed(resumeTarget);
    }
  }
}

/** A step-level failure, rendered only when there is one. */
function ErrorNote({ message }: Readonly<{ message: string | null }>) {
  return message ? <FeedbackMessage tone="error" message={message} /> : null;
}

/** The Verify step body: MCP watches your posts, everything else its health. */
function VerifyBody({
  sourceKey,
  detectedPost,
  health,
  isHealthError,
}: Readonly<{
  sourceKey: WizardSourceKey;
  detectedPost: Post | null;
  health: GitConnectionHealth | undefined;
  isHealthError: boolean;
}>) {
  if (sourceKey === "mcp") {
    return <McpVerifyBody detectedPost={detectedPost} />;
  }
  return (
    <ConnectionVerifyBody
      sourceKey={sourceKey}
      health={health}
      isError={isHealthError}
    />
  );
}

/** The Preview step body: the agent's own post, or the digest we would send. */
function PreviewBody({
  isMcp,
  detectedPost,
  preview,
  isPreviewLoading,
  isPreviewError,
}: Readonly<{
  isMcp: boolean;
  detectedPost: Post | null;
  preview: DigestPreview | undefined;
  isPreviewLoading: boolean;
  isPreviewError: boolean;
}>) {
  if (isMcp) {
    return <McpPreviewBody detectedPost={detectedPost} />;
  }
  return (
    <ConnectionPreviewBody
      preview={preview}
      isLoading={isPreviewLoading}
      isError={isPreviewError}
    />
  );
}

/** The Schedule step body, plus whatever the save failed with. */
function ScheduleBody({
  isMcp,
  cadence,
  onCadenceChange,
  toolKey,
  autoPostEnabled,
  onAutoPostChange,
  showAgentSummaryToggle,
  includeAgentSummary,
  onIncludeAgentSummaryChange,
  saveError,
}: Readonly<{
  isMcp: boolean;
  cadence: WizardCadence;
  onCadenceChange: (cadence: WizardCadence) => void;
  toolKey: string | null;
  autoPostEnabled: boolean;
  onAutoPostChange: (enabled: boolean) => void;
  showAgentSummaryToggle: boolean;
  includeAgentSummary: boolean;
  onIncludeAgentSummaryChange: (include: boolean) => void;
  saveError: string | null;
}>) {
  return (
    <div className="space-y-3">
      {isMcp ? (
        <McpScheduleBody
          cadence={cadence}
          onCadenceChange={onCadenceChange}
          toolKey={toolKey}
        />
      ) : (
        <ScheduleStepBody
          cadence={cadence}
          onCadenceChange={onCadenceChange}
          autoPostEnabled={autoPostEnabled}
          onAutoPostChange={onAutoPostChange}
          showAgentSummaryToggle={showAgentSummaryToggle}
          includeAgentSummary={includeAgentSummary}
          onIncludeAgentSummaryChange={onIncludeAgentSummaryChange}
        />
      )}
      <ErrorNote message={saveError} />
    </div>
  );
}

/** The Done step body: what this run achieved, item by item. */
function DoneBody({
  isMcp,
  connectedName,
  checklist,
  verified,
}: Readonly<{
  isMcp: boolean;
  connectedName: string | null;
  checklist: ChecklistItem[];
  verified: boolean;
}>) {
  const { t } = useTranslation();
  return (
    <div className="anim-scale-in space-y-3">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {isMcp
          ? t("wizard.agentWiredUp")
          : t("wizard.displayNameConnected", {
              displayName: connectedName ?? t("wizard.yourSource"),
            })}
      </p>
      <ul className="space-y-1.5">
        {checklist.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            {item.done ? (
              <FiCheckCircle
                className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            ) : (
              <FiCircle
                className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600"
                aria-hidden="true"
              />
            )}
            <span
              className={cx(
                item.done
                  ? "text-zinc-800 dark:text-zinc-200"
                  : "text-zinc-500 dark:text-zinc-400",
              )}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      {!verified ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t("wizard.noDataYetFine")}
        </p>
      ) : null}
    </div>
  );
}

type AutoPostWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Reopens the wizard at Verify for an existing connection — the "Finish
   * setup" path. Nothing is stored server-side about wizard progress; the
   * connection plus its health endpoint carry all the state that matters.
   */
  resumeConnection?: GitConnection | null;
};

export function AutoPostWizard({
  open,
  onOpenChange,
  resumeConnection = null,
}: Readonly<AutoPostWizardProps>) {
  const { t } = useTranslation();
  const [step, setStep] = useState<WizardStepKey | "done">("source");
  const [sourceKey, setSourceKey] = useState<WizardSourceKey | null>(null);
  const [forgeProvider, setForgeProvider] = useState<ForgeProvider>("github");
  const [kind, setKind] = useState<GitConnectionKind>("personal");
  const [workExperienceId, setWorkExperienceId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** The connection this run created (or resumed into). */
  const [created, setCreated] = useState<StashedConnection | null>(null);
  /**
   * The settings the connection was created (or last patched) with. The
   * Back-then-Next reuse path diffs against this: reusing the connection while
   * silently keeping a kind or employer the user went Back to change would be
   * a privacy bug, not a convenience.
   */
  const [createdSettings, setCreatedSettings] =
    useState<ConnectionSettings | null>(null);
  const [token, setToken] = useState<CreateApiTokenOutput | null>(null);
  /**
   * MCP only: which Connect-step tool tab the user picked, so the Schedule
   * step opens on that tool's automation guidance instead of asking again.
   */
  const [toolKey, setToolKey] = useState<string | null>(null);
  const [detectedPost, setDetectedPost] = useState<Post | null>(null);
  const [cadence, setCadence] = useState<WizardCadence>("weekly");
  const [cadenceTouched, setCadenceTouched] = useState(false);
  /**
   * True when a resumed connection's cadence is "off": the schedule UI has no
   * Off option, so it displays "weekly" — and Finish must not PATCH that
   * coercion back unless the user actually picked a cadence.
   */
  const [cadenceCoercedFromOff, setCadenceCoercedFromOff] = useState(false);
  const [autoPostEnabled, setAutoPostEnabled] = useState(false);
  const [includeAgentSummary, setIncludeAgentSummary] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnection();
  const deleteConnection = useDeleteConnection();
  const rolesQuery = useWorkExperiencesForPolicy(open);

  /**
   * MCP verify baseline: the post ids present in the FIRST snapshot after
   * entering Verify. Success is a post whose id is not in this set — never a
   * wall-clock comparison, which client/server skew silently breaks.
   */
  const baselineIdsRef = useRef<Set<string> | null>(null);
  /** The deferred close-reset (see `resetAndClose`), cancellable. */
  const closeTimeoutRef = useRef<number | null>(null);
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      baselineIdsRef.current = null;
      // Reopening cancels a still-pending close-reset so it cannot wipe the
      // fresh run's state from under it.
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    },
    [],
  );

  /**
   * The "Finish setup" path: land on Verify with the existing connection.
   *
   * Seeded during render rather than from an effect, so Verify and the resumed
   * connection land in the same commit instead of the Source step painting for
   * a frame first. `seededResume` tracks the exact (open, connection) pair the
   * seeding was done for, which keeps the original trigger: re-seed whenever
   * either changes, and never otherwise.
   */
  const seedFromResumedConnection = (connection: GitConnection) => {
    const resumedSource = sourceKeyForProvider(connection.provider);
    setSourceKey(resumedSource);
    if (resumedSource === "forge") {
      setForgeProvider(connection.provider as ForgeProvider);
    }
    setKind(connection.kind);
    setWorkExperienceId(connection.workExperienceId);
    setDisplayName(connection.displayName);
    setNameEdited(true);
    setCreated({
      connectionId: connection.id,
      provider: connection.provider,
      displayName: connection.displayName,
      // The secret was disclosed at creation time and is unrecoverable — the
      // resumed Connect step shows everything except it.
      webhookSecret: null,
    });
    setCreatedSettings({
      kind: connection.kind,
      workExperienceId: connection.workExperienceId,
      displayName: connection.displayName,
    });
    // The schedule UI has no Off option; remember the coercion so Finish does
    // not PATCH "weekly" onto a deliberately-off connection the user never
    // touched.
    setCadenceCoercedFromOff(connection.cadence === "off");
    setCadenceTouched(false);
    setCadence(
      connection.cadence === "off"
        ? "weekly"
        : (connection.cadence as WizardCadence),
    );
    setAutoPostEnabled(connection.autoPostEnabled);
    setIncludeAgentSummary(connection.includeAgentSummary);
    setStep("verify");
  };

  useResumedConnection(
    open ? resumeConnection : null,
    seedFromResumedConnection,
  );

  const isMcp = sourceKey === "mcp";
  const effectiveProvider = resolveEffectiveProvider(sourceKey, forgeProvider);
  const connectionId = created?.connectionId ?? null;

  /* ------------------------------------------------------------------ *
   * Verify + preview data
   * ------------------------------------------------------------------ */

  const healthQuery = useConnectionHealth(connectionId, {
    enabled: open && step === "verify" && !isMcp,
    refetchInterval: VERIFY_POLL_MS,
  });
  const firstDataReceived = (healthQuery.data?.totalEvents ?? 0) > 0;

  // MCP verify: watch the user's own posts for one the agent just created.
  const postsQuery = useMyPosts(open && step === "verify" && isMcp, {
    refetchInterval: VERIFY_POLL_MS,
  });
  useEffect(() => {
    if (!isMcp || step !== "verify" || detectedPost) {
      return;
    }
    const posts = postsQuery.data;
    if (!posts) {
      return;
    }
    // First snapshot after entering Verify is the baseline; a post counts as
    // "your agent just did it" only if its id was not in it. Ids, not
    // timestamps: comparing server createdAt against the client clock breaks
    // detection under ordinary clock skew.
    if (baselineIdsRef.current === null) {
      baselineIdsRef.current = new Set(posts.map((post) => post.id));
      return;
    }
    const baseline = baselineIdsRef.current;
    const candidate = posts.find(
      (post) =>
        (post.source === "mcp" ||
          post.source === "commit" ||
          post.source === "agent") &&
        !baseline.has(post.id),
    );
    if (candidate) {
      setDetectedPost(candidate);
    }
  }, [isMcp, step, detectedPost, postsQuery.data]);

  const previewQuery = useDigestPreview(connectionId, {
    enabled: open && step === "preview" && !isMcp,
  });

  /* ------------------------------------------------------------------ *
   * Navigation
   * ------------------------------------------------------------------ */

  const resetState = () => {
    setStep("source");
    setSourceKey(null);
    setForgeProvider("github");
    setKind("personal");
    setWorkExperienceId(null);
    setDisplayName("");
    setNameEdited(false);
    setNameError(null);
    setCreateError(null);
    setSaveError(null);
    setCreated(null);
    setCreatedSettings(null);
    setToken(null);
    setToolKey(null);
    setDetectedPost(null);
    setCadence("weekly");
    setCadenceTouched(false);
    setCadenceCoercedFromOff(false);
    setAutoPostEnabled(false);
    setIncludeAgentSummary(false);
    setScheduleSaved(false);
    baselineIdsRef.current = null;
    createConnection.reset();
    updateConnection.reset();
  };

  const resetAndClose = () => {
    onOpenChange(false);
    // Defer reset so the closing animation doesn't flash empty content. The
    // id is kept so reopening (or unmounting) can cancel it — an uncancelled
    // timer would wipe a freshly reopened run's state mid-flight.
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      resetState();
    }, 200);
  };

  const prefillName = (key: WizardSourceKey, nextKind: GitConnectionKind) => {
    if (key === "mcp") {
      return;
    }
    setDisplayName(
      key === "forge"
        ? getDefaultForgeDisplayNames(t)[forgeProvider]
        : defaultLocalDisplayName(key, nextKind, t),
    );
  };

  const handleSelectSource = (key: WizardSourceKey) => {
    setSourceKey(key);
    setNameError(null);
    if (!nameEdited) {
      prefillName(key, kind);
    }
  };

  const handleForgeProviderChange = (provider: ForgeProvider) => {
    setForgeProvider(provider);
    if (!nameEdited) {
      setDisplayName(getDefaultForgeDisplayNames(t)[provider]);
    }
  };

  const handleCadenceChange = (value: WizardCadence) => {
    setCadence(value);
    setCadenceTouched(true);
  };

  const handleKindChange = (nextKind: GitConnectionKind) => {
    setKind(nextKind);
    // The prefill follows the personal/work choice until the user has typed a
    // name of their own — "Personal" prefilling "Work laptop — …" reads as the
    // wizard ignoring the click.
    if (!nameEdited && sourceKey) {
      prefillName(sourceKey, nextKind);
    }
  };

  /**
   * Reuses the connection already created for this provider, PATCHing any
   * settings edited on the way back. Silently keeping the old kind or employer
   * would misclassify work as personal (or vice versa), which is the
   * disclosure policy's whole job. `false` means the step must not advance.
   */
  const reuseCreatedConnection = async (
    connection: StashedConnection,
    next: ConnectionSettings,
  ): Promise<boolean> => {
    const patch = diffConnectionSettings(createdSettings, next);
    if (Object.keys(patch).length === 0) {
      return true;
    }
    try {
      await updateConnection.mutateAsync({
        connectionId: connection.connectionId,
        patch,
      });
      setCreatedSettings(next);
      const renamed = { ...connection, displayName: next.displayName };
      setCreated(renamed);
      stashConnection(renamed);
      return true;
    } catch (error) {
      reportError(error, {
        action: "settings.wizard-update-connection",
        extra: { kind: next.kind },
      });
      setCreateError(t("wizard.updateSourceFailed"));
      return false;
    }
  };

  /**
   * Mints the connection for the picked provider. A provider switch after a
   * create leaves an abandoned connection behind; delete it rather than
   * orphaning it, and drop its stashed one-time secret so the panel cannot
   * resurface a dead connection. `false` means the step must not advance.
   */
  const createFreshConnection = async (
    next: ConnectionSettings,
  ): Promise<boolean> => {
    try {
      if (created) {
        await deleteConnection.mutateAsync(created.connectionId);
        clearStashedConnection();
        setCreated(null);
        setCreatedSettings(null);
      }

      const result = await createConnection.mutateAsync({
        provider: effectiveProvider as GitConnectionProvider,
        kind: next.kind,
        displayName: next.displayName,
        workExperienceId: next.workExperienceId,
        autoPostEnabled: false,
        cadence: "weekly",
        includeAgentSummary: false,
      });
      const stashed: StashedConnection = {
        connectionId: result.id,
        provider: result.provider,
        displayName: result.displayName,
        webhookSecret: result.webhookSecret,
      };
      setCreated(stashed);
      setCreatedSettings(next);
      // Session-scoped recovery: if the wizard is closed mid-way, the
      // connections panel resurfaces the one-time secret from this stash.
      stashConnection(stashed);
      return true;
    } catch (error) {
      reportError(error, {
        action: "settings.wizard-create-connection",
        extra: { provider: effectiveProvider ?? null, kind: next.kind },
      });

      if (
        axios.isAxiosError(error) &&
        error.response?.status === 409 &&
        effectiveProvider
      ) {
        setCreateError(
          t("wizard.duplicateSource", {
            providerLabel: PROVIDER_LABELS[effectiveProvider],
            kindLabel: KIND_LABELS[next.kind],
          }),
        );
        return false;
      }
      setCreateError(t("settings.connectionDialog.connectFailed"));
      return false;
    }
  };

  const handleSourceNext = async () => {
    if (sourceKey === null) {
      return;
    }
    setCreateError(null);

    if (isMcp) {
      setStep("connect");
      return;
    }

    const trimmedName = displayName.trim();
    if (trimmedName.length === 0) {
      setNameError(t("settings.connectionDialog.nameHelp"));
      return;
    }

    // Only a personal source has no employer to attach. `mixed` does — it is
    // held to that employer's rules exactly like a work source is.
    const next: ConnectionSettings = {
      kind,
      workExperienceId: kind === "personal" ? null : workExperienceId,
      displayName: trimmedName,
    };

    // Back-then-Next must not mint a second connection: reuse the one already
    // created for this provider.
    const advanced =
      created && created.provider === effectiveProvider
        ? await reuseCreatedConnection(created, next)
        : await createFreshConnection(next);

    if (advanced) {
      setStep("connect");
    }
  };

  const handleFinish = async () => {
    if (isMcp || connectionId === null) {
      setStep("done");
      return;
    }
    setSaveError(null);
    try {
      await updateConnection.mutateAsync({
        connectionId,
        patch: {
          // A resumed "off" connection shows "weekly" only because the UI has
          // no Off option; an untouched control must not PATCH that coercion
          // onto a cadence the user deliberately turned off.
          ...(cadenceCoercedFromOff && !cadenceTouched ? {} : { cadence }),
          autoPostEnabled,
          ...(created?.provider === "claude_code"
            ? { includeAgentSummary }
            : {}),
        },
      });
      setScheduleSaved(true);
      setStep("done");
    } catch (error) {
      reportError(error, {
        action: "settings.wizard-save-schedule",
        extra: { cadence, autoPostEnabled },
      });
      setSaveError(t("wizard.scheduleSaveFailed"));
    }
  };

  const verified = isMcp ? detectedPost !== null : firstDataReceived;
  const previewSeen = isMcp
    ? detectedPost !== null
    : previewQuery.data?.status === "ready";

  const tokenNameHint = getTokenNameHint(t, sourceKey, displayName);

  /* ------------------------------------------------------------------ *
   * Footer buttons per step
   * ------------------------------------------------------------------ */

  const footer = (() => {
    if (step === "source") {
      return (
        <>
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            onClick={resetAndClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            fullWidth={false}
            disabled={sourceKey === null}
            // Next may also PATCH edits into a reused connection or delete an
            // abandoned one before creating — all of it is "connecting".
            isLoading={
              createConnection.isPending ||
              updateConnection.isPending ||
              deleteConnection.isPending
            }
            loadingLabel={t("common.connecting")}
            onClick={() => {
              void handleSourceNext();
            }}
          >
            {t("common.next")}
          </Button>
        </>
      );
    }
    if (step === "connect") {
      return (
        <>
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            onClick={() => setStep("source")}
          >
            {t("common.back")}
          </Button>
          <Button
            type="button"
            fullWidth={false}
            onClick={() => setStep("verify")}
          >
            {t("common.next")}
          </Button>
        </>
      );
    }
    if (step === "verify") {
      return (
        <>
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            onClick={() => setStep("connect")}
          >
            {t("common.back")}
          </Button>
          {verified ? (
            <Button
              type="button"
              fullWidth={false}
              onClick={() => setStep("preview")}
            >
              {t("common.continue")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              fullWidth={false}
              onClick={() => setStep("preview")}
            >
              {t("resumeImport.skipForNow")}
            </Button>
          )}
        </>
      );
    }
    if (step === "preview") {
      return (
        <>
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            onClick={() => setStep("verify")}
          >
            {t("common.back")}
          </Button>
          <Button
            type="button"
            fullWidth={false}
            onClick={() => setStep("schedule")}
          >
            {t("common.next")}
          </Button>
        </>
      );
    }
    if (step === "schedule") {
      return (
        <>
          <Button
            type="button"
            variant="outline"
            fullWidth={false}
            onClick={() => setStep("preview")}
          >
            {t("common.back")}
          </Button>
          <Button
            type="button"
            fullWidth={false}
            isLoading={updateConnection.isPending}
            loadingLabel={t("common.saving")}
            onClick={() => {
              void handleFinish();
            }}
          >
            {t("common.finish")}
          </Button>
        </>
      );
    }
    // done
    return (
      <>
        <Button
          type="button"
          variant="outline"
          fullWidth={false}
          onClick={resetState}
        >
          <FiPlus className="h-4 w-4" aria-hidden="true" />
          {t("wizard.addAnotherSource")}
        </Button>
        <Button type="button" fullWidth={false} onClick={resetAndClose}>
          {t("common.done")}
        </Button>
      </>
    );
  })();

  /* ------------------------------------------------------------------ *
   * Done checklist
   * ------------------------------------------------------------------ */

  const checklist = buildChecklist(t, {
    isMcp,
    hasConnection: created !== null,
    verified,
    previewSeen: Boolean(previewSeen),
    scheduleSaved,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          resetAndClose();
        } else {
          onOpenChange(true);
        }
      }}
      title={t("wizard.title")}
      description={t("wizard.subtitle")}
      contentClassName="max-w-2xl"
    >
      <div className="space-y-4">
        <WizardStepper
          current={step === "done" ? "schedule" : step}
          done={step === "done"}
        />

        {/* Keyed by step so each body replays its entrance. */}
        <div key={step} className="anim-fade-up">
          {step === "source" ? (
            <div className="space-y-3">
              <SourceStep
                sourceKey={sourceKey}
                onSelectSource={handleSelectSource}
                forgeProvider={forgeProvider}
                onForgeProviderChange={handleForgeProviderChange}
                kind={kind}
                onKindChange={handleKindChange}
                workExperienceId={workExperienceId}
                onWorkExperienceChange={setWorkExperienceId}
                roles={rolesQuery.data ?? []}
                displayName={displayName}
                onDisplayNameChange={(value) => {
                  setDisplayName(value);
                  setNameEdited(true);
                  setNameError(null);
                }}
                displayNameError={nameError}
              />
              <ErrorNote message={createError} />
            </div>
          ) : null}

          {step === "connect" && sourceKey ? (
            <ConnectStep
              sourceKey={sourceKey}
              created={created}
              token={token}
              onTokenCreated={setToken}
              tokenNameHint={tokenNameHint}
              toolKey={toolKey}
              onToolKeyChange={setToolKey}
            />
          ) : null}

          {step === "verify" && sourceKey ? (
            <VerifyBody
              sourceKey={sourceKey}
              detectedPost={detectedPost}
              health={healthQuery.data}
              isHealthError={healthQuery.isError}
            />
          ) : null}

          {step === "preview" ? (
            <PreviewBody
              isMcp={isMcp}
              detectedPost={detectedPost}
              preview={previewQuery.data}
              isPreviewLoading={previewQuery.isLoading}
              isPreviewError={previewQuery.isError}
            />
          ) : null}

          {step === "schedule" ? (
            <ScheduleBody
              isMcp={isMcp}
              cadence={cadence}
              onCadenceChange={handleCadenceChange}
              toolKey={toolKey}
              autoPostEnabled={autoPostEnabled}
              onAutoPostChange={setAutoPostEnabled}
              showAgentSummaryToggle={created?.provider === "claude_code"}
              includeAgentSummary={includeAgentSummary}
              onIncludeAgentSummaryChange={setIncludeAgentSummary}
              saveError={saveError}
            />
          ) : null}

          {step === "done" ? (
            <DoneBody
              isMcp={isMcp}
              connectedName={created?.displayName ?? null}
              checklist={checklist}
              verified={verified}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          {footer}
        </div>
      </div>
    </Dialog>
  );
}
