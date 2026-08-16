import type { AgentPolicy } from "@repo/schemas";
import { describe, expect, it } from "vitest";
import {
  buildWebhookUrl,
  CLAUDE_HOOK_SNIPPET,
  disclosureConsequence,
  disclosureSourceLabel,
  formatLastDigest,
  kindInheritsWorkRules,
  KIND_LABELS,
  REPOS_CONFIG_SNIPPET,
  REPOS_CONFIG_TARGET,
  REPOS_DISCOVERY_COMMAND,
  REPOS_LIST_COMMAND,
  resolveEffectiveDisclosure,
} from "./connection-format";

const POLICY: AgentPolicy = {
  disclosureLevel: "detailed",
  blockedTerms: [],
  perEmployer: [
    {
      workExperienceId: "role-1",
      companyName: "Acme Corp",
      disclosureLevel: "summary",
    },
  ],
};

describe("resolveEffectiveDisclosure", () => {
  it("prefers the linked work experience's own level over everything else", () => {
    expect(
      resolveEffectiveDisclosure(
        { workExperienceId: "role-1", disclosureLevelOverride: "full" },
        POLICY,
      ),
    ).toEqual({ level: "summary", source: "work-experience" });
  });

  it("falls back to the per-connection override when the role has no level", () => {
    expect(
      resolveEffectiveDisclosure(
        { workExperienceId: "role-2", disclosureLevelOverride: "full" },
        POLICY,
      ),
    ).toEqual({ level: "full", source: "connection" });
  });

  it("falls back to the account default when neither is set", () => {
    expect(
      resolveEffectiveDisclosure(
        { workExperienceId: null, disclosureLevelOverride: null },
        POLICY,
      ),
    ).toEqual({ level: "detailed", source: "account" });
  });

  /**
   * A user who has never opened the disclosure panel must not be told their
   * employer's name is safe on the strength of an unloaded query.
   */
  it("assumes the restrictive default while the policy is still unknown", () => {
    expect(
      resolveEffectiveDisclosure(
        { workExperienceId: null, disclosureLevelOverride: null },
        undefined,
      ),
    ).toEqual({ level: "summary", source: "account" });
  });
});

describe("disclosure copy", () => {
  it("names the employer in the source label when one is linked", () => {
    expect(disclosureSourceLabel("work-experience", "Acme Corp")).toBe(
      "from Acme Corp's own level",
    );
    expect(disclosureSourceLabel("connection", null)).toBe(
      "from this connection's override",
    );
    expect(disclosureSourceLabel("account", null)).toBe(
      "from your account default",
    );
  });

  it("states plainly that Summary never names the employer", () => {
    expect(disclosureConsequence("summary", "Acme Corp")).toContain(
      "never name Acme Corp",
    );
    expect(disclosureConsequence("detailed", "Acme Corp")).toContain(
      "may name Acme Corp",
    );
    expect(disclosureConsequence("full", "Acme Corp")).toContain(
      "no LinkHub-side restriction",
    );
  });
});

describe("buildWebhookUrl", () => {
  it("builds the forge URL from the connection id, which is how a delivery is attributed", () => {
    expect(
      buildWebhookUrl("https://api.linkhub.example", "github", "conn-1"),
    ).toBe("https://api.linkhub.example/webhooks/github/conn-1");
    expect(
      buildWebhookUrl("https://api.linkhub.example/", "gitlab", "conn-1"),
    ).toBe("https://api.linkhub.example/webhooks/gitlab/conn-1");
  });

  it("has no URL for providers that never receive a webhook", () => {
    expect(
      buildWebhookUrl("https://api.linkhub.example", "claude_code", "conn-1"),
    ).toBeNull();
    expect(
      buildWebhookUrl("https://api.linkhub.example", "extractor", "conn-1"),
    ).toBeNull();
  });
});

describe("formatLastDigest", () => {
  it("says so when a connection has never produced a digest", () => {
    expect(formatLastDigest(null)).toBe("No digest yet");
    expect(formatLastDigest(new Date("2026-03-04T12:00:00Z"))).not.toBe(
      "No digest yet",
    );
  });
});

/**
 * Pinned byte-for-byte against `linkhub-hook print-settings`, whose canonical
 * definition is `claudeSettingsHooks()` in
 * `apps/extractor/src/hook/settings-snippet.ts`. `apps/web` cannot import a Node
 * CLI, so this is the thing that stops the two drifting — and drift here is
 * silent: a malformed hook simply never fires.
 */
describe("CLAUDE_HOOK_SNIPPET", () => {
  it("matches what linkhub-hook print-settings emits, exactly", () => {
    expect(CLAUDE_HOOK_SNIPPET).toBe(
      `{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "linkhub-hook stop",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "linkhub-hook session-end",
            "timeout": 30,
            "async": true
          }
        ]
      }
    ]
  }
}`,
    );
  });
});

describe("KIND_LABELS", () => {
  it("names every kind, including the machine that holds both", () => {
    expect(KIND_LABELS).toEqual({
      personal: "Personal",
      work: "Work",
      mixed: "Personal + work",
    });
  });

  it("treats mixed as work for disclosure purposes", () => {
    expect(kindInheritsWorkRules("personal")).toBe(false);
    expect(kindInheritsWorkRules("work")).toBe(true);
    // Aggregated numbers cannot be attributed back to the personal half, so
    // the safest rule has to win.
    expect(kindInheritsWorkRules("mixed")).toBe(true);
  });
});

describe("repos coverage snippets", () => {
  it("ships a two-path repos.json example the agent can actually read", () => {
    expect(REPOS_CONFIG_TARGET).toBe("~/.linkhub/repos.json");
    expect(JSON.parse(REPOS_CONFIG_SNIPPET)).toEqual({
      repos: ["/home/you/code/linkhub", "/home/you/work/payments-api"],
    });
  });

  it("generates the file in one line without GNU-only flags", () => {
    expect(REPOS_DISCOVERY_COMMAND).toContain("> ~/.linkhub/repos.json");
    expect(REPOS_DISCOVERY_COMMAND).toContain("mkdir -p ~/.linkhub");
    expect(REPOS_DISCOVERY_COMMAND).toContain("-maxdepth 3");
    // `-printf` is GNU find only; `dirname` runs everywhere.
    expect(REPOS_DISCOVERY_COMMAND).not.toContain("-printf");
    expect(REPOS_DISCOVERY_COMMAND).toContain("-exec dirname {} \\;");
    expect(REPOS_DISCOVERY_COMMAND.split("\n")).toHaveLength(1);
  });

  it("never redirects over the extractor's own config file", () => {
    // extractor.json holds the connection id; `>` onto it would erase it.
    expect(REPOS_LIST_COMMAND).not.toContain("> ~/");
    expect(REPOS_LIST_COMMAND.split("\n")).toHaveLength(1);
  });
});
