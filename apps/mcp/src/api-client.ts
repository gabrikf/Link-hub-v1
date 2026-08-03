import type {
  AgentPolicy,
  CreatePostInput,
  Post,
  UpdatePostInput,
} from "@repo/schemas";
import type { LinkHubConfig } from "./config.js";

/**
 * Error raised by the API client. `status` is the HTTP status when the failure
 * came from the server (absent for network/transport failures). `message` is
 * already human-readable and safe to surface directly to the MCP client.
 */
export class LinkHubApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LinkHubApiError";
  }
}

export interface ListPostsParams {
  limit?: number;
  offset?: number;
}

interface OperationSuccess {
  success: boolean;
}

/** One role as returned by `GET /me/work-context` — already redacted server-side. */
export interface WorkContextRole {
  id: string;
  title: string;
  seniorityHint: string | null;
  employmentType: string | null;
  workModel: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  durationMonths: number | null;
  stack: string[];
  practices: string[];
  domain: string | null;
  /** Null whenever the effective level for this role is `summary`. */
  companyName: string | null;
  achievements: string[];
}

export interface WorkContext {
  disclosureLevel: "summary" | "detailed" | "full";
  roles: WorkContextRole[];
}

/**
 * Paths that need the `profile:read` scope. A 403 on any of them means the
 * user's token predates that scope (or was created without it), which is a
 * fixable setup problem rather than a permissions failure — so it gets its own
 * message instead of the generic "not allowed".
 */
const PROFILE_READ_PATHS = new Set(["/me/agent-policy", "/me/work-context"]);

/**
 * Thin, typed HTTP client for the LinkHub `/me/posts` API. It is a pure
 * transport layer: it authenticates with the PAT, (de)serializes JSON, and
 * translates HTTP failures into clear LinkHubApiError messages. It contains no
 * business logic and never calls any AI.
 */
export class LinkHubApiClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: LinkHubConfig) {
    this.baseUrl = config.apiUrl;
    this.token = config.token;
  }

  /** The disclosure contract in force. Requires the `profile:read` scope. */
  getAgentPolicy(): Promise<AgentPolicy> {
    return this.request<AgentPolicy>("GET", "/me/agent-policy");
  }

  /**
   * The user's work history, ALREADY redacted to their disclosure level.
   * Requires the `profile:read` scope.
   */
  getWorkContext(): Promise<WorkContext> {
    return this.request<WorkContext>("GET", "/me/work-context");
  }

  createPost(body: CreatePostInput): Promise<Post> {
    return this.request<Post>("POST", "/me/posts", body);
  }

  listPosts(params: ListPostsParams = {}): Promise<Post[]> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    const qs = query.toString();
    return this.request<Post[]>("GET", `/me/posts${qs ? `?${qs}` : ""}`);
  }

  getPost(id: string): Promise<Post> {
    return this.request<Post>("GET", `/me/posts/${encodeURIComponent(id)}`);
  }

  updatePost(id: string, body: UpdatePostInput): Promise<Post> {
    return this.request<Post>(
      "PATCH",
      `/me/posts/${encodeURIComponent(id)}`,
      body,
    );
  }

  deletePost(id: string): Promise<OperationSuccess> {
    return this.request<OperationSuccess>(
      "DELETE",
      `/me/posts/${encodeURIComponent(id)}`,
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new LinkHubApiError(
        `Could not reach the LinkHub API at ${this.baseUrl}. ` +
          `Make sure the API is running and LINKHUB_API_URL is correct. (${detail})`,
      );
    }

    if (!response.ok) {
      throw new LinkHubApiError(
        await this.describeError(response, path),
        response.status,
      );
    }

    // DELETE and others may return an empty body; guard the JSON parse.
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  /** Maps an error response into a clear, actionable message. */
  private async describeError(
    response: Response,
    path: string,
  ): Promise<string> {
    const serverMessage = await this.extractMessage(response);
    const suffix = serverMessage ? ` (${serverMessage})` : "";
    const basePath = path.split("?")[0] ?? path;

    switch (response.status) {
      case 400:
        // A disclosure-policy rejection arrives as a 400 whose message already
        // names the offending term and the fix, so it is passed through intact
        // rather than wrapped in a generic "invalid request".
        return serverMessage
          ? serverMessage
          : "LinkHub rejected the request as invalid.";
      case 401:
        return "Invalid or expired LinkHub token. Create a fresh Personal Access Token in LinkHub settings and set LINKHUB_API_TOKEN.";
      case 403:
        if (PROFILE_READ_PATHS.has(basePath)) {
          return (
            "Your token is missing the profile:read scope — create a new token in " +
            "LinkHub settings (Settings → Personal access tokens → Create token) " +
            "with profile:read checked, and set it as LINKHUB_API_TOKEN. Without " +
            "it this server cannot read your disclosure policy, so it will assume " +
            "the strictest one."
          );
        }
        return `Your LinkHub token is not allowed to perform this action${suffix}. Ensure it has the posts:write / posts:read scopes.`;
      case 404:
        return `Post not found${suffix}.`;
      default:
        return `LinkHub API error (HTTP ${response.status})${suffix}.`;
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
