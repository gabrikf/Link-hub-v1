import type { Post } from "@repo/schemas";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { LinkHubApiError } from "../api-client.js";

/** A plain text tool result. */
export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

/** An error tool result — surfaces the message to the MCP client with isError. */
export function errorResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/**
 * Wraps a tool handler so any thrown error becomes a clean, user-facing
 * `isError` result instead of crashing the MCP session. LinkHubApiError
 * messages are already human-readable; unknown errors are stringified.
 */
export async function runTool(
  fn: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LinkHubApiError) return errorResult(err.message);
    const detail = err instanceof Error ? err.message : String(err);
    return errorResult(`Unexpected error: ${detail}`);
  }
}

/** One-line summary of a post for list output. */
export function summarizePostLine(post: Post): string {
  const title = post.title ?? "(untitled)";
  const created =
    post.createdAt instanceof Date
      ? post.createdAt.toISOString()
      : String(post.createdAt);
  return `- ${post.id} · "${title}" · ${post.status} · source=${post.source} · ${created}`;
}

/** Human-friendly confirmation block for a single created/updated post. */
export function describePost(post: Post, heading: string): string {
  const lines = [
    heading,
    `id: ${post.id}`,
    `title: ${post.title ?? "(untitled)"}`,
    `status: ${post.status}`,
    `source: ${post.source}`,
  ];
  if (post.tags && post.tags.length > 0) {
    lines.push(`tags: ${post.tags.join(", ")}`);
  }
  return lines.join("\n");
}
