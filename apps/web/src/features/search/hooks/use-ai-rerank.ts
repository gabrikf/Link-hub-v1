import { useCallback, useState } from "react";
import type {
  RecruiterSearchInput,
  RecruiterSearchResult,
} from "@repo/schemas";
import { getRerankerWorker } from "../../../lib/reranker-worker-singleton";
import type { RankedCandidate } from "../types/advanced-search";

type RecruiterSearchFilters = NonNullable<RecruiterSearchInput["whereQuery"]>;

type RankedResult = RecruiterSearchResult & { aiScore: number };

interface WorkerSuccess {
  type: "RERANK_RESULT";
  payload: {
    candidates: RankedResult[];
  };
}

interface WorkerError {
  type: "RERANK_ERROR";
  payload: {
    message: string;
    code?: string;
  };
}

/**
 * Outcome of a rerank attempt.
 *
 * `degraded` is the whole point. `rerank()` used to be awaited inside the search
 * mutation's `mutationFn`, so a failed model fetch, a stale artifact or a CDN
 * blip failed the ENTIRE search — the recruiter saw an error and nothing else,
 * on top of 50 perfectly good candidates the API had already returned. Ranking
 * is an enhancement; losing it must cost the ordering, not the search.
 */
export interface RerankOutcome {
  candidates: RankedCandidate[];
  degraded: boolean;
  reason: string | null;
}

export function useAiRerank() {
  const [isModelLoading, setIsModelLoading] = useState(false);

  const rerank = useCallback(
    async (input: {
      candidates: RecruiterSearchResult[];
      semanticQuery: string;
      filters?: RecruiterSearchFilters;
      semanticSkills?: string[];
      semanticTitles?: string[];
    }): Promise<RerankOutcome> => {
      if (input.candidates.length === 0) {
        return { candidates: [], degraded: false, reason: null };
      }

      setIsModelLoading(true);

      try {
        const worker = getRerankerWorker();

        const rankedCandidates = await new Promise<RankedResult[]>(
          (resolve, reject) => {
            // Both listeners are removed in a `finally`, not via `{ once: true }`.
            // `once` only self-removes the listener that actually fired, so on
            // every search the *other* one stayed attached to the singleton
            // worker forever — N searches leaked N listeners.
            const cleanup = () => {
              worker.removeEventListener("message", onMessage);
              worker.removeEventListener("error", onError);
            };

            const onMessage = (
              event: MessageEvent<WorkerSuccess | WorkerError>,
            ) => {
              const message = event.data;

              try {
                if (message.type === "RERANK_RESULT") {
                  resolve(message.payload.candidates);
                  return;
                }

                reject(new Error(message.payload.message));
              } finally {
                cleanup();
              }
            };

            const onError = () => {
              try {
                reject(new Error("Worker execution failed"));
              } finally {
                cleanup();
              }
            };

            worker.addEventListener("message", onMessage);
            worker.addEventListener("error", onError);
            worker.postMessage({
              type: "RERANK",
              payload: {
                candidates: input.candidates,
                searchInput: {
                  semanticQuery: input.semanticQuery,
                  filters: input.filters ?? {},
                  semanticSkills: input.semanticSkills,
                  semanticTitles: input.semanticTitles,
                },
              },
            });
          },
        );

        return { candidates: rankedCandidates, degraded: false, reason: null };
      } catch (error) {
        // Fall back to the API's similarity ordering, which the response is
        // already sorted by. `aiScore: null` is the honest value: there is no
        // match percentage, and showing the raw cosine as if it were one would
        // be worse than showing none.
        return {
          candidates: input.candidates.map((candidate) => ({
            ...candidate,
            aiScore: null,
          })),
          degraded: true,
          reason:
            error instanceof Error
              ? error.message
              : "On-device ranking is unavailable",
        };
      } finally {
        setIsModelLoading(false);
      }
    },
    [],
  );

  /**
   * Instantiates the worker (and with it the ~1.39 MB bundle download, the TF
   * init, `latest.json` and the weights) without ranking anything.
   *
   * The first search used to pay all of that *serially, after* the API call,
   * because `getRerankerWorker()` was first reached inside `rerank`. Calling
   * this on route mount overlaps the download with the recruiter typing their
   * query, which is the whole of the perceived wait.
   */
  const warmUp = useCallback(() => {
    try {
      getRerankerWorker();
    } catch {
      // Warm-up is best-effort; `rerank` surfaces a real failure later.
    }
  }, []);

  return {
    rerank,
    warmUp,
    isModelLoading,
  };
}
