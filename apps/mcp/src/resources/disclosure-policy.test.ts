import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DEFAULT_AGENT_DISCLOSURE_LEVEL } from "@repo/schemas";
import { levelInfo, type DisclosureContext } from "../disclosure.js";
import {
  DISCLOSURE_POLICY_URI,
  registerDisclosurePolicy,
} from "./disclosure-policy.js";

/**
 * Characterization suite for the `linkhub://policy/disclosure` resource. It is
 * driven through a REAL McpServer and a REAL MCP client over an in-memory
 * transport, so what it asserts is the wire shape a host agent actually sees —
 * not the shape of a hand-rolled fake.
 */

function contextFor(overrides: Partial<DisclosureContext> = {}): DisclosureContext {
  return {
    level: "detailed",
    info: levelInfo("detailed"),
    blockedTerms: [],
    degraded: false,
    ...overrides,
  };
}

async function connect(context: DisclosureContext): Promise<Client> {
  const server = new McpServer({ name: "linkhub-test", version: "1.0.0" });
  registerDisclosurePolicy(server, context);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-host", version: "1.0.0" });

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  return client;
}

describe("the disclosure_policy resource", () => {
  it("is advertised at the canonical URI with the level in its title", async () => {
    const client = await connect(contextFor());

    const { resources } = await client.listResources();
    const resource = resources.find(
      (entry) => entry.uri === DISCLOSURE_POLICY_URI,
    );

    expect(DISCLOSURE_POLICY_URI).toBe("linkhub://policy/disclosure");
    expect(resource).toBeDefined();
    expect(resource?.name).toBe("disclosure_policy");
    expect(resource?.mimeType).toBe("text/markdown");
    // The LABEL is in the title, not the level value: "Detailed", not "detailed".
    expect(resource?.title).toBe("LinkHub disclosure policy (Detailed)");
    expect(resource?.description).toContain("get_work_context");
  });

  it("returns exactly one markdown content block echoing the requested uri", async () => {
    const client = await connect(contextFor());

    const result = await client.readResource({ uri: DISCLOSURE_POLICY_URI });

    expect(result.contents).toHaveLength(1);
    const [block] = result.contents;
    expect(block?.uri).toBe(DISCLOSURE_POLICY_URI);
    expect(block?.mimeType).toBe("text/markdown");
    expect(typeof block?.text).toBe("string");
    expect(String(block?.text)).toContain("# Active disclosure policy");
    expect(String(block?.text)).toContain("**Level: `detailed` — Detailed**");
  });

  it("renders the banned terms the user set", async () => {
    const client = await connect(
      contextFor({ blockedTerms: ["Acme Corp", "Project Nightingale"] }),
    );

    const result = await client.readResource({ uri: DISCLOSURE_POLICY_URI });
    const text = String(result.contents[0]?.text);

    expect(text).toContain("## Terms the user banned outright");
    expect(text).toContain("- Acme Corp");
    expect(text).toContain("- Project Nightingale");
  });

  it("serves the fallback banner and the strictest level when degraded", async () => {
    const degraded = contextFor({
      level: DEFAULT_AGENT_DISCLOSURE_LEVEL,
      info: levelInfo(DEFAULT_AGENT_DISCLOSURE_LEVEL),
      degraded: true,
      degradedReason: "Your token is missing the profile:read scope",
    });
    const client = await connect(degraded);

    const { resources } = await client.listResources();
    const result = await client.readResource({ uri: DISCLOSURE_POLICY_URI });
    const text = String(result.contents[0]?.text);

    // The resource still resolves — a degraded policy is served, not withheld.
    expect(text).toContain("> **This is a fallback.**");
    expect(text).toContain("Reason: Your token is missing the profile:read scope");
    expect(text).toContain("**Level: `summary` — Summary**");
    expect(text).toContain("- Employer and client names");

    // CHARACTERIZATION: today's behaviour. The advertised TITLE says "Summary"
    // with no hint that it is a guess — a host agent listing resources without
    // reading them sees a title indistinguishable from a real summary policy.
    // The fallback is only visible once the body is read.
    expect(
      resources.find((entry) => entry.uri === DISCLOSURE_POLICY_URI)?.title,
    ).toBe("LinkHub disclosure policy (Summary)");
  });

  it("snapshots the startup context — it does not re-read the policy per request", async () => {
    const client = await connect(contextFor({ blockedTerms: ["Acme"] }));

    const first = String(
      (await client.readResource({ uri: DISCLOSURE_POLICY_URI })).contents[0]
        ?.text,
    );
    const second = String(
      (await client.readResource({ uri: DISCLOSURE_POLICY_URI })).contents[0]
        ?.text,
    );

    // CHARACTERIZATION: the resource closes over the startup snapshot, so a
    // policy the user tightens in a browser tab mid-session is NOT reflected
    // here until the MCP server restarts. `get_disclosure_policy` re-fetches;
    // this resource deliberately does not.
    expect(first).toBe(second);
  });
});
