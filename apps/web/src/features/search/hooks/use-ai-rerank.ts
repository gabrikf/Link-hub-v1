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
            const onMessage = (
              event: MessageEvent<WorkerSuccess | WorkerError>,
            ) => {
              const message = event.data;

              if (message.type === "RERANK_RESULT") {
                resolve(message.payload.candidates);
                return;
              }

              reject(new Error(message.payload.message));
            };

            const onError = () => {
              reject(new Error("Worker execution failed"));
            };

            worker.addEventListener("message", onMessage, { once: true });
            worker.addEventListener("error", onError, { once: true });
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

  return {
    rerank,
    isModelLoading,
  };
}
