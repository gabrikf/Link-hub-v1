import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  renderPolicyResource,
  type DisclosureContext,
} from "../disclosure.js";

/** Canonical URI of the active disclosure contract. */
export const DISCLOSURE_POLICY_URI = "linkhub://policy/disclosure";

/**
 * Exposes the ACTIVE policy (not the generic list of levels) as a resource, so
 * a host agent that reads resources on connect learns the constraint before it
 * writes a word — the same reason the level is baked into tool descriptions.
 */
export function registerDisclosurePolicy(
  server: McpServer,
  context: DisclosureContext,
): void {
  server.registerResource(
    "disclosure_policy",
    DISCLOSURE_POLICY_URI,
    {
      title: `LinkHub disclosure policy (${context.info.label})`,
      description:
        "The user's active privacy contract for anything you publish about " +
        "their employment: the current disclosure level with its exact " +
        "allow/block lists, any terms they banned outright, how LinkHub " +
        "enforces it server-side, and where employment facts must come from " +
        "(get_work_context — never git remotes or directory names). Read this " +
        "before writing about where the user works.",
      mimeType: "text/markdown",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: renderPolicyResource(context),
        },
      ],
    }),
  );
}
