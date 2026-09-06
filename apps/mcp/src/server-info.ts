/**
 * The identity this server reports in the MCP `initialize` handshake. Hosts
 * show both values in their server list, so a stale version here is a small
 * lie told to every user.
 *
 * It is a literal rather than a `package.json` import because the published
 * artefact is a single esbuild bundle with no `package.json` beside it at
 * runtime — `server-info.test.ts` is what keeps the literal honest, failing
 * the build the moment the two drift.
 */
export const SERVER_NAME = "crafthub";
export const SERVER_VERSION = "1.0.0";
