import {
  AGENT_DISCLOSURE_LEVELS,
  type AgentDisclosureLevel,
} from "@repo/schemas";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  FiAlertTriangle,
  FiCheck,
  FiLock,
  FiPlus,
  FiShield,
  FiX,
} from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import { Input } from "../../../shared-components/input";
import {
  BADGE,
  FOCUS_RING,
  SURFACE_GLASS,
  SURFACE_INSET,
} from "../../../shared-components/surface";
import {
  useAgentPolicy,
  useUpdateAgentPolicy,
  useUpdateWorkExperienceDisclosure,
  useWorkExperiencesForPolicy,
} from "../lib/agent-policy-queries";

/** Anchor target so other panels can link here. */
export const DISCLOSURE_PANEL_ID = "agent-disclosure";

const INHERIT = "inherit";

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

type LevelCardProps = {
  level: (typeof AGENT_DISCLOSURE_LEVELS)[number];
  isSelected: boolean;
  isSaving: boolean;
  onSelect: () => void;
};

/**
 * One selectable level. `allows` / `blocks` are rendered verbatim from the
 * shared schema rather than restated here — this copy is the same text injected
 * into the agent's tool descriptions, and two versions of it would drift.
 */
function LevelCard({ level, isSelected, isSaving, onSelect }: LevelCardProps) {
  const descriptionId = `disclosure-level-${level.value}-description`;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      // The card body quotes the other levels by name ("Everything in Summary,
      // plus…"), so without an explicit label the accessible names collide.
      aria-label={level.label}
      aria-describedby={descriptionId}
      disabled={isSaving}
      onClick={onSelect}
      className={cx(
        "flex h-full flex-col rounded-xl border p-4 text-left transition disabled:opacity-60",
        FOCUS_RING,
        isSelected
          ? "border-violet-500 bg-violet-50/70 ring-1 ring-violet-500 dark:border-violet-400 dark:bg-violet-500/10 dark:ring-violet-400"
          : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600",
      )}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cx(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
            isSelected
              ? "border-violet-600 bg-violet-600 text-white dark:border-violet-400 dark:bg-violet-500"
              : "border-zinc-300 dark:border-zinc-600",
          )}
        >
          {isSelected ? <FiCheck className="h-2.5 w-2.5" /> : null}
        </span>
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {level.label}
        </span>
        {level.value === "summary" ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE.neutral}`}
          >
            Default
          </span>
        ) : null}
      </span>

      <span
        id={descriptionId}
        className="mt-2 text-xs text-zinc-600 dark:text-zinc-400"
      >
        {level.shortDescription}
      </span>

      <span className="mt-3 block text-xs font-semibold text-emerald-700 dark:text-emerald-300">
        Your agent may share
      </span>
      <ul className="mt-1 space-y-1">
        {level.allows.map((item) => (
          <li
            key={item}
            className="flex gap-1.5 text-xs text-zinc-600 dark:text-zinc-400"
          >
            <FiCheck
              className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <span className="mt-3 block text-xs font-semibold text-red-700 dark:text-red-300">
        Never shared
      </span>
      {level.blocks.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {level.blocks.map((item) => (
            <li
              key={item}
              className="flex gap-1.5 text-xs text-zinc-600 dark:text-zinc-400"
            >
              <FiX
                className="mt-0.5 h-3 w-3 shrink-0 text-red-600 dark:text-red-400"
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
          Nothing beyond the blocked terms you add below.
        </p>
      )}
    </button>
  );
}

/**
 * "What your agent may share" — the human end of the disclosure contract.
 *
 * Everything here is enforced server-side, not merely passed to the model as
 * advice, which is why the copy is allowed to promise rather than hedge.
 */
export function DisclosurePanel({ enabled = true }: { enabled?: boolean }) {
  const policyQuery = useAgentPolicy(enabled);
  const workExperiencesQuery = useWorkExperiencesForPolicy(enabled);
  const updatePolicy = useUpdateAgentPolicy();
  const updateOverride = useUpdateWorkExperienceDisclosure();

  const [termDraft, setTermDraft] = useState("");
  const [termError, setTermError] = useState<string | null>(null);

  const policy = policyQuery.data;
  const blockedTerms = useMemo(() => policy?.blockedTerms ?? [], [policy]);

  // Clear a stale validation message when the server state changes underneath.
  useEffect(() => {
    setTermError(null);
  }, [blockedTerms]);

  const overrideByRole = useMemo(() => {
    const map = new Map<string, AgentDisclosureLevel>();
    for (const entry of policy?.perEmployer ?? []) {
      map.set(entry.workExperienceId, entry.disclosureLevel);
    }
    return map;
  }, [policy]);

  const handleSelectLevel = (level: AgentDisclosureLevel) => {
    if (level === policy?.disclosureLevel) return;
    updatePolicy.mutate({ disclosureLevel: level });
  };

  const handleAddTerm = () => {
    const term = termDraft.trim();

    if (term.length < 2) {
      setTermError("Enter at least 2 characters.");
      return;
    }

    // Case-insensitive: the server treats "Acme" and "acme" as one rule, so
    // adding both here would silently collapse and look like a lost edit.
    if (
      blockedTerms.some(
        (existing) => existing.toLowerCase() === term.toLowerCase(),
      )
    ) {
      setTermError("That term is already blocked.");
      return;
    }

    setTermError(null);
    setTermDraft("");
    updatePolicy.mutate({ blockedTerms: [...blockedTerms, term] });
  };

  const handleRemoveTerm = (term: string) => {
    updatePolicy.mutate({
      blockedTerms: blockedTerms.filter((existing) => existing !== term),
    });
  };

  const handleTermKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddTerm();
    }
  };

  const handleOverrideChange = (workExperienceId: string, value: string) => {
    updateOverride.mutate({
      workExperienceId,
      disclosureLevel:
        value === INHERIT ? null : (value as AgentDisclosureLevel),
    });
  };

  const roles = workExperiencesQuery.data ?? [];

  return (
    <section
      id={DISCLOSURE_PANEL_ID}
      className={`anim-fade-up p-5 sm:p-6 ${SURFACE_GLASS}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
          <FiShield className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            What your agent may share
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Your coding agent can describe what you built without naming who you
            built it for. LinkHub enforces this on the server: a post that names
            a blocked employer or client is rejected outright, and the work
            history your agent can read is redacted before it leaves LinkHub.
          </p>
        </div>
      </div>

      {policyQuery.isError ? (
        <p
          role="alert"
          className="mt-4 text-sm text-red-600 dark:text-red-400"
        >
          Could not load your disclosure settings. Please try again.
        </p>
      ) : null}

      {updatePolicy.isError || updateOverride.isError ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
        >
          <FiAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Could not save that change. Your previous setting is still in force.
        </p>
      ) : null}

      <div
        role="radiogroup"
        aria-label="Disclosure level"
        className="mt-5 grid gap-3 lg:grid-cols-3"
      >
        {AGENT_DISCLOSURE_LEVELS.map((level) => (
          <LevelCard
            key={level.value}
            level={level}
            isSelected={policy?.disclosureLevel === level.value}
            isSaving={updatePolicy.isPending}
            onSelect={() => handleSelectLevel(level.value)}
          />
        ))}
      </div>

      <div className={`mt-6 p-4 ${SURFACE_INSET}`}>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          <FiLock className="h-4 w-4 shrink-0" aria-hidden="true" />
          Blocked terms
        </h3>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Words your agent must never publish, whatever the level above —
          including Full. Client codenames, internal project names, unreleased
          products. Matching ignores case and only hits whole words, so
          &quot;Sun&quot; will not redact &quot;sunset&quot;.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <Input
              id="blocked-term"
              label="Add a term"
              placeholder="e.g. Project Falcon"
              value={termDraft}
              error={termError ?? undefined}
              onChange={(event) => {
                setTermDraft(event.target.value);
                setTermError(null);
              }}
              onKeyDown={handleTermKeyDown}
            />
          </div>
          <Button
            type="button"
            variant="soft"
            fullWidth={false}
            className="mb-0.5 shrink-0"
            isLoading={updatePolicy.isPending}
            loadingLabel="Saving..."
            onClick={handleAddTerm}
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" />
            Add
          </Button>
        </div>

        {blockedTerms.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {blockedTerms.map((term) => (
              <li key={term}>
                <span
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${BADGE.accent}`}
                >
                  {term}
                  <button
                    type="button"
                    aria-label={`Remove ${term}`}
                    disabled={updatePolicy.isPending}
                    onClick={() => handleRemoveTerm(term)}
                    className={cx(
                      "rounded-full p-0.5 transition hover:bg-violet-200 disabled:opacity-50 dark:hover:bg-violet-500/30",
                      FOCUS_RING,
                    )}
                  >
                    <FiX className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
            No blocked terms yet.
          </p>
        )}
      </div>

      <div className={`mt-4 p-4 ${SURFACE_INSET}`}>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Per-employer overrides
        </h3>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          One job at a time. Your open-source role can be Full while a
          consulting client stays on Summary. Anything left on
          &quot;Account default&quot; follows the level you picked above.
        </p>

        {roles.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
            {workExperiencesQuery.isLoading
              ? "Loading your roles..."
              : "Add work experience to your profile to set per-employer rules."}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {roles.map((role) => {
              const selectId = `disclosure-${role.id}`;
              return (
                <li
                  key={role.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {role.companyName}
                    </p>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {role.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={selectId}
                      className="text-xs text-zinc-600 dark:text-zinc-400"
                    >
                      Level
                    </label>
                    <select
                      id={selectId}
                      value={overrideByRole.get(role.id) ?? INHERIT}
                      disabled={updateOverride.isPending}
                      onChange={(event) =>
                        handleOverrideChange(role.id, event.target.value)
                      }
                      className={cx(
                        "rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100",
                        FOCUS_RING,
                      )}
                    >
                      <option value={INHERIT}>Account default</option>
                      {AGENT_DISCLOSURE_LEVELS.map((level) => (
                        <option key={level.value} value={level.value}>
                          {level.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
