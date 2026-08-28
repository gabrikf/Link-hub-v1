import type { GitConnectionKind, WorkExperienceResponse } from "@repo/schemas";
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
import { MIXED_KIND_HELPER, MIXED_KIND_RULE } from "../../lib/connection-format";
import { DISCLOSURE_PANEL_ID } from "../disclosure-panel";
import {
  Segmented,
  WizardFieldSelect,
  type ForgeProvider,
  type WizardSourceKey,
} from "./wizard-shared";

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

const SOURCE_CARDS: SourceCardDef[] = [
  {
    key: "mcp",
    icon: FiZap,
    title: "Coding agent (MCP)",
    description:
      "Works with Claude Code, Claude Desktop, Cursor, VS Code + Copilot, Windsurf, Kiro, Codex CLI — anything that speaks MCP. Your agent writes the post itself from your git history; LinkHub adds zero AI cost.",
    privacy:
      "Reads: your git history, locally, through your own agent. Never reads: anything server-side — LinkHub only receives the finished post.",
    recommended: true,
    postsOnItsOwn: true,
    needsDevMachine: true,
  },
  {
    key: "claude_code",
    icon: FiCpu,
    title: "Claude Code background hook",
    description:
      "Adds the story of your sessions to your posts, metadata only. It never starts a post on its own — a post needs a merged pull request, a review or a release, so pair it with webhooks or the MCP agent.",
    privacy:
      "Reads: session metadata when a session ends. Never reads: code, commit messages, file paths.",
    postsOnItsOwn: false,
    needsDevMachine: true,
  },
  {
    key: "extractor",
    icon: FiTerminal,
    title: "Local extractor CLI",
    description:
      "For any machine or repo without an agent; you review a JSON file before anything uploads. It fills in your posts rather than starting them — a post still needs a merged pull request, a review or a release from webhooks or the MCP agent.",
    privacy:
      "Reads: local git metadata, hashed on your machine. Never reads: code, branch names, commit messages.",
    postsOnItsOwn: false,
    needsDevMachine: true,
  },
  {
    key: "forge",
    icon: FiGitPullRequest,
    title: "GitHub / GitLab webhooks",
    description:
      "Personal repos you own; server-side, no local install.",
    privacy:
      "Reads: pushed commits, merged PRs, reviews and releases via webhook. Never reads: your code or the repository contents.",
    postsOnItsOwn: true,
  },
];

/**
 * Shown when the chosen source cannot trigger a digest by itself. Kept next to
 * `SOURCE_CARDS` so the copy and the `postsOnItsOwn` flag stay in step.
 */
const SELECTED_NEEDS_PARTNER_NOTICE =
  "This source adds context to your posts — it can't start one by itself. A post needs a merged pull request, a submitted review or a release, so combine it with GitHub / GitLab webhooks or the coding agent (MCP).";

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
}: SourceStepProps) {
  const selectedCard =
    SOURCE_CARDS.find((card) => card.key === sourceKey) ?? null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Where does your work happen? Every option sends metadata only — never
        code, never names.
      </p>

      {/* aria-pressed buttons, not radio roles: role="radio" promises arrow-key
          navigation and roving tabindex these cards never implemented. Same
          pattern as the `Segmented` control. */}
      <div
        role="group"
        aria-label="Activity source"
        className="grid gap-3 sm:grid-cols-2"
      >
        {SOURCE_CARDS.map((card) => {
          const Icon = card.icon;
          const isSelected = card.key === sourceKey;
          return (
            <button
              key={card.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectSource(card.key)}
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
                    Recommended
                  </span>
                ) : null}
                {/* The honest headline: only two of the four sources can put a
                    post on your profile without help from another one. */}
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    card.postsOnItsOwn ? BADGE.success : BADGE.neutral
                  }`}
                >
                  {card.postsOnItsOwn ? "Posts on its own" : "Adds context"}
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
                  Needs your dev machine for setup
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedCard && !selectedCard.postsOnItsOwn ? (
        // Information, not an error: the wizard still lets you finish. A source
        // that only enriches a digest is useful, just never on its own.
        <p className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <FiInfo
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400"
            aria-hidden="true"
          />
          <span>{SELECTED_NEEDS_PARTNER_NOTICE}</span>
        </p>
      ) : null}

      {sourceKey === "forge" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-zinc-700 dark:text-zinc-300">Forge</span>
          <Segmented
            label="Forge"
            value={forgeProvider}
            options={[
              { value: "github", label: "GitHub" },
              { value: "gitlab", label: "GitLab" },
            ]}
            onChange={onForgeProviderChange}
          />
        </div>
      ) : null}

      {/* MCP creates no connection on LinkHub's side, so a kind and a display
          name would be collected and then thrown away — the step said as much
          while still asking. Only the explanation survives. */}
      {sourceKey === "mcp" ? (
        <div className={`p-4 ${SURFACE_INSET}`}>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            MCP needs no connection on LinkHub&apos;s side — your agent posts
            with its own token. Nothing to name.
          </p>
        </div>
      ) : sourceKey ? (
        <div className={`space-y-3 p-4 ${SURFACE_INSET}`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              This activity is
            </span>
            <Segmented
              label="Activity kind"
              value={kind}
              options={[
                { value: "personal", label: "Personal" },
                { value: "work", label: "Work" },
                { value: "mixed", label: "Both" },
              ]}
              onChange={(value) => onKindChange(value)}
            />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {MIXED_KIND_HELPER}
          </p>

          {kind !== "personal" ? (
            <>
              <WizardFieldSelect
                id="wizard-work-experience"
                label="Employer"
                value={workExperienceId ?? NO_ROLE}
                onChange={(value) =>
                  onWorkExperienceChange(value === NO_ROLE ? null : value)
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
              </WizardFieldSelect>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Work sources inherit your disclosure level — set it under{" "}
                <a
                  href={`#${DISCLOSURE_PANEL_ID}`}
                  className={`font-medium text-violet-700 underline underline-offset-2 hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200 ${FOCUS_RING} rounded`}
                >
                  What your agent may share
                </a>
                .
              </p>
              {kind === "mixed" ? (
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {MIXED_KIND_RULE}
                </p>
              ) : null}
            </>
          ) : null}

          <Input
            id="wizard-display-name"
            label="Display name"
            placeholder="e.g. Work laptop — Claude Code"
            value={displayName}
            error={displayNameError ?? undefined}
            onChange={(event) => onDisplayNameChange(event.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}
