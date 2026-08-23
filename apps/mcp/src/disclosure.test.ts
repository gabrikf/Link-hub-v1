import { describe, expect, it, vi } from "vitest";
import {
  AGENT_DISCLOSURE_LEVELS,
  DEFAULT_AGENT_DISCLOSURE_LEVEL,
  type AgentDisclosureLevel,
  type AgentPolicy,
} from "@repo/schemas";
import { LinkHubApiClient, LinkHubApiError } from "./api-client.js";
import {
  levelInfo,
  loadDisclosureContext,
  renderPolicyForToolDescription,
  renderPolicyResource,
  type DisclosureContext,
} from "./disclosure.js";

/**
 * Characterization suite for the disclosure surface — the highest-value bug
 * class in this product. Every assertion below describes what the code does
 * TODAY, so a later fix has to change a test on purpose rather than by
 * accident. Where today's behaviour looks wrong it is marked, not corrected.
 */

/**
 * A client whose only reachable behaviour is the stubbed method. The port is a
 * dead one on purpose: if a test ever forgets to stub, it fails loudly instead
 * of quietly hitting a real API.
 */
function makeClient(): LinkHubApiClient {
  return new LinkHubApiClient({
    apiUrl: "http://127.0.0.1:9",
    token: "lh_pat_test",
  });
}

function policy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
  return {
    disclosureLevel: "detailed",
    blockedTerms: [],
    perEmployer: [],
    ...overrides,
  };
}

function contextFor(
  level: AgentDisclosureLevel,
  overrides: Partial<DisclosureContext> = {},
): DisclosureContext {
  return {
    level,
    info: levelInfo(level),
    blockedTerms: [],
    degraded: false,
    ...overrides,
  };
}

const EVERY_LEVEL = AGENT_DISCLOSURE_LEVELS.map((entry) => entry.value);

// ───────────────────────────────────────────────────────────────────────────
// The invariant everything else leans on
// ───────────────────────────────────────────────────────────────────────────

describe("the fail-closed invariant", () => {
  it("treats the FIRST catalogue entry as the strictest level", () => {
    // `levelInfo` falls back to AGENT_DISCLOSURE_LEVELS[0] and
    // `loadDisclosureContext` falls back to DEFAULT_AGENT_DISCLOSURE_LEVEL.
    // Both fallbacks are only safe while those two are the same, most
    // restrictive, level. Reordering the catalogue in @repo/schemas without
    // touching this file would silently turn the fallback permissive — this
    // test is the tripwire for that.
    expect(AGENT_DISCLOSURE_LEVELS[0].value).toBe(
      DEFAULT_AGENT_DISCLOSURE_LEVEL,
    );
    expect(AGENT_DISCLOSURE_LEVELS[0].value).toBe("summary");
  });

  it("gives the strictest level the largest block list", () => {
    const strictest = AGENT_DISCLOSURE_LEVELS[0];
    for (const entry of AGENT_DISCLOSURE_LEVELS.slice(1)) {
      expect(strictest.blocks.length).toBeGreaterThanOrEqual(
        entry.blocks.length,
      );
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// levelInfo
// ───────────────────────────────────────────────────────────────────────────

describe("levelInfo", () => {
  it.each(EVERY_LEVEL)("returns the catalogue entry for %s", (level) => {
    const info = levelInfo(level);
    expect(info.value).toBe(level);
    expect(AGENT_DISCLOSURE_LEVELS).toContain(info);
  });

  it("falls back to the strictest entry for a level outside the catalogue", () => {
    // The runtime really can reach this: `LinkHubApiClient.request` does
    // `JSON.parse(text) as T` with no schema parse, so an API that grew a
    // fourth level would hand `levelInfo` a string TypeScript never saw.
    const unmapped = "confidential" as AgentDisclosureLevel;

    const info = levelInfo(unmapped);

    expect(info).toBe(AGENT_DISCLOSURE_LEVELS[0]);
    expect(info.value).toBe(DEFAULT_AGENT_DISCLOSURE_LEVEL);
  });

  it("falls back to the strictest entry for an empty level", () => {
    const info = levelInfo("" as AgentDisclosureLevel);
    expect(info.value).toBe(DEFAULT_AGENT_DISCLOSURE_LEVEL);
  });

  it("returns the shared catalogue object, not a copy", () => {
    expect(levelInfo("full")).toBe(
      AGENT_DISCLOSURE_LEVELS.find((entry) => entry.value === "full"),
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// loadDisclosureContext
// ───────────────────────────────────────────────────────────────────────────

describe("loadDisclosureContext", () => {
  it("passes the live policy through when the fetch succeeds", async () => {
    const client = makeClient();
    vi.spyOn(client, "getAgentPolicy").mockResolvedValue(
      policy({ disclosureLevel: "full", blockedTerms: ["Acme", "Nightingale"] }),
    );

    const context = await loadDisclosureContext(client);

    expect(context.level).toBe("full");
    expect(context.info.value).toBe("full");
    expect(context.blockedTerms).toEqual(["Acme", "Nightingale"]);
    expect(context.degraded).toBe(false);
    expect(context.degradedReason).toBeUndefined();
  });

  it("ignores perEmployer overrides — only the account level reaches the context", async () => {
    const client = makeClient();
    vi.spyOn(client, "getAgentPolicy").mockResolvedValue(
      policy({
        disclosureLevel: "full",
        perEmployer: [
          {
            workExperienceId: "we_1",
            companyName: "Acme",
            disclosureLevel: "summary",
          },
        ],
      }),
    );

    const context = await loadDisclosureContext(client);

    // CHARACTERIZATION: this is today's behaviour. The MCP server renders only
    // the ACCOUNT level; the stricter per-employer override never appears in
    // any tool description, prompt or resource. It is enforced server-side by
    // `get_work_context` redaction instead, which is why this is not a leak.
    expect(context.level).toBe("full");
    expect(context.info.blocks).toEqual([]);
  });

  it("fails CLOSED to the strictest level when the fetch rejects", async () => {
    const client = makeClient();
    vi.spyOn(client, "getAgentPolicy").mockRejectedValue(
      new Error("fetch failed"),
    );

    const context = await loadDisclosureContext(client);

    expect(context.level).toBe(DEFAULT_AGENT_DISCLOSURE_LEVEL);
    expect(context.level).toBe(AGENT_DISCLOSURE_LEVELS[0].value);
    expect(context.info).toBe(AGENT_DISCLOSURE_LEVELS[0]);
    expect(context.blockedTerms).toEqual([]);
    expect(context.degraded).toBe(true);
    expect(context.degradedReason).toBe("fetch failed");
  });

  it("carries the 403 missing-scope message as the degraded reason", async () => {
    const client = makeClient();
    const missingScope = new LinkHubApiError(
      "Your token is missing the profile:read scope — create a new token in " +
        "LinkHub settings (Settings → Personal access tokens → Create token) " +
        "with profile:read checked, and set it as LINKHUB_API_TOKEN. Without " +
        "it this server cannot read your disclosure policy, so it will assume " +
        "the strictest one.",
      403,
    );
    vi.spyOn(client, "getAgentPolicy").mockRejectedValue(missingScope);

    const context = await loadDisclosureContext(client);

    expect(context.degraded).toBe(true);
    expect(context.level).toBe(DEFAULT_AGENT_DISCLOSURE_LEVEL);
    expect(context.degradedReason).toContain("profile:read");
    // The HTTP status is dropped — only the message survives onto the context.
    expect(context.degradedReason).toBe(missingScope.message);
  });

  it("stringifies a non-Error rejection instead of crashing", async () => {
    const client = makeClient();
    vi.spyOn(client, "getAgentPolicy").mockRejectedValue("socket hang up");

    const context = await loadDisclosureContext(client);

    expect(context.degraded).toBe(true);
    expect(context.level).toBe(DEFAULT_AGENT_DISCLOSURE_LEVEL);
    expect(context.degradedReason).toBe("socket hang up");
  });

  it.each([
    ["undefined", undefined, "undefined"],
    ["null", null, "null"],
  ])("stringifies a %s rejection", async (_label, thrown, expected) => {
    const client = makeClient();
    vi.spyOn(client, "getAgentPolicy").mockRejectedValue(thrown);

    const context = await loadDisclosureContext(client);

    expect(context.degraded).toBe(true);
    expect(context.degradedReason).toBe(expected);
  });

  it("never rejects, whatever the client does", async () => {
    const client = makeClient();
    vi.spyOn(client, "getAgentPolicy").mockRejectedValue(
      new LinkHubApiError("Could not reach the LinkHub API", undefined),
    );

    await expect(loadDisclosureContext(client)).resolves.toMatchObject({
      degraded: true,
    });
  });

  it("stores an off-contract level verbatim while info silently degrades", async () => {
    const client = makeClient();
    // CHARACTERIZATION: this is today's behaviour and it is a latent contract
    // gap — `LinkHubApiClient.request` never `.parse()`s the response through
    // `agentPolicySchema`, so an unknown level flows straight into the context.
    // The SAFE half is that `info` falls back to the strictest entry, and every
    // rendering surface reads `context.info`, never `context.level`. The one
    // place `context.level` is read raw is `get_work_context`'s policy note.
    vi.spyOn(client, "getAgentPolicy").mockResolvedValue(
      policy({
        disclosureLevel: "confidential" as AgentPolicy["disclosureLevel"],
      }),
    );

    const context = await loadDisclosureContext(client);

    expect(context.level).toBe("confidential");
    expect(context.info.value).toBe("summary");
    // Not flagged as degraded, because the fetch itself succeeded.
    expect(context.degraded).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// renderPolicyForToolDescription
// ───────────────────────────────────────────────────────────────────────────

describe("renderPolicyForToolDescription", () => {
  it.each(EVERY_LEVEL)(
    "renders every block entry for %s verbatim",
    (level) => {
      const info = levelInfo(level);
      const text = renderPolicyForToolDescription(contextFor(level));

      for (const block of info.blocks) {
        expect(text).toContain(block);
      }
      for (const allow of info.allows) {
        expect(text).toContain(allow);
      }
      expect(text).toContain(`the user's level is "${level}"`);
      expect(text).toContain(info.label);
      expect(text).toContain(info.shortDescription);
    },
  );

  it("uses the plain prefix and a YOU MUST NOT SAY list when not degraded", () => {
    const text = renderPolicyForToolDescription(contextFor("summary"));

    expect(text.startsWith("DISCLOSURE POLICY: ")).toBe(true);
    expect(text).toContain("YOU MUST NOT SAY:");
    expect(text).not.toContain("could not be read from LinkHub");
  });

  it("announces the fallback in the prefix when degraded", () => {
    const text = renderPolicyForToolDescription(
      contextFor(DEFAULT_AGENT_DISCLOSURE_LEVEL, {
        degraded: true,
        degradedReason: "fetch failed",
      }),
    );

    expect(text.startsWith("DISCLOSURE POLICY (could not be read")).toBe(true);
    expect(text).toContain("assuming the STRICTEST level");
    expect(text).toContain("profile:read");
    // The reason itself is NOT in the tool description — only in the resource.
    expect(text).not.toContain("fetch failed");
  });

  it("swaps the block list for a sentence at `full`, where nothing is blocked", () => {
    const text = renderPolicyForToolDescription(contextFor("full"));

    expect(levelInfo("full").blocks).toEqual([]);
    expect(text).not.toContain("YOU MUST NOT SAY:");
    expect(text).toContain(
      "Nothing is blocked at this level beyond the user's own blocked terms.",
    );
  });

  it("always repeats the server-side enforcement and the no-inference rule", () => {
    for (const level of EVERY_LEVEL) {
      const text = renderPolicyForToolDescription(contextFor(level));
      expect(text).toContain("LinkHub ENFORCES this server-side");
      expect(text).toContain("rejected with a 400 naming the term");
      expect(text).toContain("Never infer the employer from git remotes");
      expect(text).toContain("get_work_context");
    }
  });

  it("never names the user's own blocked terms", () => {
    const text = renderPolicyForToolDescription(
      contextFor("full", { blockedTerms: ["Nightingale", "Acme"] }),
    );

    // CHARACTERIZATION: this is today's behaviour and it is WRONG — at `full`
    // the level blocks NOTHING, so the banned-terms list is the only remaining
    // constraint, and the tool description tells the agent it exists ("beyond
    // the user's own blocked terms") without ever naming a single term. The
    // agent has to call `get_disclosure_policy` or read the resource to learn
    // them. The backstop is the server-side 400.
    expect(text).not.toContain("Nightingale");
    expect(text).not.toContain("Acme");
    expect(text).toContain("the user's own blocked terms");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// renderPolicyResource
// ───────────────────────────────────────────────────────────────────────────

describe("renderPolicyResource", () => {
  it.each(EVERY_LEVEL)("renders every block entry for %s verbatim", (level) => {
    const info = levelInfo(level);
    const text = renderPolicyResource(contextFor(level));

    for (const block of info.blocks) {
      expect(text).toContain(`- ${block}`);
    }
    for (const allow of info.allows) {
      expect(text).toContain(`- ${allow}`);
    }
    expect(text).toContain(`**Level: \`${level}\` — ${info.label}**`);
    expect(text.startsWith("# Active disclosure policy")).toBe(true);
  });

  it("omits the fallback banner when the policy was read", () => {
    const text = renderPolicyResource(contextFor("detailed"));

    expect(text).not.toContain("This is a fallback");
    expect(text.startsWith("# Active disclosure policy\n\n")).toBe(true);
  });

  it("puts the fallback banner and the reason directly under the heading", () => {
    const text = renderPolicyResource(
      contextFor(DEFAULT_AGENT_DISCLOSURE_LEVEL, {
        degraded: true,
        degradedReason: "HTTP 403 missing profile:read",
      }),
    );

    expect(text).toContain("> **This is a fallback.**");
    expect(text).toContain("strictest level is assumed");
    expect(text).toContain("Reason: HTTP 403 missing profile:read");
    expect(
      text.startsWith("# Active disclosure policy\n> **This is a fallback.**"),
    ).toBe(true);
  });

  it("says `unknown` when degraded without a reason", () => {
    const text = renderPolicyResource(
      contextFor(DEFAULT_AGENT_DISCLOSURE_LEVEL, { degraded: true }),
    );

    expect(text).toContain("Reason: unknown");
  });

  it("renders the banned-terms section as bullets when terms exist", () => {
    const text = renderPolicyResource(
      contextFor("full", { blockedTerms: ["Acme Corp", "Project Nightingale"] }),
    );

    expect(text).toContain("## Terms the user banned outright");
    expect(text).toContain("These are blocked at EVERY level, including `full`");
    expect(text).toContain("- Acme Corp");
    expect(text).toContain("- Project Nightingale");
  });

  it("drops the banned-terms section entirely when there are none", () => {
    const text = renderPolicyResource(contextFor("summary"));

    expect(text).not.toContain("## Terms the user banned outright");
  });

  it("leaves a dangling `below` reference at `full` with no banned terms", () => {
    const text = renderPolicyResource(contextFor("full"));

    // CHARACTERIZATION: today's behaviour. The must-not-say placeholder points
    // at a section that is not rendered, so the resource reads "Nothing beyond
    // the user's own blocked terms below." with nothing below it. Cosmetic —
    // the constraint it describes (there is none) is still accurate.
    expect(text).toContain(
      "_Nothing beyond the user's own blocked terms below._",
    );
    expect(text).not.toContain("## Terms the user banned outright");
  });

  it("omits the banned-terms section in the degraded case with no note that they are unknown", () => {
    // A degraded context always carries `blockedTerms: []` — see
    // loadDisclosureContext. So the resource cannot distinguish "the user has
    // no banned terms" from "we could not read them". The fallback banner is
    // the only hint, and it talks about the LEVEL, not the terms.
    const text = renderPolicyResource(
      contextFor(DEFAULT_AGENT_DISCLOSURE_LEVEL, {
        degraded: true,
        degradedReason: "fetch failed",
      }),
    );

    expect(text).not.toContain("## Terms the user banned outright");
    expect(text).toContain("> **This is a fallback.**");
  });

  it("always carries the enforcement, provenance and change sections", () => {
    for (const level of EVERY_LEVEL) {
      const text = renderPolicyResource(contextFor(level));
      expect(text).toContain("## How this is enforced");
      expect(text).toContain("## Where employment facts come from");
      expect(text).toContain("## Changing it");
      expect(text).toContain("rejected with HTTP 400");
      expect(text).toContain(
        "A personal access token cannot widen its own\npolicy",
      );
    }
  });
});
