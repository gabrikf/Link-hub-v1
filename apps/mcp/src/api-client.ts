import type {
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
        await this.describeError(response),
        response.status,
      );
    }

    // DELETE and others may return an empty body; guard the JSON parse.
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
        return `LinkHub rejected the request as invalid${suffix}.`;
      case 401:
        return "Invalid or expired LinkHub token. Create a fresh Personal Access Token in LinkHub settings and set LINKHUB_API_TOKEN.";
      case 403:
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
