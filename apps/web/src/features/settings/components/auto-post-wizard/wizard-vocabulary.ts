import type { GitConnectionKind } from "@repo/schemas";
import type { TFunction } from "i18next";

/**
 * Shared vocabulary for the auto-post wizard steps: the keys every step spells
 * the same way, and the labels and prefills derived from them. Kept out of the
 * step components so a step module can import a key without a cycle through the
 * dialog — and out of `wizard-controls.tsx`, which may export components only.
 */

/**
 * What the user picks on step 1. `forge` folds GitHub and GitLab into one
 * card — which forge it is becomes a segmented choice inside the card, because
 * the decision that matters (webhook vs. local tool vs. agent) is the card.
 */
export type WizardSourceKey = "mcp" | "claude_code" | "extractor" | "forge";

export type ForgeProvider = "github" | "gitlab";

export type WizardStepKey =
  | "source"
  | "connect"
  | "verify"
  | "preview"
  | "schedule";

export function getWizardSteps(
  t: TFunction,
): ReadonlyArray<{ key: WizardStepKey; label: string }> {
  return [
    { key: "source", label: t("common.source") },
    { key: "connect", label: t("wizard.step.connect") },
    { key: "verify", label: t("wizard.step.verify") },
    { key: "preview", label: t("common.preview") },
    { key: "schedule", label: t("wizard.step.schedule") },
  ];
}

/**
 * Prefilled display names. A name like "Work laptop — Claude Code" is what the
 * connection list needs six months later; an empty field invites "test".
 *
 * Kind-aware: a "Personal" selection prefilling "Work laptop — …" reads as the
 * wizard contradicting the choice the user just made. `mixed` is neither
 * laptop, so it names the machine without claiming which half it belongs to.
 */
export function defaultLocalDisplayName(
  key: Exclude<WizardSourceKey, "mcp" | "forge">,
  kind: GitConnectionKind,
  t: TFunction,
): string {
  const machine =
    kind === "work"
      ? t("wizard.namePreset.workLaptop")
      : kind === "mixed"
        ? t("wizard.namePreset.thisMachine")
        : t("wizard.namePreset.personalLaptop");
  const tool =
    key === "claude_code"
      ? t("settings.provider.claudeCode")
      : t("wizard.namePreset.extractorTool");
  return `${machine} — ${tool}`;
}

export function getDefaultForgeDisplayNames(
  t: TFunction,
): Record<ForgeProvider, string> {
  return {
    github: t("wizard.namePreset.githubRepos"),
    gitlab: t("wizard.namePreset.gitlabProjects"),
  };
}
