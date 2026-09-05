import type { GitConnectionKind, WorkExperienceResponse } from "@repo/schemas";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import type { IconType } from "react-icons";
import {
  FiCpu,
  FiGitPullRequest,
  FiInfo,
  FiMonitor,
  FiTerminal,
  FiZap,
} from "react-icons/fi";
import { Input } from "../../../../shared-components/input";
import {
  BADGE,
  FOCUS_RING,
  SURFACE_INSET,
} from "../../../../shared-components/surface";
import { mixedKindHelper, mixedKindRule } from "../../lib/connection-format";
import { DISCLOSURE_PANEL_ID } from "../disclosure-panel";
import { Segmented, WizardFieldSelect } from "./wizard-controls";
import type { ForgeProvider, WizardSourceKey } from "./wizard-vocabulary";

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

const NO_ROLE = "none";

type SourceCardDef = {
  key: WizardSourceKey;
  icon: IconType;
  title: string;
  description: string;
  /** One line: what we read / what we never read. */
  privacy: string;
  /**
   * Whether this source can start a digest by itself. A digest needs a merged
   * pull request, a submitted review or a release (`hasPublishableEvidence` in
   * apps/api) — the hook only emits `agent_session` events and the extractor
   * only emits `commit` events, so neither ever clears that bar alone. They
   * enrich a digest another source triggered.
   */
  postsOnItsOwn: boolean;
  recommended?: boolean;
  /** Setup happens in a terminal or config file on the user's dev machine. */
  needsDevMachine?: boolean;
};

function getSourceCards(t: TFunction): SourceCardDef[] {
  return [
    {
      key: "mcp",
      icon: FiZap,
      title: t("wizard.namePreset.codingAgent"),
      description: t("wizard.source.mcpBody"),
      privacy: t("wizard.source.mcpReads"),
      recommended: true,
      postsOnItsOwn: true,
      needsDevMachine: true,
    },
    {
      key: "claude_code",
      icon: FiCpu,
      title: t("wizard.source.hookTitle"),
      description: t("wizard.source.hookBody"),
      privacy: t("wizard.source.hookReads"),
      postsOnItsOwn: false,
      needsDevMachine: true,
    },
    {
      key: "extractor",
      icon: FiTerminal,
      title: t("wizard.source.extractorTitle"),
      description: t("wizard.source.extractorBody"),
      privacy: t("wizard.source.extractorReads"),
      postsOnItsOwn: false,
      needsDevMachine: true,
    },
    {
      key: "forge",
      icon: FiGitPullRequest,
      title: t("wizard.source.webhookTitle"),
      description: t("wizard.source.webhookBody"),
      privacy: t("wizard.source.webhookReads"),
      postsOnItsOwn: true,
    },
  ];
}

type SourceCardButtonProps = {
  card: SourceCardDef;
  isSelected: boolean;
  onSelect: (key: WizardSourceKey) => void;
};

/**
 * One selectable source card. Extracted from `SourceStep` so the step body
 * stays readable: the badges alone carry most of its branching.
 */
function SourceCardButton({
  card,
  isSelected,
  onSelect,
}: Readonly<SourceCardButtonProps>) {
  const { t } = useTranslation();
  const Icon = card.icon;
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(card.key)}
      className={cx(
        "flex flex-col gap-2 rounded-xl border p-3 text-left transition",
        FOCUS_RING,
        isSelected
          ? "border-violet-500 bg-violet-50/60 dark:border-violet-500/70 dark:bg-violet-500/10"
          : "border-zinc-200 bg-white hover:border-violet-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-violet-500/50",
      )}
    >
      <span className="flex flex-wrap items-center gap-2">
        <Icon
          className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400"
          aria-hidden="true"
        />
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {card.title}
        </span>
        {card.recommended ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE.success}`}
          >
            {t("wizard.source.recommended")}
          </span>
        ) : null}
        {/* The honest headline: only two of the four sources can put a
            post on your profile without help from another one. */}
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            card.postsOnItsOwn ? BADGE.success : BADGE.neutral
          }`}
        >
          {card.postsOnItsOwn
            ? t("wizard.source.postsOnItsOwn")
            : t("wizard.source.addsContext")}
        </span>
      </span>
      <span className="text-xs text-zinc-600 dark:text-zinc-400">
        {card.description}
      </span>
      <span className="text-xs text-zinc-500 dark:text-zinc-500">
        {card.privacy}
      </span>
      {card.needsDevMachine ? (
        // Phone users can walk the whole wizard; only the paste-into-
        // a-config part needs the machine the tool runs on.
        <span
          className={`mt-auto inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${BADGE.neutral}`}
        >
          <FiMonitor className="h-3 w-3" aria-hidden="true" />
          {t("wizard.source.needsDevMachine")}
        </span>
      ) : null}
    </button>
  );
}

type SourceDetailsProps = {
  kind: GitConnectionKind;
  onKindChange: (kind: GitConnectionKind) => void;
  workExperienceId: string | null;
  onWorkExperienceChange: (id: string | null) => void;
  roles: WorkExperienceResponse[];
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  displayNameError: string | null;
};

/**
 * Kind, employer and display name for a source that does create a connection.
 * Extracted from `SourceStep` so the step body reads as the four questions it
 * asks rather than as one nest of conditionals.
 */
function SourceDetails({
  kind,
  onKindChange,
  workExperienceId,
  onWorkExperienceChange,
  roles,
  displayName,
  onDisplayNameChange,
  displayNameError,
}: Readonly<SourceDetailsProps>) {
  const { t } = useTranslation();
  return (
    <div className={`space-y-3 p-4 ${SURFACE_INSET}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-zinc-700 dark:text-zinc-300">
          {t("settings.connectionDialog.thisActivityIs")}
        </span>
        <Segmented
          label={t("wizard.source.activityKind")}
          value={kind}
          options={[
            { value: "personal", label: t("common.personal") },
            { value: "work", label: t("common.work") },
            { value: "mixed", label: t("common.both") },
          ]}
          onChange={(value) => onKindChange(value)}
        />
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {mixedKindHelper()}
      </p>

      {kind !== "personal" ? (
        <>
          <WizardFieldSelect
            id="wizard-work-experience"
            label={t("settings.connectionDialog.employer")}
            value={workExperienceId ?? NO_ROLE}
            onChange={(value) =>
              onWorkExperienceChange(value === NO_ROLE ? null : value)
            }
            helperText={
              roles.length === 0
                ? t("settings.connectionDialog.noRolesYet")
                : t("settings.connectionDialog.roleInherits")
            }
          >
            <option value={NO_ROLE}>
              {t("settings.connectionDialog.notLinked")}
            </option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {t("settings.connectionDialog.roleOption", {
                  companyName: role.companyName,
                  title: role.title,
                })}
              </option>
            ))}
          </WizardFieldSelect>
          {/* The anchor's text is part of the sentence, so it lives
              inside the locale value as a `<policyLink>` slot rather than
              being interpolated as an opaque blob whose position every
              language would have to accept. Not named `link`: that is a
              void element in the HTML parser Trans uses, and the anchor
              would render empty. */}
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            <Trans
              i18nKey="wizard.source.workInherits"
              components={{
                policyLink: (
                  <a
                    href={`#${DISCLOSURE_PANEL_ID}`}
                    className={`font-medium text-violet-700 underline underline-offset-2 hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200 ${FOCUS_RING} rounded`}
                  />
                ),
              }}
            />
          </p>
          {kind === "mixed" ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {mixedKindRule()}
            </p>
          ) : null}
        </>
      ) : null}

      <Input
        id="wizard-display-name"
        label={t("resumeImport.displayName")}
        placeholder={t("wizard.source.namePlaceholder")}
        value={displayName}
        error={displayNameError ?? undefined}
        onChange={(event) => onDisplayNameChange(event.target.value)}
      />
    </div>
  );
}

export type SourceStepProps = {
  sourceKey: WizardSourceKey | null;
  onSelectSource: (key: WizardSourceKey) => void;
  forgeProvider: ForgeProvider;
  onForgeProviderChange: (provider: ForgeProvider) => void;
  kind: GitConnectionKind;
  onKindChange: (kind: GitConnectionKind) => void;
  workExperienceId: string | null;
  onWorkExperienceChange: (id: string | null) => void;
  roles: WorkExperienceResponse[];
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  displayNameError: string | null;
};

export function SourceStep({
  sourceKey,
  onSelectSource,
  forgeProvider,
  onForgeProviderChange,
  kind,
  onKindChange,
  workExperienceId,
  onWorkExperienceChange,
  roles,
  displayName,
  onDisplayNameChange,
  displayNameError,
}: Readonly<SourceStepProps>) {
  const { t } = useTranslation();
  const sourceCards = getSourceCards(t);
  const selectedCard =
    sourceCards.find((card) => card.key === sourceKey) ?? null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("wizard.source.question")}
      </p>

      {/* aria-pressed buttons, not radio roles: role="radio" promises arrow-key
          navigation and roving tabindex these cards never implemented. Same
          pattern as the `Segmented` control. */}
      <div
        role="group"
        aria-label={t("wizard.source.label")}
        className="grid gap-3 sm:grid-cols-2"
      >
        {sourceCards.map((card) => (
          <SourceCardButton
            key={card.key}
            card={card}
            isSelected={card.key === sourceKey}
            onSelect={onSelectSource}
          />
        ))}
      </div>

      {selectedCard && !selectedCard.postsOnItsOwn ? (
        // Information, not an error: the wizard still lets you finish. A source
        // that only enriches a digest is useful, just never on its own. The
        // copy lives in the catalogue under `wizard.source.needsPartnerNotice`,
        // next to the card bodies that make the same promise.
        <p className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <FiInfo
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400"
            aria-hidden="true"
          />
          <span>{t("wizard.source.needsPartnerNotice")}</span>
        </p>
      ) : null}

      {sourceKey === "forge" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-zinc-700 dark:text-zinc-300">
            {t("wizard.source.forge")}
          </span>
          <Segmented
            label={t("wizard.source.forge")}
            value={forgeProvider}
            options={[
              { value: "github", label: t("enum.platform.github") },
              { value: "gitlab", label: t("settings.provider.gitlab") },
            ]}
            onChange={onForgeProviderChange}
          />
        </div>
      ) : null}

      {/* MCP creates no connection on CraftHub's side, so a kind and a display
          name would be collected and then thrown away — the step said as much
          while still asking. Only the explanation survives. */}
      {sourceKey === "mcp" ? (
        <div className={`p-4 ${SURFACE_INSET}`}>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {t("wizard.source.mcpNoConnection")}
          </p>
        </div>
      ) : sourceKey ? (
        <SourceDetails
          kind={kind}
          onKindChange={onKindChange}
          workExperienceId={workExperienceId}
          onWorkExperienceChange={onWorkExperienceChange}
          roles={roles}
          displayName={displayName}
          onDisplayNameChange={onDisplayNameChange}
          displayNameError={displayNameError}
        />
      ) : null}
    </div>
  );
}
