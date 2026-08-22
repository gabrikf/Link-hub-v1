import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { fetchMyResume } from "./auth-api";
import { reportError, reportHandled } from "./report-error";

/**
 * Shared `["resume"]` query. The resume endpoint 404s when the user has no
 * resume yet, which we treat as `null` rather than an error. This lives in one
 * place so every consumer (dashboard page + profile-layout manager) shares the
 * exact same fetch behavior for the shared cache entry — see React Query's
 * "one config per key" rule.
 */
export function useMyResumeQuery(enabled: boolean) {
  return useQuery({
    queryKey: ["resume"],
    enabled,
    retry: false,
    queryFn: async () => {
      try {
        return await fetchMyResume();
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          // "No resume yet" is the documented meaning of this 404, not a fault.
          reportHandled(error, { action: "resume.fetch-mine" });
          return null;
        }

        reportError(error, { action: "resume.fetch-mine" });
        throw error;
      }
    },
  });
}
