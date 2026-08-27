import {
  AGENT_DISCLOSURE_LEVELS,
  DEFAULT_AGENT_DISCLOSURE_LEVEL,
  type AgentDisclosureLevel,
  type AgentPolicy,
  type DigestCadence,
  type GitConnection,
  type GitConnectionKind,
  type GitConnectionProvider,
} from "@repo/schemas";
import type { TFunction } from "i18next";
import i18n from "../../../i18n";
import { formatDate } from "./token-format";

/** Scroll target — the Add source button and the panel are far apart. */
export const CONNECTIONS_PANEL_ID = "connected-activity-sources";

/*
 * Everything in this file that a user reads resolves through the i18next
 * singleton at READ time, not at import time, and keeps its original exported
 * shape — a `Record<..., string>` stays a `Record<..., string>`, a function
 * keeps its signature.
 *
 * That shape matters twice. `connection-format.test.ts` calls these directly
 * and asserts the literal English strings; with `en-US` active in tests they
 * still return exactly that, so the test needs no edit. And the wizard imports
 * `PROVIDER_LABELS` as a plain record and indexes it — converting it to a
 * function of `t` breaks that call site at runtime, not at compile time.
 *
 * Hence getters: same type, same access syntax, resolved fresh on every read,
 * so a language switch relabels them instead of freezing whatever language the
 * tab happened to start in.
 */
export const PROVIDER_LABELS: Record<GitConnectionProvider, string> = {
  get github() {
    return i18n.t("enum.platform.github");
  },
  get gitlab() {
    return i18n.t("settings.provider.gitlab");
  },
  get claude_code() {
    return i18n.t("settings.provider.claudeCode");
  },
  get extractor() {
    return i18n.t("settings.provider.localExtractor");
  },
};

/** One line each, shown under the provider picker so the choice is informed. */
export function getProviderDescriptions(
  t: TFunction,
): Record<GitConnectionProvider, string> {
  return {
    github: t("settings.provider.githubDescription"),
    gitlab: t("settings.provider.gitlabDescription"),
    claude_code: t("settings.provider.hookDescription"),
    extractor: t("settings.provider.extractorDescription"),
  };
}

/** Providers whose setup involves a signed webhook and a one-time secret. */
export const FORGE_PROVIDERS = ["github", "gitlab"] as const;

export function isForgeProvider(
  provider: GitConnectionProvider,
): provider is (typeof FORGE_PROVIDERS)[number] {
  return provider === "github" || provider === "gitlab";
}

/**
 * `mixed` is one machine holding both personal side projects and work repos.
 * It is not a softer "work": once personal and work numbers are aggregated,
 * nothing can attribute a figure back to the personal half, so the server holds
 * a mixed connection to the WORK disclosure rules. The label says "Personal +
 * work" rather than "Both" so a connection row states the fact, not the option.
 */
export const KIND_LABELS: Record<GitConnectionKind, string> = {
  get personal() {
    return i18n.t("common.personal");
  },
  get work() {
    return i18n.t("common.work");
  },
  get mixed() {
    return i18n.t("settings.kind.personalAndWork");
  },
};

/**
 * The one line that must travel with every mixed-kind control, and what "Both"
 * means under the kind selector.
 *
 * Functions rather than constants: a `const` string is evaluated once at import
 * time, which is exactly the staleness the getters above avoid. Both are read
 * only from components, so the call is free.
 */
export function mixedKindRule(): string {
  return i18n.t("settings.kind.mixedExplainer");
}

export function mixedKindHelper(): string {
  return i18n.t("settings.kind.bothOption");
}

/** A mixed connection inherits an employer's rules, exactly like a work one. */
export function kindInheritsWorkRules(kind: GitConnectionKind): boolean {
  return kind !== "personal";
}

/** Weekly is the floor — daily was removed so a profile can't become a firehose. */
export function getCadenceLabels(t: TFunction): Record<DigestCadence, string> {
  return {
    weekly: t("settings.cadence.weekly"),
    biweekly: t("settings.cadence.biweekly"),
    monthly: t("settings.cadence.monthly"),
    off: t("common.off"),
  };
}

export const CADENCE_OPTIONS: DigestCadence[] = [
  "weekly",
  "biweekly",
  "monthly",
  "off",
];

export function formatLastDigest(value: Date | null): string {
  return value ? formatDate(value) : i18n.t("settings.cadence.noDigestYet");
}

/**
 * The URL the user pastes into the forge. The connection id is the path — it is
 * how a delivery is attributed, and it only exists once the server has answered
 * the create call.
 */
export function buildWebhookUrl(
  apiUrl: string,
  provider: GitConnectionProvider,
  connectionId: string,
): string | null {
  if (!isForgeProvider(provider)) {
    return null;
  }

  return `${apiUrl.replace(/\/+$/, "")}/webhooks/${provider}/${connectionId}`;
}

/* ------------------------------------------------------------------ *
 * Effective disclosure level
 * ------------------------------------------------------------------ */

/** Which of the three rules actually decided the level in force. */
export type DisclosureSource = "work-experience" | "connection" | "account";

export type EffectiveDisclosure = {
  level: AgentDisclosureLevel;
  source: DisclosureSource;
};

/**
 * Resolves the level a WORK connection's digests will actually be held to.
 *
 * Precedence, most specific first:
 *
 *  1. the linked work experience's own level — `AgentPolicy.perEmployer` only
 *     carries roles that override, so a hit here is a deliberate per-employer
 *     decision the user already made on this same screen;
 *  2. the per-connection override;
 *  3. the account default.
 *
 * A `personal` connection has no employer to inherit from, so it resolves at
 * the account level too — the UI simply does not present it as a consequence,
 * because there is no third party whose name is at stake.
 */
export function resolveEffectiveDisclosure(
  connection: Pick<GitConnection, "workExperienceId" | "disclosureLevelOverride">,
  policy: AgentPolicy | undefined,
): EffectiveDisclosure {
  const roleOverride = connection.workExperienceId
    ? policy?.perEmployer.find(
        (entry) => entry.workExperienceId === connection.workExperienceId,
      )
    : undefined;

  if (roleOverride) {
    return { level: roleOverride.disclosureLevel, source: "work-experience" };
  }

  if (connection.disclosureLevelOverride) {
    return { level: connection.disclosureLevelOverride, source: "connection" };
  }

  return {
    level: policy?.disclosureLevel ?? DEFAULT_AGENT_DISCLOSURE_LEVEL,
    source: "account",
  };
}

/**
 * The level's short NAME, translated.
 *
 * Only the name. `AGENT_DISCLOSURE_LEVELS` in @repo/schemas also carries
 * `shortDescription`, `allows` and `blocks`, and that prose is injected into
 * the MCP system prompt — it is written as instructions an agent follows, not
 * as UI copy, and translating it there would translate an agent's prompt. The
 * `defaultValue` keeps a level the catalogue does not know about rendering as
 * the schema's own English rather than as a raw key.
 */
export function disclosureLevelLabel(level: AgentDisclosureLevel): string {
  const fallback =
    AGENT_DISCLOSURE_LEVELS.find((entry) => entry.value === level)?.label ??
    level;

  return i18n.t(`enum.disclosureLevel.${level}`, { defaultValue: fallback });
}

/** Where the level came from, phrased for the row it is rendered on. */
export function disclosureSourceLabel(
  source: DisclosureSource,
  companyName: string | null,
): string {
  if (source === "work-experience") {
    return companyName
      ? i18n.t("settings.levelSource.company", { companyName })
      : i18n.t("settings.levelSource.role");
  }

  if (source === "connection") {
    return i18n.t("settings.levelSource.connection");
  }

  return i18n.t("settings.levelSource.account");
}

/**
 * The consequence, stated before the user turns auto-posting on.
 *
 * Written as a promise rather than a hedge because it is enforced server-side:
 * a digest naming a blocked employer is rejected, not merely discouraged.
 */
export function disclosureConsequence(
  level: AgentDisclosureLevel,
  companyName: string | null,
): string {
  const employer = companyName ?? i18n.t("settings.levelEffect.thisEmployer");

  if (level === "summary") {
    return i18n.t("settings.levelEffect.none", { employer });
  }

  if (level === "detailed") {
    return i18n.t("settings.levelEffect.summary", { employer });
  }

  return i18n.t("settings.levelEffect.full", { employer });
}

/* ------------------------------------------------------------------ *
 * Setup instructions
 * ------------------------------------------------------------------ */

export function getGithubWebhookSteps(t: TFunction): readonly string[] {
  return [
    t("settings.webhook.githubOpen"),
    t("settings.webhook.payloadUrl"),
    t("settings.webhook.contentType"),
    t("settings.webhook.secret"),
    t("settings.webhook.githubEvents"),
  ];
}

export function getGitlabWebhookSteps(t: TFunction): readonly string[] {
  return [
    t("settings.webhook.gitlabOpen"),
    t("settings.webhook.url"),
    t("settings.webhook.gitlabSecret"),
    t("settings.webhook.gitlabSignature"),
    t("settings.webhook.gitlabTriggers"),
  ];
}

/* ------------------------------------------------------------------ *
 * The Claude Code hook
 * ------------------------------------------------------------------ */

/**
 * Byte-identical to what `linkhub-hook print-settings` emits.
 *
 * The canonical definition is `claudeSettingsHooks()` in
 * `apps/extractor/src/hook/settings-snippet.ts`, which is written as data
 * precisely so this page can render the same block. It is reproduced (not
 * imported) because `apps/web` does not depend on the extractor package — a
 * browser bundle has no use for a Node CLI. `claude-hook-snippet.test.ts`
 * pins the exact output so a change over there cannot silently drift from here:
 * a hook declared even slightly wrong never fires, and nothing reports it.
 */
const CLAUDE_HOOK_SETTINGS = {
  hooks: {
    Stop: [
      {
        // An empty matcher means "every occurrence of this event".
        matcher: "",
        hooks: [
          {
            type: "command",
            command: "linkhub-hook stop",
            timeout: 5,
          },
        ],
      },
    ],
    SessionEnd: [
      {
        matcher: "",
        hooks: [
          {
            type: "command",
            command: "linkhub-hook session-end",
            timeout: 30,
            // Non-blocking: SessionEnd hooks share a ~1.5s budget, which is not
            // enough for an HTTP round trip.
            async: true,
          },
        ],
      },
    ],
  },
} as const;

export const CLAUDE_HOOK_SNIPPET = JSON.stringify(CLAUDE_HOOK_SETTINGS, null, 2);

export const CLAUDE_HOOK_TARGET = "~/.claude/settings.json";

/** The one line that must travel with the snippet wherever it is shown. */
export function claudeHookSummary(): string {
  return i18n.t("settings.local.hookRecords");
}

export function claudeHookNotes(): readonly string[] {
  return [
    i18n.t("settings.local.hookPaste"),
    i18n.t("settings.local.installCli"),
    i18n.t("settings.local.hookConfig"),
  ];
}

/** Setup for the local extractor CLI, which has no webhook and no hook. */
export function getExtractorNotes(t: TFunction): readonly string[] {
  return [t("settings.local.runExtract"), t("settings.local.extractorConfig")];
}

/* ------------------------------------------------------------------ *
 * Wizard snippets with real values
 * ------------------------------------------------------------------ */

/** Where both the hook and the extractor CLI read their connection id from. */
export const EXTRACTOR_CONFIG_TARGET = "~/.linkhub/extractor.json";

/**
 * The config file with the REAL connection id baked in. The wizard renders it
 * only after the create call answers, so the user never types a UUID by hand.
 */
export function buildExtractorConfig(connectionId: string): string {
  return JSON.stringify(
    { connectionId, includeAgentSummary: false },
    null,
    2,
  );
}

/* ------------------------------------------------------------------ *
 * Covering every repo, not just the current directory
 * ------------------------------------------------------------------ */

/**
 * The repo roster the MCP `weekly_update` workflow reads first. Without it the
 * agent can only see the repository the session was started in, which quietly
 * turns a week of work across four projects into a post about one.
 *
 * `~/.linkhub/extractor.json`'s own `repos` array is the fallback, and the
 * current directory is the last resort — so this file is a refinement, never a
 * prerequisite.
 */
export const REPOS_CONFIG_TARGET = "~/.linkhub/repos.json";

export const REPOS_CONFIG_SNIPPET = JSON.stringify(
  {
    repos: ["/home/you/code/linkhub", "/home/you/work/payments-api"],
  },
  null,
  2,
);

/**
 * Generates the file from a projects folder in one line.
 *
 * `-exec dirname` rather than GNU `-printf '%h'` so it also runs on macOS;
 * `-maxdepth 3` so it does not descend into vendored checkouts; `jq -R -s`
 * because the output is JSON and hand-rolled quoting breaks on the first path
 * with a space in it.
 */
export const REPOS_DISCOVERY_COMMAND =
  "mkdir -p ~/.linkhub && find ~/code -maxdepth 3 -type d -name .git -exec dirname {} \\; | " +
  "jq -R -s '{repos: (split(\"\\n\") | map(select(length > 0)))}' > ~/.linkhub/repos.json";

/**
 * The extractor keeps its roster in its own settings file (`repos`, used when
 * no paths are given on the command line), so it gets the same list without
 * being told to write a file the CLI does not read. Printing rather than
 * redirecting on purpose: `>` onto extractor.json would erase the connection
 * id that file exists to hold.
 */
export function extractorReposTarget(): string {
  return i18n.t("settings.local.mergeThisKey");
}

export function extractorReposConsequence(): string {
  return i18n.t("settings.local.reposList");
}

export const REPOS_LIST_COMMAND =
  "find ~/code -maxdepth 3 -type d -name .git -exec dirname {} \\; | " +
  "jq -R -s '(split(\"\\n\") | map(select(length > 0)))'";

export function reposDiscoveryNote(): string {
  return i18n.t("settings.local.changeCodePath");
}

export function reposCoverageConsequence(): string {
  return i18n.t("settings.local.repoScope");
}

/** `export LINKHUB_API_TOKEN=...` with the real token, or a placeholder. */
export function buildTokenExport(token: string | null): string {
  return `export LINKHUB_API_TOKEN=${token ?? "lh_pat_xxxxxxxxxxxxxxxxxxxxxxxx"}`;
}

/**
 * The extract-then-review flow. `npx linkhub-extract` on purpose — the CLI is
 * presented as an installed tool, never as "clone the repository".
 */
export const EXTRACTOR_RUN_COMMAND = "npx linkhub-extract ~/path/to/repo";

export const EXTRACTOR_UPLOAD_COMMAND =
  "npx linkhub-extract upload linkhub-activity.json";

/** Optional weekly automation. `--yes` skips the review stop — say so. */
export const EXTRACTOR_CRON_SNIPPET =
  "0 18 * * 5 npx linkhub-extract --yes ~/path/to/repo";

export function extractorCronCaution(): string {
  return i18n.t("settings.local.yesFlag");
}
