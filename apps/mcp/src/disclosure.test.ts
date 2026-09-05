import {
  AGENT_DISCLOSURE_LEVELS,
  DEFAULT_AGENT_DISCLOSURE_LEVEL,
  type AgentDisclosureLevel,
  type AgentPolicy,
} from "@repo/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CraftHubApiClient } from "./api-client.js";
import {
  levelInfo,
  loadDisclosureContext,
  renderPolicyForToolDescription,
  renderPolicyResource,
  type DisclosureContext,
} from "./disclosure.js";

/**
 * Characterization tests for the disclosure module — the highest-blast-radius
 * file in `apps/mcp`. It decides what a coding agent is told it may say about
 * the user's employer, so these tests pin TODAY's behaviour rather than the
 * behaviour anyone wishes for. A change that widens the default, drops the
 * fail-closed fallback or loses the "never infer the employer" instruction must
 * break a test here, loudly.
 *
 * Nothing here touches the network: `fetch` is stubbed to throw, and the client
 * is a hand-built stub with only the one method the module actually calls.
 */

/** The narrow slice of the client `loadDisclosureContext` depends on. */
interface PolicySource {
  getAgentPolicy: () => Promise<AgentPolicy>;
}

function asClient(source: PolicySource): CraftHubApiClient {
  return source as unknown as CraftHubApiClient;
}

function clientReturning(policy: AgentPolicy) {
  const getAgentPolicy = vi.fn(async () => policy);
  return { client: asClient({ getAgentPolicy }), getAgentPolicy };
}

function clientRejectingWith(thrown: unknown) {
  const getAgentPolicy = vi.fn(async (): Promise<AgentPolicy> => {
    throw thrown;
  });
  return { client: asClient({ getAgentPolicy }), getAgentPolicy };
}

function policy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
  return {
    disclosureLevel: "summary",
    blockedTerms: [],
    perEmployer: [],
    ...overrides,
  };
}

/** Builds a context directly, for the two pure renderers. */
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

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("no test in this file may touch the network");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DEFAULT_AGENT_DISCLOSURE_LEVEL", () => {
  it("is the strictest level, `summary` — pinned as a literal on purpose", () => {
    // Pinned twice deliberately: once against the constant (so the module keeps
    // using it) and once against the concrete string (so a silent widening of
    // the default to `detailed` or `full` cannot slip through green).
    expect(DEFAULT_AGENT_DISCLOSURE_LEVEL).toBe("summary");
    expect(AGENT_DISCLOSURE_LEVELS[0].value).toBe(
      DEFAULT_AGENT_DISCLOSURE_LEVEL,
    );
    expect(levelInfo(DEFAULT_AGENT_DISCLOSURE_LEVEL).blocks).toContain(
      "Employer and client names",
    );
  });
});

describe("levelInfo", () => {
  it.each(AGENT_DISCLOSURE_LEVELS.map((entry) => entry.value))(
    "returns the matching entry, by identity, for %s",
    (value) => {
      const expected = AGENT_DISCLOSURE_LEVELS.find(
        (entry) => entry.value === value,
      );
      expect(levelInfo(value)).toBe(expected);
      expect(levelInfo(value).value).toBe(value);
    },
  );

  it("pins the shape of each level's contract", () => {
    expect(levelInfo("summary").label).toBe("Summary");
    expect(levelInfo("summary").blocks).toContain("Employer and client names");

    expect(levelInfo("detailed").label).toBe("Detailed");
    expect(levelInfo("detailed").allows).toContain("Employer name");
    expect(levelInfo("detailed").blocks).not.toContain(
      "Employer and client names",
    );

    expect(levelInfo("full").label).toBe("Full");
    expect(levelInfo("full").blocks).toEqual([]);
  });

  it("falls back to the FIRST (strictest) entry for an unrecognised level", () => {
    // A level the enum does not know about — a stale token, a newer api, a
    // typo. Widened through `string` rather than `any`: AGENTS.md forbids `any`.
    const unrecognised: string = "public";
    const info = levelInfo(unrecognised as AgentDisclosureLevel);

    expect(info).toBe(AGENT_DISCLOSURE_LEVELS[0]);
    expect(info.value).toBe("summary");
    expect(info.blocks).toContain("Employer and client names");
  });
});

describe("loadDisclosureContext — happy path", () => {
  it("passes disclosureLevel and blockedTerms through unchanged", async () => {
    const { client, getAgentPolicy } = clientReturning(
      policy({
        disclosureLevel: "detailed",
        blockedTerms: ["Acme Corp", "project-hemlock"],
        perEmployer: [
          {
            workExperienceId: "we_1",
            companyName: "Acme Corp",
            disclosureLevel: "summary",
          },
        ],
      }),
    );

    const context = await loadDisclosureContext(client);

    expect(context.level).toBe("detailed");
    expect(context.info).toBe(levelInfo("detailed"));
    expect(context.blockedTerms).toEqual(["Acme Corp", "project-hemlock"]);
    expect(context.degraded).toBe(false);
    expect(context.degradedReason).toBeUndefined();
    expect(getAgentPolicy).toHaveBeenCalledTimes(1);
  });

  it("does not carry `perEmployer` into the context", () => {
    // CHARACTERIZATION: today's behaviour. Per-employer overrides are resolved
    // server-side (get_work_context returns already-redacted history); the MCP
    // context keeps only the account-level level. Recorded so that a future
    // change which starts relying on perEmployer here is a visible decision.
    return loadDisclosureContext(
      clientReturning(
        policy({
          perEmployer: [
            {
              workExperienceId: "we_1",
              companyName: "Acme Corp",
              disclosureLevel: "full",
            },
          ],
        }),
      ).client,
    ).then((context) => {
      expect(Object.keys(context).sort((a, b) => a.localeCompare(b))).toEqual([
        "blockedTerms",
        "degraded",
        "info",
        "level",
      ]);
    });
  });

  it("keeps `full` as `full` and its empty blocks list", async () => {
    const { client } = clientReturning(
      policy({ disclosureLevel: "full", blockedTerms: ["Initech"] }),
    );

    const context = await loadDisclosureContext(client);

    expect(context.level).toBe("full");
    expect(context.info.blocks).toEqual([]);
    expect(context.blockedTerms).toEqual(["Initech"]);
    expect(context.degraded).toBe(false);
  });
});

describe("loadDisclosureContext — fails closed", () => {
  it("falls back to the default level on a network failure", async () => {
    const message =
      "Could not reach the CraftHub API at http://localhost:3333. " +
      "Make sure the API is running and CRAFTHUB_API_URL is correct. (fetch failed)";
    const { client } = clientRejectingWith(new Error(message));

    const context = await loadDisclosureContext(client);

    expect(context.level).toBe(DEFAULT_AGENT_DISCLOSURE_LEVEL);
    expect(context.level).toBe("summary");
    expect(context.info).toBe(levelInfo(DEFAULT_AGENT_DISCLOSURE_LEVEL));
    expect(context.blockedTerms).toEqual([]);
    expect(context.degraded).toBe(true);
    expect(context.degradedReason).toBe(message);
  });

  it("falls back on a 403 and keeps the missing-scope message as the reason", async () => {
    const message =
      "Your token is missing the profile:read scope — create a new token in " +
      "CraftHub settings (Settings → Personal access tokens → Create token) " +
      "with profile:read checked, and set it as CRAFTHUB_API_TOKEN.";
    const error = Object.assign(new Error(message), {
      name: "CraftHubApiError",
      status: 403,
    });
    const { client } = clientRejectingWith(error);

    const context = await loadDisclosureContext(client);

    expect(context.degraded).toBe(true);
    expect(context.level).toBe("summary");
    expect(context.degradedReason).toContain("profile:read");
  });

  it("stringifies a non-Error throw into degradedReason", async () => {
    const { client } = clientRejectingWith("boom");

    const context = await loadDisclosureContext(client);

    expect(context.degraded).toBe(true);
    expect(context.level).toBe(DEFAULT_AGENT_DISCLOSURE_LEVEL);
    expect(context.blockedTerms).toEqual([]);
    expect(context.degradedReason).toBe("boom");
  });

  it("stringifies a thrown plain object the blunt way", async () => {
    // CHARACTERIZATION: today's behaviour. `String({ status: 403 })` is
    // "[object Object]", so the reason is useless but the FAIL-CLOSED level is
    // still correct — which is the part that protects the user.
    const { client } = clientRejectingWith({ status: 403 });

    const context = await loadDisclosureContext(client);

    expect(context.degraded).toBe(true);
    expect(context.level).toBe("summary");
    expect(context.degradedReason).toBe("[object Object]");
  });

  it("never resolves to a level looser than the default when the policy is unreadable", async () => {
    for (const thrown of [
      new Error("timeout"),
      "string throw",
      null,
      undefined,
      42,
    ]) {
      const context = await loadDisclosureContext(
        clientRejectingWith(thrown).client,
      );

      expect(context.level).toBe("summary");
      expect(context.degraded).toBe(true);
      expect(context.blockedTerms).toEqual([]);
      expect(context.info.blocks).toContain("Employer and client names");
    }
  });
});

describe("renderPolicyForToolDescription", () => {
  it("prefixes the degraded warning only when degraded", () => {
    const healthy = renderPolicyForToolDescription(contextFor("summary"));
    const degraded = renderPolicyForToolDescription(
      contextFor("summary", { degraded: true, degradedReason: "403" }),
    );

    expect(healthy.startsWith("DISCLOSURE POLICY: ")).toBe(true);
    expect(healthy).not.toContain("could not be read from CraftHub");
    expect(healthy).not.toContain("STRICTEST");

    expect(degraded).toContain("could not be read from CraftHub");
    expect(degraded).toContain("assuming the STRICTEST level");
    expect(degraded).toContain("profile:read");
  });

  it("does not leak degradedReason into the tool description", () => {
    // CHARACTERIZATION: the reason string (which can carry the api url) stays
    // out of the tool description and appears only in the resource.
    // `203.0.113.0/24` is the RFC 5737 TEST-NET-3 block reserved for exactly
    // this — documentation and example addresses that are guaranteed not to
    // be a real host — standing in for whatever a deployment's
    // CRAFTHUB_API_URL might resolve to.
    const UNREACHABLE_API_HOST = "203.0.113.7";
    const rendered = renderPolicyForToolDescription(
      contextFor("summary", {
        degraded: true,
        degradedReason: `Could not reach the CraftHub API at http://${UNREACHABLE_API_HOST}:3333`,
      }),
    );

    expect(rendered).not.toContain(UNREACHABLE_API_HOST);
  });

  it("names the level value, its label and its short description", () => {
    const rendered = renderPolicyForToolDescription(contextFor("detailed"));
    const info = levelInfo("detailed");

    expect(rendered).toContain(`the user's level is "detailed" (Detailed)`);
    expect(rendered).toContain(info.shortDescription);
  });

  it("lists every `allows` and every `blocks` entry, semicolon-joined", () => {
    const info = levelInfo("summary");
    const rendered = renderPolicyForToolDescription(contextFor("summary"));

    expect(rendered).toContain(`YOU MAY SAY: ${info.allows.join("; ")}.`);
    expect(rendered).toContain(`YOU MUST NOT SAY: ${info.blocks.join("; ")}.`);
    for (const allowed of info.allows) expect(rendered).toContain(allowed);
    for (const blocked of info.blocks) expect(rendered).toContain(blocked);
    expect(rendered).toContain("Employer and client names");
  });

  it("uses the 'nothing is blocked at this level' branch when blocks is empty", () => {
    const rendered = renderPolicyForToolDescription(contextFor("full"));

    expect(rendered).not.toContain("YOU MUST NOT SAY:");
    expect(rendered).toContain(
      "Nothing is blocked at this level beyond the user's own blocked terms.",
    );
  });

  it("always carries the never-infer-the-employer instruction and the enforcement warning", () => {
    for (const level of AGENT_DISCLOSURE_LEVELS.map((entry) => entry.value)) {
      for (const degraded of [false, true]) {
        const rendered = renderPolicyForToolDescription(
          contextFor(level, { degraded }),
        );

        expect(rendered).toContain(
          "Never infer the employer from git remotes, package names, directory paths or code comments",
        );
        expect(rendered).toContain("call get_work_context");
        expect(rendered).toContain("CraftHub ENFORCES this server-side");
        expect(rendered).toContain("rejected with a 400 naming the term");
      }
    }
  });

  it("does NOT list the user's own blocked terms", () => {
    // CHARACTERIZATION: today's behaviour. The tool description references
    // "the user's own blocked terms" but never enumerates them — an agent that
    // reads only the tool description cannot avoid a banned term up front and
    // learns about it from the server's 400. See the note in the final report.
    const rendered = renderPolicyForToolDescription(
      contextFor("full", { blockedTerms: ["Initech", "project-hemlock"] }),
    );

    expect(rendered).not.toContain("Initech");
    expect(rendered).not.toContain("project-hemlock");
  });
});

describe("renderPolicyResource", () => {
  it("adds the fallback note only when degraded, with the reason", () => {
    const healthy = renderPolicyResource(contextFor("summary"));
    const degraded = renderPolicyResource(
      contextFor("summary", {
        degraded: true,
        degradedReason: "missing profile:read scope",
      }),
    );

    expect(healthy).not.toContain("This is a fallback.");
    expect(degraded).toContain("**This is a fallback.**");
    expect(degraded).toContain("Reason: missing profile:read scope");
  });

  it("says 'unknown' when degraded without a reason", () => {
    const degraded = renderPolicyResource(
      contextFor("summary", { degraded: true }),
    );

    expect(degraded).toContain("Reason: unknown");
  });

  it("renders the level heading with value and label", () => {
    for (const entry of AGENT_DISCLOSURE_LEVELS) {
      const rendered = renderPolicyResource(contextFor(entry.value));

      expect(rendered.startsWith("# Active disclosure policy")).toBe(true);
      expect(rendered).toContain(
        `**Level: \`${entry.value}\` — ${entry.label}**`,
      );
      expect(rendered).toContain(entry.shortDescription);
    }
  });

  it("bullets every allow and every block", () => {
    const info = levelInfo("detailed");
    const rendered = renderPolicyResource(contextFor("detailed"));

    expect(rendered).toContain("## What you may say");
    expect(rendered).toContain("## What you must not say");
    for (const allowed of info.allows)
      expect(rendered).toContain(`- ${allowed}`);
    for (const blocked of info.blocks)
      expect(rendered).toContain(`- ${blocked}`);
  });

  it("substitutes the empty-blocks sentence at `full`", () => {
    const rendered = renderPolicyResource(contextFor("full"));

    expect(rendered).toContain(
      "_Nothing beyond the user's own blocked terms below._",
    );
  });

  it("omits the blocked-terms section when there are none", () => {
    const rendered = renderPolicyResource(contextFor("summary"));

    expect(rendered).not.toContain("Terms the user banned outright");
  });

  it("lists each blocked term when there are some", () => {
    const rendered = renderPolicyResource(
      contextFor("full", {
        blockedTerms: ["Initech", "project-hemlock", "PIX-4M"],
      }),
    );

    expect(rendered).toContain("## Terms the user banned outright");
    expect(rendered).toContain(
      "These are blocked at EVERY level, including `full`",
    );
    expect(rendered).toContain("- Initech");
    expect(rendered).toContain("- project-hemlock");
    expect(rendered).toContain("- PIX-4M");
  });

  it("never drops the enforcement and provenance sections", () => {
    const rendered = renderPolicyResource(contextFor("full"));

    expect(rendered).toContain("## How this is enforced");
    expect(rendered).toContain("rejected with HTTP 400");
    expect(rendered).toContain("## Where employment facts come from");
    expect(rendered).toContain(
      "`get_work_context` is the ONLY sanctioned source.",
    );
    expect(rendered).toContain("## Changing it");
    expect(rendered).toContain(
      "A personal access token cannot widen its own\npolicy, by design",
    );
  });

  it("shows no blocked-terms section in the degraded case, because the list is empty", async () => {
    // CHARACTERIZATION: today's behaviour. When the policy cannot be read the
    // context has `blockedTerms: []`, so the resource tells the agent the
    // strictest level applies but names none of the user's banned terms. The
    // strict level still blocks employer names, and the api still enforces the
    // denylist with a 400 — so this is degraded guidance, not a leak.
    const context = await loadDisclosureContext(
      clientRejectingWith(new Error("403")).client,
    );
    const rendered = renderPolicyResource(context);

    expect(rendered).toContain("**This is a fallback.**");
    expect(rendered).not.toContain("Terms the user banned outright");
    expect(rendered).toContain("- Employer and client names");
  });
});
