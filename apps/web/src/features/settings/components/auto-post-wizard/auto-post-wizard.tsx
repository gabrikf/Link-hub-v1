import type {
  CreateApiTokenOutput,
  GitConnection,
  GitConnectionKind,
  GitConnectionProvider,
  Post,
  UpdateGitConnectionInput,
} from "@repo/schemas";
import axios from "axios";
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
} from "../new-connection-setup";
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
} from "./wizard-shared";
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
}: AutoPostWizardProps) {
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
  const [createdSettings, setCreatedSettings] = useState<{
    kind: GitConnectionKind;
    workExperienceId: string | null;
    displayName: string;
  } | null>(null);
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

  // The "Finish setup" path: land on Verify with the existing connection.
  useEffect(() => {
    if (!open || !resumeConnection) {
      return;
    }
    const resumedSource = sourceKeyForProvider(resumeConnection.provider);
    setSourceKey(resumedSource);
    if (resumedSource === "forge") {
      setForgeProvider(resumeConnection.provider as ForgeProvider);
    }
    setKind(resumeConnection.kind);
    setWorkExperienceId(resumeConnection.workExperienceId);
    setDisplayName(resumeConnection.displayName);
    setNameEdited(true);
    setCreated({
      connectionId: resumeConnection.id,
      provider: resumeConnection.provider,
      displayName: resumeConnection.displayName,
      // The secret was disclosed at creation time and is unrecoverable — the
      // resumed Connect step shows everything except it.
      webhookSecret: null,
    });
    setCreatedSettings({
      kind: resumeConnection.kind,
      workExperienceId: resumeConnection.workExperienceId,
      displayName: resumeConnection.displayName,
    });
    // The schedule UI has no Off option; remember the coercion so Finish does
    // not PATCH "weekly" onto a deliberately-off connection the user never
    // touched.
    setCadenceCoercedFromOff(resumeConnection.cadence === "off");
    setCadenceTouched(false);
    setCadence(
      resumeConnection.cadence === "off"
        ? "weekly"
        : (resumeConnection.cadence as WizardCadence),
    );
    setAutoPostEnabled(resumeConnection.autoPostEnabled);
    setIncludeAgentSummary(resumeConnection.includeAgentSummary);
    setStep("verify");
  }, [open, resumeConnection]);

  const isMcp = sourceKey === "mcp";
  const effectiveProvider: GitConnectionProvider | null =
    sourceKey === null || isMcp
      ? null
      : sourceKey === "forge"
        ? forgeProvider
        : sourceKey;
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

  const handleKindChange = (nextKind: GitConnectionKind) => {
    setKind(nextKind);
    // The prefill follows the personal/work choice until the user has typed a
    // name of their own — "Personal" prefilling "Work laptop — …" reads as the
    // wizard ignoring the click.
    if (!nameEdited && sourceKey) {
      prefillName(sourceKey, nextKind);
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
    const effectiveWorkExperienceId =
      kind === "personal" ? null : workExperienceId;

    // Back-then-Next must not mint a second connection: reuse the one already
    // created for this provider — but PATCH any settings edited on the way
    // back. Silently keeping the old kind/employer would misclassify work as
    // personal (or vice versa), which is the disclosure policy's whole job.
    if (created && created.provider === effectiveProvider) {
      const patch: UpdateGitConnectionInput = {};
      if (createdSettings) {
        if (kind !== createdSettings.kind) {
          patch.kind = kind;
        }
        if (effectiveWorkExperienceId !== createdSettings.workExperienceId) {
          patch.workExperienceId = effectiveWorkExperienceId;
        }
        if (trimmedName !== createdSettings.displayName) {
          patch.displayName = trimmedName;
        }
      }
      if (Object.keys(patch).length > 0) {
        try {
          await updateConnection.mutateAsync({
            connectionId: created.connectionId,
            patch,
          });
          setCreatedSettings({
            kind,
            workExperienceId: effectiveWorkExperienceId,
            displayName: trimmedName,
          });
          const renamed = { ...created, displayName: trimmedName };
          setCreated(renamed);
          stashConnection(renamed);
        } catch (error) {
          reportError(error, {
            action: "settings.wizard-update-connection",
            extra: { kind },
          });
          setCreateError(t("wizard.updateSourceFailed"));
          return;
        }
      }
      setStep("connect");
      return;
    }

    try {
      // A provider switch after a create leaves an abandoned connection
      // behind; delete it rather than orphaning it, and drop its stashed
      // one-time secret so the panel cannot resurface a dead connection.
      if (created) {
        await deleteConnection.mutateAsync(created.connectionId);
        clearStashedConnection();
        setCreated(null);
        setCreatedSettings(null);
      }

      const result = await createConnection.mutateAsync({
        provider: effectiveProvider as GitConnectionProvider,
        kind,
        displayName: trimmedName,
        workExperienceId: effectiveWorkExperienceId,
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
      setCreatedSettings({
        kind,
        workExperienceId: effectiveWorkExperienceId,
        displayName: trimmedName,
      });
      // Session-scoped recovery: if the wizard is closed mid-way, the
      // connections panel resurfaces the one-time secret from this stash.
      stashConnection(stashed);
      setStep("connect");
    } catch (error) {
      reportError(error, {
        action: "settings.wizard-create-connection",
        extra: { provider: effectiveProvider ?? null, kind },
      });

      if (
        axios.isAxiosError(error) &&
        error.response?.status === 409 &&
        effectiveProvider
      ) {
        setCreateError(
          t("wizard.duplicateSource", {
            providerLabel: PROVIDER_LABELS[effectiveProvider],
            kindLabel: KIND_LABELS[kind],
          }),
        );
        return;
      }
      setCreateError(t("settings.connectionDialog.connectFailed"));
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

  const tokenNameHint = isMcp
    ? t("wizard.namePreset.codingAgent")
    : sourceKey === "extractor"
      ? t("wizard.token.nameHintExtractor", {
          displayName: displayName.trim() || t("wizard.namePreset.workLaptop"),
        })
      : t("wizard.token.nameHintUploads", {
          displayName: displayName.trim() || t("wizard.namePreset.workLaptop"),
        });

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
            onClick={handleSourceNext}
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
            onClick={handleFinish}
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

  const checklist: Array<{ label: string; done: boolean }> = [
    { label: t("wizard.stepSourceConnected"), done: isMcp || created !== null },
    { label: t("wizard.stepFirstData"), done: verified },
    { label: t("wizard.stepPreviewSeen"), done: Boolean(previewSeen) },
    isMcp
      ? {
          label: t("wizard.stepWeeklyRhythm"),
          done: false,
        }
      : { label: t("wizard.stepScheduleSet"), done: scheduleSaved },
  ];

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
              {createError ? (
                <FeedbackMessage tone="error" message={createError} />
              ) : null}
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
            isMcp ? (
              <McpVerifyBody detectedPost={detectedPost} />
            ) : (
              <ConnectionVerifyBody
                sourceKey={sourceKey as Exclude<WizardSourceKey, "mcp">}
                health={healthQuery.data}
                isError={healthQuery.isError}
              />
            )
          ) : null}

          {step === "preview" ? (
            isMcp ? (
              <McpPreviewBody detectedPost={detectedPost} />
            ) : (
              <ConnectionPreviewBody
                preview={previewQuery.data}
                isLoading={previewQuery.isLoading}
                isError={previewQuery.isError}
              />
            )
          ) : null}

          {step === "schedule" ? (
            <div className="space-y-3">
              {isMcp ? (
                <McpScheduleBody
                  cadence={cadence}
                  onCadenceChange={(value) => {
                    setCadence(value);
                    setCadenceTouched(true);
                  }}
                  toolKey={toolKey}
                />
              ) : (
                <ScheduleStepBody
                  cadence={cadence}
                  onCadenceChange={(value) => {
                    setCadence(value);
                    setCadenceTouched(true);
                  }}
                  autoPostEnabled={autoPostEnabled}
                  onAutoPostChange={setAutoPostEnabled}
                  showAgentSummaryToggle={created?.provider === "claude_code"}
                  includeAgentSummary={includeAgentSummary}
                  onIncludeAgentSummaryChange={setIncludeAgentSummary}
                />
              )}
              {saveError ? (
                <FeedbackMessage tone="error" message={saveError} />
              ) : null}
            </div>
          ) : null}

          {step === "done" ? (
            <div className="anim-scale-in space-y-3">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {isMcp
                  ? t("wizard.agentWiredUp")
                  : t("wizard.displayNameConnected", {
                      displayName:
                        created?.displayName ?? t("wizard.yourSource"),
                    })}
              </p>
              <ul className="space-y-1.5">
                {checklist.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center gap-2 text-sm"
                  >
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
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          {footer}
        </div>
      </div>
    </Dialog>
  );
}
