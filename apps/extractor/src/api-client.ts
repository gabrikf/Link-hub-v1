import type {
  IngestActivityInput,
  IngestActivityResult,
} from "@repo/schemas";
import type { CraftHubConfig } from "./config.js";

/**
 * Error raised by the API client. `status` is the HTTP status when the failure
 * came from the server (absent for network/transport failures). `message` is
 * already human-readable and safe to print directly.
 *
 * Same shape and same mapping style as `apps/mcp/src/api-client.ts`; the only
 * divergence is the 403 branch, which here is about `activity:write` rather
 * than `profile:read`.
 */
export class CraftHubApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CraftHubApiError";
  }
}

/** The API's envelope cap — see `ingestActivitySchemaInput.events.max(500)`. */
export const MAX_EVENTS_PER_REQUEST = 500;

/** `POST /me/activity`. The one endpoint this package talks to. */
const INGEST_PATH = "/me/activity";

/**
 * Uploads are one-shot and idempotent, so a request that has not answered in
 * this long is far more likely to be a wedged connection than slow progress.
 * Re-running the command is free — `externalDeliveryId` makes a repeat a
 * server-side no-op — so failing early is strictly better than hanging.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Thin, typed HTTP client for CraftHub activity ingestion. Pure transport: it
 * authenticates with the PAT, serializes JSON, splits oversized batches, and
 * translates HTTP failures into actionable messages. It performs no hashing and
 * no redaction — by the time a payload reaches this class it must already be
 * safe to send, because this is the last place it could be inspected and it
 * deliberately does not inspect it.
 */
export class CraftHubActivityClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(
    config: CraftHubConfig,
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
  ) {
    this.baseUrl = config.apiUrl;
    this.token = config.token;
  }

  /**
   * Sends an envelope, splitting it into chunks of at most 500 events.
   *
   * Splitting does not change what is sent: every event in the reviewed file is
   * posted exactly once, with the same `connectionId` and `source`, and the
   * per-chunk results are summed. A partial failure leaves the already-accepted
   * chunks recorded — which is safe precisely because re-running the upload
   * re-sends them as duplicates rather than as new activity.
   */
  async ingest(envelope: IngestActivityInput): Promise<IngestActivityResult> {
    const totals: IngestActivityResult = { recorded: 0, duplicates: 0 };

    for (let i = 0; i < envelope.events.length; i += MAX_EVENTS_PER_REQUEST) {
      const chunk = envelope.events.slice(i, i + MAX_EVENTS_PER_REQUEST);
      const result = await this.request<IngestActivityResult>(INGEST_PATH, {
        connectionId: envelope.connectionId,
        source: envelope.source,
        events: chunk,
      });
      totals.recorded += result?.recorded ?? 0;
      totals.duplicates += result?.duplicates ?? 0;
    }

    return totals;
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new CraftHubApiError(
        `Could not reach the CraftHub API at ${this.baseUrl}. ` +
          `Make sure the API is running and CRAFTHUB_API_URL is correct. (${detail})`,
      );
    }

    if (!response.ok) {
      throw new CraftHubApiError(
        await this.describeError(response),
        response.status,
      );
    }

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  /** Maps an error response into a clear, actionable message. */
  private async describeError(response: Response): Promise<string> {
    const serverMessage = await this.extractMessage(response);
    const suffix = serverMessage ? ` (${serverMessage})` : "";

    switch (response.status) {
      case 400:
        // The ingestion schema is the thing that keeps clear-text identities
        // out of the database, so its rejection message names the offending
        // field. Passing it through intact is more useful than "invalid".
        return serverMessage
          ? `CraftHub rejected the payload: ${serverMessage}`
          : "CraftHub rejected the payload as invalid. Re-run the extract step to regenerate the file.";
      case 401:
        return (
          "Invalid or expired CraftHub token. Create a fresh Personal Access Token " +
          "in CraftHub settings and set CRAFTHUB_API_TOKEN. Nothing was uploaded."
        );
      case 403:
        return (
          "This token is missing the activity:write scope; mint a new one in " +
          "Settings → Personal access tokens with activity:write checked, and set " +
          "it as CRAFTHUB_API_TOKEN. (activity:write is not granted by default, so " +
          "a token created for the MCP server will not have it.) Nothing was uploaded."
        );
      case 404:
        return (
          `No such git connection${suffix}. Check the connectionId in your payload ` +
          "against Settings → Connections."
        );
      case 429:
        return `CraftHub is rate-limiting this token${suffix}. Wait and re-run the upload — already-accepted events will come back as duplicates.`;
      default:
        return `CraftHub API error (HTTP ${response.status})${suffix}.`;
    }
  }

  private async extractMessage(response: Response): Promise<string | null> {
    try {
      const data = (await response.clone().json()) as Record<string, unknown>;
      const value = data.message ?? data.error;
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  }
}
