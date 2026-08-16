import {
  AGENT_DISCLOSURE_LEVELS,
  DEFAULT_DIGEST_CADENCE,
  type AgentDisclosureLevel,
  type AgentPolicy,
  type DigestCadence,
  type GitConnection,
  type GitConnectionKind,
  type GitConnectionProvider,
  type WorkExperienceResponse,
} from "@repo/schemas";
import * as RadixDialog from "@radix-ui/react-dialog";
import { useState, type ReactNode } from "react";
import { FiAlertTriangle, FiShield } from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { Input } from "../../../shared-components/input";
import { FOCUS_RING, SURFACE_INSET } from "../../../shared-components/surface";
import {
  useAgentPolicy,
  useWorkExperiencesForPolicy,
} from "../lib/agent-policy-queries";
import {
  CADENCE_LABELS,
  CADENCE_OPTIONS,
  disclosureConsequence,
  disclosureLevelLabel,
  disclosureSourceLabel,
  kindInheritsWorkRules,
  MIXED_KIND_RULE,
  PROVIDER_DESCRIPTIONS,
  PROVIDER_LABELS,
  resolveEffectiveDisclosure,
} from "../lib/connection-format";
import type { CreateGitConnectionOutput } from "../lib/connection-queries";
import {
  useCreateConnection,
  useUpdateConnection,
} from "../lib/connection-queries";

const INHERIT = "inherit";
const NO_ROLE = "none";

const PROVIDER_OPTIONS: GitConnectionProvider[] = [
  "github",
  "gitlab",
  "claude_code",
  "extractor",
];

const NAME_FIELD_ID = "connection-name";

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

type FieldSelectProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  helperText?: string;
  disabled?: boolean;
};

/**
 * A native `<select>` styled exactly like the per-employer picker in
 * `disclosure-panel.tsx`. The shared `SelectField` is a react-select bound to a
 * react-hook-form `Control`, which this form does not use.
 */
function FieldSelect({
  id,
  label,
  value,
  onChange,
  children,
  helperText,
  disabled,
}: FieldSelectProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cx(
          "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
          FOCUS_RING,
        )}
      >
        {children}
      </select>
      {helperText ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

export type ConnectionFormValues = {
  provider: GitConnectionProvider;
  kind: GitConnectionKind;
  displayName: string;
  externalAccountId: string | null;
  workExperienceId: string | null;
  disclosureLevelOverride: AgentDisclosureLevel | null;
  autoPostEnabled: boolean;
  cadence: DigestCadence;
  includeAgentSummary: boolean;
};

type ConnectionFormProps = {
  connection: GitConnection | null;
  policy: AgentPolicy | undefined;
  roles: WorkExperienceResponse[];
  isSaving: boolean;
  /** Throws on failure; the form turns that into an inline message. */
  onSubmit: (values: ConnectionFormValues) => Promise<void>;
};

/**
 * The form body, mounted inside the Radix portal.
 *
 * Radix unmounts dialog content when it closes, so every open gets a fresh
 * instance and the initial state below IS the reset — no effect that
 * re-synchronises props into state, and no chance of a dismissed draft leaking
 * into the next open. The `key` in the parent covers the one case Radix does
 * not: swapping from editing one row to another without closing in between.
 */
function ConnectionForm({
  connection,
  policy,
  roles,
  isSaving,
  onSubmit,
}: ConnectionFormProps) {
  const isEditing = connection !== null;

  const [displayName, setDisplayName] = useState(connection?.displayName ?? "");
  const [provider, setProvider] = useState<GitConnectionProvider>(
    connection?.provider ?? "github",
  );
  const [kind, setKind] = useState<GitConnectionKind>(
    connection?.kind ?? "personal",
  );
  const [externalAccountId, setExternalAccountId] = useState(
    connection?.externalAccountId ?? "",
  );
  const [workExperienceId, setWorkExperienceId] = useState<string | null>(
    connection?.workExperienceId ?? null,
  );
  const [disclosureLevelOverride, setDisclosureLevelOverride] =
    useState<AgentDisclosureLevel | null>(
      connection?.disclosureLevelOverride ?? null,
    );
  const [autoPostEnabled, setAutoPostEnabled] = useState(
    connection?.autoPostEnabled ?? false,
  );
  const [cadence, setCadence] = useState<DigestCadence>(
    connection?.cadence ?? DEFAULT_DIGEST_CADENCE,
  );
  // `false` for a new connection, always. The schema makes omission mean "no"
  // for a reason; the form must not quietly disagree with it.
  const [includeAgentSummary, setIncludeAgentSummary] = useState(
    connection?.includeAgentSummary ?? false,
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const linkedRole = roles.find((role) => role.id === workExperienceId) ?? null;
  const effective = resolveEffectiveDisclosure(
    { workExperienceId, disclosureLevelOverride },
    policy,
  );

  const handleKindChange = (value: string) => {
    const nextKind = value as GitConnectionKind;
    setKind(nextKind);

    // A personal connection has no employer to inherit from, so leaving a role
    // attached would keep applying an override the UI no longer shows.
    if (nextKind === "personal") {
      setWorkExperienceId(null);
      setDisclosureLevelOverride(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNameError(null);

    const trimmedName = displayName.trim();

    if (trimmedName.length === 0) {
      setNameError("Give this source a name so you can recognize it later.");
      document.getElementById(NAME_FIELD_ID)?.focus();
      return;
    }

    try {
      await onSubmit({
        provider,
        kind,
        displayName: trimmedName,
        externalAccountId: externalAccountId.trim() || null,
        workExperienceId,
        disclosureLevelOverride,
        autoPostEnabled,
        cadence,
        includeAgentSummary,
      });
    } catch {
      setError(
        isEditing
          ? "Could not save that change. Your previous settings are still in force."
          : "Could not connect that source. Please try again.",
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        id={NAME_FIELD_ID}
        label="Display name"
        placeholder="e.g. Work GitHub, personal laptop"
        value={displayName}
        error={nameError ?? undefined}
        onChange={(event) => {
          setDisplayName(event.target.value);
          setNameError(null);
        }}
        autoFocus
      />

      <FieldSelect
        id="connection-provider"
        label="Source"
        value={provider}
        disabled={isEditing}
        onChange={(value) => setProvider(value as GitConnectionProvider)}
        helperText={
          isEditing
            ? "The source type can't be changed — disconnect and add a new one instead."
            : PROVIDER_DESCRIPTIONS[provider]
        }
      >
        {PROVIDER_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {PROVIDER_LABELS[option]}
          </option>
        ))}
      </FieldSelect>

      {!isEditing ? (
        <Input
          id="connection-account"
          label="Account or username on that source (optional)"
          placeholder="e.g. your GitHub login"
          value={externalAccountId}
          onChange={(event) => setExternalAccountId(event.target.value)}
        />
      ) : null}

      <FieldSelect
        id="connection-kind"
        label="This activity is"
        value={kind}
        onChange={handleKindChange}
        helperText={
          kind === "work"
            ? "Work activity belongs to an employer, so it inherits a disclosure level."
            : kind === "mixed"
              ? MIXED_KIND_RULE
              : "Personal activity is yours to publish, with no employer to protect."
        }
      >
        <option value="personal">Personal</option>
        <option value="work">Work</option>
        {/* One machine holding both. Not a softer "work": the employer block
            below applies to it unchanged. */}
        <option value="mixed">Both — personal side projects and work repos</option>
      </FieldSelect>

      {kindInheritsWorkRules(kind) ? (
        <div className={`space-y-3 p-4 ${SURFACE_INSET}`}>
          <FieldSelect
            id="connection-role"
            label="Employer"
            value={workExperienceId ?? NO_ROLE}
            onChange={(value) =>
              setWorkExperienceId(value === NO_ROLE ? null : value)
            }
            helperText={
              roles.length === 0
                ? "Add work experience to your profile to link this source to an employer."
                : "Linking a role makes that role's own disclosure level apply."
            }
          >
            <option value={NO_ROLE}>Not linked to a role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.companyName} — {role.title}
              </option>
            ))}
          </FieldSelect>

          <FieldSelect
            id="connection-disclosure"
            label="Disclosure level for this source"
            value={disclosureLevelOverride ?? INHERIT}
            onChange={(value) =>
              setDisclosureLevelOverride(
                value === INHERIT ? null : (value as AgentDisclosureLevel),
              )
            }
            helperText="Used only when the linked role has no level of its own."
          >
            <option value={INHERIT}>Account default</option>
            {AGENT_DISCLOSURE_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </FieldSelect>

          {/* The consequence, before auto-posting is switched on rather than
              after the first digest has already gone out. */}
          <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-zinc-700 dark:border-violet-500/30 dark:bg-violet-500/5 dark:text-zinc-300">
            <FiShield className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                In force: {disclosureLevelLabel(effective.level)}
              </span>{" "}
              <span className="text-zinc-600 dark:text-zinc-400">
                (
                {disclosureSourceLabel(
                  effective.source,
                  linkedRole?.companyName ?? null,
                )}
                )
              </span>
              <span className="mt-1 block">
                {disclosureConsequence(
                  effective.level,
                  linkedRole?.companyName ?? null,
                )}
              </span>
            </span>
          </div>
        </div>
      ) : null}

      <FieldSelect
        id="connection-cadence"
        label="Digest cadence"
        value={cadence}
        onChange={(value) => setCadence(value as DigestCadence)}
        helperText="How often this source is allowed to turn activity into one post."
      >
        {CADENCE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {CADENCE_LABELS[option]}
          </option>
        ))}
      </FieldSelect>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-violet-600"
          checked={autoPostEnabled}
          onChange={(event) => setAutoPostEnabled(event.target.checked)}
        />
        <span className="min-w-0">
          <span className="text-sm text-zinc-900 dark:text-zinc-100">
            Post digests automatically
          </span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            Off means digests are still generated on this cadence, but wait for
            you to approve them.
          </span>
        </span>
      </label>

      {/* Not buried, and not sold. The default is false because the text this
          sends is a model's prose about work that may not be the user's to
          describe — so the copy says that, rather than implying they are
          missing out on a richer post. */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-violet-600"
          checked={includeAgentSummary}
          onChange={(event) => setIncludeAgentSummary(event.target.checked)}
        />
        <span className="min-w-0">
          <span className="text-sm text-zinc-900 dark:text-zinc-100">
            Send the coding agent&apos;s own description of each task
          </span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            Off by default. That text is prose a model wrote about what you were
            working on, and on a work machine it can describe systems, decisions
            and problems that are your employer&apos;s to describe, not yours.
            Without it, only hashed, aggregated metadata is sent.
          </span>
        </span>
      </label>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
        >
          <FiAlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <RadixDialog.Close asChild>
          <Button type="button" variant="outline" fullWidth={false}>
            Cancel
          </Button>
        </RadixDialog.Close>
        <Button
          type="submit"
          fullWidth={false}
          isLoading={isSaving}
          loadingLabel={isEditing ? "Saving..." : "Connecting..."}
        >
          {isEditing ? "Save changes" : "Connect source"}
        </Button>
      </div>
    </form>
  );
}

type ConnectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` opens the dialog in create mode. */
  connection: GitConnection | null;
  /** Called with the create response — the ONLY carrier of the plaintext secret. */
  onCreated: (result: CreateGitConnectionOutput) => void;
};

export function ConnectionDialog({
  open,
  onOpenChange,
  connection,
  onCreated,
}: ConnectionDialogProps) {
  const isEditing = connection !== null;

  const policyQuery = useAgentPolicy(open);
  const workExperiencesQuery = useWorkExperiencesForPolicy(open);
  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnection();

  const handleSubmit = async (values: ConnectionFormValues) => {
    if (connection) {
      await updateConnection.mutateAsync({
        connectionId: connection.id,
        patch: {
          displayName: values.displayName,
          kind: values.kind,
          workExperienceId: values.workExperienceId,
          disclosureLevelOverride: values.disclosureLevelOverride,
          autoPostEnabled: values.autoPostEnabled,
          cadence: values.cadence,
          includeAgentSummary: values.includeAgentSummary,
        },
      });
      onOpenChange(false);
      return;
    }

    const result = await createConnection.mutateAsync(values);

    // Closed before the secret is rendered, on purpose. The plaintext secret is
    // shown exactly once, on the panel behind this dialog, where it survives
    // being dismissed — mirroring how the one-time PAT lives on in the connect
    // snippets rather than dying with its dialog.
    onOpenChange(false);
    onCreated(result);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Edit activity source" : "Connect an activity source"}
      description={
        isEditing
          ? undefined
          : "LinkHub turns the activity from a connected source into a periodic digest post."
      }
      contentClassName="max-w-lg"
    >
      <ConnectionForm
        key={connection?.id ?? "new"}
        connection={connection}
        policy={policyQuery.data}
        roles={workExperiencesQuery.data ?? []}
        isSaving={createConnection.isPending || updateConnection.isPending}
        onSubmit={handleSubmit}
      />
    </Dialog>
  );
}
