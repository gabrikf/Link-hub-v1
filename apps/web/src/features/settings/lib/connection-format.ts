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
import { formatDate } from "./token-format";

/** Scroll target — the Add source button and the panel are far apart. */
export const CONNECTIONS_PANEL_ID = "connected-activity-sources";

export const PROVIDER_LABELS: Record<GitConnectionProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  claude_code: "Claude Code",
  extractor: "Local extractor",
};

/** One line each, shown under the provider picker so the choice is informed. */
export const PROVIDER_DESCRIPTIONS: Record<GitConnectionProvider, string> = {
  github:
    "A repository webhook. GitHub tells LinkHub about merged pull requests, reviews and releases.",
  gitlab:
    "A project webhook. GitLab tells LinkHub about merged merge requests, reviews and releases.",
  claude_code:
    "A local hook. Records what your coding agent worked on and uploads it when a session ends.",
  extractor:
    "The linkhub-extract CLI. Reads local git history on your machine; you review the file before it is uploaded.",
};

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
  personal: "Personal",
  work: "Work",
  mixed: "Personal + work",
};

/** The one line that must travel with every mixed-kind control. */
export const MIXED_KIND_RULE =
  "Mixed activity is held to your work disclosure rules — once the numbers are added together, the safest rule has to win.";

/** What "Both" means, shown under the kind selector rather than guessed at. */
export const MIXED_KIND_HELPER =
  "Both — one machine that holds personal side projects and work repos.";

/** A mixed connection inherits an employer's rules, exactly like a work one. */
export function kindInheritsWorkRules(kind: GitConnectionKind): boolean {
  return kind !== "personal";
}

/** Weekly is the floor — daily was removed so a profile can't become a firehose. */
export const CADENCE_LABELS: Record<DigestCadence, string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  off: "Off",
};

export const CADENCE_OPTIONS: DigestCadence[] = [
  "weekly",
  "biweekly",
  "monthly",
  "off",
];

export function formatLastDigest(value: Date | null): string {
  return value ? formatDate(value) : "No digest yet";
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

export function disclosureLevelLabel(level: AgentDisclosureLevel): string {
  return (
    AGENT_DISCLOSURE_LEVELS.find((entry) => entry.value === level)?.label ??
    level
  );
}

/** Where the level came from, phrased for the row it is rendered on. */
export function disclosureSourceLabel(
  source: DisclosureSource,
  companyName: string | null,
): string {
  if (source === "work-experience") {
    return companyName
      ? `from ${companyName}'s own level`
      : "from the linked role's own level";
  }

  if (source === "connection") {
    return "from this connection's override";
  }

  return "from your account default";
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
  const employer = companyName ?? "this employer";

  if (level === "summary") {
    return `Digests from this connection describe what you built and never name ${employer}.`;
  }

  if (level === "detailed") {
    return `Digests from this connection may name ${employer} and public work, but never internal repositories, codenames, tickets or customers.`;
  }

  return `Digests from this connection carry no LinkHub-side restriction — ${employer} can be named along with anything else in your profile.`;
}

/* ------------------------------------------------------------------ *
 * Setup instructions
 * ------------------------------------------------------------------ */

export const GITHUB_WEBHOOK_STEPS: readonly string[] = [
  "In the repository, open Settings → Webhooks → Add webhook. You need admin or owner on that repository.",
  "Payload URL: the URL above.",
  "Content type: application/json. GitHub defaults to application/x-www-form-urlencoded, which LinkHub cannot verify or read — every delivery would fail.",
  "Secret: the value above.",
  "Under events, send pull requests, pull request reviews and releases.",
];

export const GITLAB_WEBHOOK_STEPS: readonly string[] = [
  "In the project, open Settings → Webhooks → Add new webhook. The Maintainer role is enough — you do not need to be the Owner.",
  "URL: the URL above.",
  "Secret token: the value above. Do not click Generate — LinkHub already generated this one and verifies against it.",
  "GitLab 19.0+ signs deliveries with a webhook-signature header. LinkHub prefers that signed path whenever it is present and falls back to the legacy X-Gitlab-Token, so nothing extra is needed either way.",
  "Under triggers, enable merge request events and releases.",
];

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
export const CLAUDE_HOOK_SUMMARY =
  "The hook records session metadata locally on every turn and uploads it when a session ends — no network calls while you are working.";

export const CLAUDE_HOOK_NOTES: readonly string[] = [
  "Paste it into ~/.claude/settings.json for every project, or .claude/settings.json for one. If the file already has a \"hooks\" key, merge the Stop and SessionEnd arrays into it.",
  "Install the CLI first: npm install -g linkhub-extract (or npx linkhub-extract@latest) — the package ships both the linkhub-extract and linkhub-hook binaries.",
  "Put this connection's id in ~/.linkhub/extractor.json and a token with the activity:write scope in LINKHUB_API_TOKEN, or the hook spools quietly and uploads nothing.",
];

/** Setup for the local extractor CLI, which has no webhook and no hook. */
export const EXTRACTOR_NOTES: readonly string[] = [
  "Run linkhub-extract against your repositories. It reads local git history, writes a JSON file and stops — nothing is uploaded until you run the upload command yourself.",
  "Put this connection's id in ~/.linkhub/extractor.json, and use a token with the activity:write scope, which is not granted by default.",
];

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
export const EXTRACTOR_REPOS_TARGET =
  "~/.linkhub/extractor.json — merge this key in";

export const EXTRACTOR_REPOS_CONSEQUENCE =
  "Without a repos list, the extractor only reads the paths you type on the command line.";

export const REPOS_LIST_COMMAND =
  "find ~/code -maxdepth 3 -type d -name .git -exec dirname {} \\; | " +
  "jq -R -s '(split(\"\\n\") | map(select(length > 0)))'";

export const REPOS_DISCOVERY_NOTE =
  "Change ~/code to the folder your repositories actually live in, then read the file before you trust it.";

export const REPOS_COVERAGE_CONSEQUENCE =
  "Without this, the agent only summarizes the repository it is currently in.";

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

export const EXTRACTOR_CRON_CAUTION =
  "--yes skips the review step: the file uploads without you reading it first. Only automate a repo you have already watched a few uploads from.";
