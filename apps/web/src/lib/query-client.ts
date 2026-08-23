import { QueryClient } from "@tanstack/react-query";

/**
 * Retry policy for a query whose failure a screen shows as its own error state
 * with its own Retry button.
 *
 * The library default is 3 retries at ~1s/2s/4s, which held /dashboard and
 * /dashboard/layout on an unmoving loading skeleton for ~7.7s before the
 * designed error state appeared — a product that reads as frozen rather than
 * failing. One quick retry still heals the transient blip invisibly, and the
 * user is separately offered the retry the extra attempts were buying.
 *
 * Spread it into the individual query, not into the shared client: a query
 * whose failure is invisible to the user has no reason to give up this early.
 */
export const RETRY_BEHIND_AN_ERROR_STATE = {
  retry: 1,
  retryDelay: 300,
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});
