import {
  AGENT_DISCLOSURE_LEVELS,
  type AgentDisclosureLevel,
} from "@repo/schemas";
import { useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
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
 * One selectable level.
 *
 * The bullets come from the shared schema as WIRE VALUES (`allowIds` /
 * `blockIds`) and are translated here. The schema's sibling `allows` / `blocks`
 * are the same list in English, written for the agent's tool descriptions — the
 * two cannot drift because one is derived from the other, and rendering the
 * English half would put untranslated prose on a Portuguese screen.
 */
function LevelCard({
  level,
  isSelected,
  isSaving,
  onSelect,
}: Readonly<LevelCardProps>) {
  const { t } = useTranslation();
  const descriptionId = `disclosure-level-${level.value}-description`;
  const levelName = t(`enum.disclosureLevel.${level.value}`);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      // The card body quotes the other levels by name ("Everything in Summary,
      // plus…"), so without an explicit label the accessible names collide.
      aria-label={levelName}
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
          {levelName}
        </span>
        {level.value === "summary" ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE.neutral}`}
          >
            {t("common.default")}
          </span>
        ) : null}
      </span>

      <span
        id={descriptionId}
        className="mt-2 text-xs text-zinc-600 dark:text-zinc-400"
      >
        {t(`enum.disclosureLevelDescription.${level.value}`)}
      </span>

      <span className="mt-3 block text-xs font-semibold text-emerald-700 dark:text-emerald-300">
        {t("settings.disclosure.mayShare")}
      </span>
      <ul className="mt-1 space-y-1">
        {level.allowIds.map((id) => (
          <li
            key={id}
            className="flex gap-1.5 text-xs text-zinc-600 dark:text-zinc-400"
          >
            <FiCheck
              className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <span>{t(`enum.disclosureBullet.${id}`)}</span>
          </li>
        ))}
      </ul>

      <span className="mt-3 block text-xs font-semibold text-red-700 dark:text-red-300">
        {t("settings.disclosure.neverShared")}
      </span>
      {level.blockIds.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {level.blockIds.map((id) => (
            <li
              key={id}
              className="flex gap-1.5 text-xs text-zinc-600 dark:text-zinc-400"
            >
              <FiX
                className="mt-0.5 h-3 w-3 shrink-0 text-red-600 dark:text-red-400"
                aria-hidden="true"
              />
              <span>{t(`enum.disclosureBullet.${id}`)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
          {t("settings.disclosure.nothingBeyondBlocked")}
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
export function DisclosurePanel({
  enabled = true,
}: Readonly<{ enabled?: boolean }>) {
  const { t } = useTranslation();
  const policyQuery = useAgentPolicy(enabled);
  const workExperiencesQuery = useWorkExperiencesForPolicy(enabled);
  const updatePolicy = useUpdateAgentPolicy();
  const updateOverride = useUpdateWorkExperienceDisclosure();

  const [termDraft, setTermDraft] = useState("");
  const [termError, setTermError] = useState<string | null>(null);

  const policy = policyQuery.data;
  const blockedTerms = useMemo(() => policy?.blockedTerms ?? [], [policy]);

  // Clear a stale validation message when the server state changes underneath.
  //
  // Adjusted during render rather than in an effect: the message is derived
  // from a list the server owns, so an effect would paint one frame of a
  // contradiction — "That term is already blocked." over a list that no longer
  // blocks it — before clearing it. See
  // https://react.dev/learn/you-might-not-need-an-effect
  const [lastSeenBlockedTerms, setLastSeenBlockedTerms] =
    useState(blockedTerms);

  if (lastSeenBlockedTerms !== blockedTerms) {
    setLastSeenBlockedTerms(blockedTerms);
    setTermError(null);
  }

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
      setTermError(t("settings.disclosure.termTooShort"));
      return;
    }

    // Case-insensitive: the server treats "Acme" and "acme" as one rule, so
    // adding both here would silently collapse and look like a lost edit.
    if (
      blockedTerms.some(
        (existing) => existing.toLowerCase() === term.toLowerCase(),
      )
    ) {
      setTermError(t("settings.disclosure.termDuplicate"));
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
            {t("settings.connect.whatAgentMayShare")}
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("settings.disclosure.intro")}
          </p>
        </div>
      </div>

      {policyQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {t("settings.disclosure.loadFailed")}
        </p>
      ) : null}

      {updatePolicy.isError || updateOverride.isError ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
        >
          <FiAlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          {t("settings.disclosure.saveFailed")}
        </p>
      ) : null}

      <div
        role="radiogroup"
        aria-label={t("settings.disclosure.levelLabel")}
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
          {t("settings.disclosure.blockedTerms")}
        </h3>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          {t("settings.disclosure.blockedTermsHelp")}
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <Input
              id="blocked-term"
              label={t("settings.disclosure.addTerm")}
              placeholder={t("settings.disclosure.termPlaceholder")}
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
            loadingLabel={t("common.saving")}
            onClick={handleAddTerm}
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" />
            {t("common.add")}
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
                    aria-label={t("settings.disclosure.removeTerm", { term })}
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
            {t("settings.disclosure.noTerms")}
          </p>
        )}
      </div>

      <div className={`mt-4 p-4 ${SURFACE_INSET}`}>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {t("settings.disclosure.perEmployer")}
        </h3>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          {t("settings.disclosure.perEmployerHelp")}
        </p>

        {roles.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
            {workExperiencesQuery.isLoading
              ? t("settings.disclosure.loadingRoles")
              : t("settings.disclosure.noRoles")}
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
                      {t("common.level")}
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
                      <option value={INHERIT}>
                        {t("settings.connectionDialog.accountDefault")}
                      </option>
                      {AGENT_DISCLOSURE_LEVELS.map((level) => (
                        <option key={level.value} value={level.value}>
                          {t(`enum.disclosureLevel.${level.value}`)}
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
