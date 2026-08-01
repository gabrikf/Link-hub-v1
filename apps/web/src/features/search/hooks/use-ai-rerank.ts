import { useCallback, useState } from "react";
import type {
  RecruiterSearchInput,
  RecruiterSearchResult,
} from "@repo/schemas";
import { getRerankerWorker } from "../../../lib/reranker-worker-singleton";

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
  };
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
    }): Promise<RankedResult[]> => {
      if (input.candidates.length === 0) {
        return [];
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

        return rankedCandidates;
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
