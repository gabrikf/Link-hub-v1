import axios, {
  AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { z } from "zod";
import {
  applyAuthHeaders,
  getAuthTokens,
  setAuthTokens,
  type AuthTokens,
} from "./auth-tokens";
import { handleSessionExpired } from "./session";

/**
 * Refresh-on-401.
 *
 * `fetchWithTokens` sets `x-refresh-token` on every request and used to hope
 * for the best: there was no 401 handling anywhere in the client. Once the
 * access token expired, no redirect fired, every query rejected, and nothing
 * rendered an error — the dashboard just came up blank (see `lib/session.ts`).
 *
 * This module is written as factories taking their collaborators so the retry
 * matrix is unit-testable without a network or an axios adapter; `auth-api.ts`
 * wires the real ones onto its client.
 *
 * NOTE FOR THE API: `POST /auth/refresh` does not exist server-side yet — the
 * auth routes are register/login/google/linkedin only, and `x-refresh-token` is
 * merely CORS-allowed, never consumed. Until it lands the first 401 of a page
 * load costs one 404 probe, after which the refresher latches "unsupported" and
 * every later expiry signs out immediately. The moment the endpoint exists and
 * returns `{ accessToken, refreshToken }`, sessions start renewing silently
 * with no client change.
 */

export const REFRESH_PATH = "/auth/refresh";

export const refreshResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

export type RetriableRequestConfig = AxiosRequestConfig & {
  /** Set on the replayed request so a second 401 can never loop. */
  hasRetriedAfterRefresh?: boolean;
};

/** Endpoints where a 401 means "bad credentials", not "session expired". */
export const isCredentialEndpoint = (url: string | undefined): boolean =>
  (url ?? "").startsWith("/auth/");

export type SessionRefresher = {
  /** At most one in-flight attempt, shared by every concurrent 401. */
  refresh: () => Promise<AuthTokens | null>;
  /** Test seam — clears the "unsupported" latch and any in-flight attempt. */
  reset: () => void;
};

export function createSessionRefresher(options: {
  /** Performs the refresh call and resolves the raw response body. */
  transport: (refreshToken: string) => Promise<unknown>;
  readTokens?: () => AuthTokens | null;
  writeTokens?: (tokens: AuthTokens) => void;
}): SessionRefresher {
  // Wrapped rather than passed by reference: a bare `readTokens = getAuthTokens`
  // touches the import binding as soon as the factory runs, which explodes in
  // suites that `vi.mock("./auth-tokens")` with a partial surface.
  const {
    transport,
    readTokens = () => getAuthTokens(),
    writeTokens = (tokens: AuthTokens) => setAuthTokens(tokens),
  } = options;

  let isSupported = true;
  let inFlight: Promise<AuthTokens | null> | null = null;

  const attempt = async (refreshToken: string): Promise<AuthTokens | null> => {
    try {
      const refreshed = refreshResponseSchema.parse(
        await transport(refreshToken),
      );
      writeTokens(refreshed);
      return refreshed;
    } catch (error) {
      // 404/501 means the endpoint is not implemented. Latch off so we stop
      // paying for a doomed round-trip on every later expiry this page-load.
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;

      if (status === 404 || status === 501) {
        isSupported = false;
      }

      return null;
    }
  };

  return {
    refresh: () => {
      if (!isSupported) {
        return Promise.resolve(null);
      }

      const tokens = readTokens();

      if (!tokens) {
        return Promise.resolve(null);
      }

      // Stampede guard: a dashboard fires ~5 queries at once, and five
      // simultaneous 401s must produce one refresh, not five.
      inFlight ??= attempt(tokens.refreshToken).finally(() => {
        inFlight = null;
      });

      return inFlight;
    },
    reset: () => {
      isSupported = true;
      inFlight = null;
    },
  };
}

export function createUnauthorizedHandler(options: {
  refresh: () => Promise<AuthTokens | null>;
  /** Re-issues the original request once new tokens are in hand. */
  replay: (config: RetriableRequestConfig) => Promise<AxiosResponse>;
  readTokens?: () => AuthTokens | null;
  onSessionExpired?: () => void;
}) {
  const {
    refresh,
    replay,
    readTokens = () => getAuthTokens(),
    onSessionExpired = () => handleSessionExpired(),
  } = options;

  return async (error: unknown): Promise<AxiosResponse> => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      throw error;
    }

    const config = error.config as RetriableRequestConfig | undefined;

    if (
      !config ||
      // Loop guard: the replay already failed once.
      config.hasRetriedAfterRefresh ||
      isCredentialEndpoint(config.url)
    ) {
      throw error;
    }

    // No stored tokens means the request was anonymous (a public profile
    // fetch, say). There is no session to expire.
    if (!readTokens()) {
      throw error;
    }

    const refreshed = await refresh();

    if (!refreshed) {
      onSessionExpired();
      throw error;
    }

    const headers = AxiosHeaders.from(
      (config.headers ?? {}) as AxiosHeaders,
    );
    applyAuthHeaders(headers, refreshed);

    return replay({ ...config, headers, hasRetriedAfterRefresh: true });
  };
}
