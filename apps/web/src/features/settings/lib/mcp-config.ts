/** Scroll target — the Create token button lives a long way above the panel. */
export const CONNECT_PANEL_ID = "connect-your-ai-tools";

/**
 * The API base the copied MCP config will point at.
 *
 * The fallback used to be a hardcoded `http://localhost:3333`, so anyone on a
 * deployed instance built without `VITE_API_URL` copied a config aimed at their
 * own machine: the MCP server started fine and every tool call failed.
 * Deriving from the page's own origin is right far more often — the user is, by
 * definition, reachable at it — and a genuinely local dev instance still
 * resolves to localhost because that is where the page is being served from.
 */
export function resolveApiUrl(): string {
  // Vite types every `VITE_*` key through an `any` index signature, so this is
  // `unknown` plus a runtime narrowing rather than a trusted string.
  const configured: unknown = import.meta.env.VITE_API_URL;

  if (typeof configured === "string" && configured.length > 0) {
    return configured;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "http://localhost:3333";
}
