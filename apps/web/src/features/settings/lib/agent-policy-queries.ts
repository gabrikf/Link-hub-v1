import type {
  AgentDisclosureLevel,
  UpdateAgentPolicyInput,
} from "@repo/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAgentPolicy,
  fetchMyWorkExperiences,
  updateAgentPolicy,
  updateWorkExperienceDisclosure,
} from "../../../lib/auth-api";

/**
 * Query keys for the disclosure panel.
 *
 * Work experiences are read here only to list the roles a per-employer override
 * can be attached to — the effective level for each comes from the policy's
 * `perEmployer`, which is the server's derived view and the single source of
 * truth for what an agent will actually do.
 */
export const agentPolicyQueryKeys = {
  policy: ["agent-policy"] as const,
  workExperiences: ["work-experiences"] as const,
};

export function useAgentPolicy(enabled = true) {
  return useQuery({
    queryKey: agentPolicyQueryKeys.policy,
    queryFn: fetchAgentPolicy,
    enabled,
  });
}

export function useWorkExperiencesForPolicy(enabled = true) {
  return useQuery({
    queryKey: agentPolicyQueryKeys.workExperiences,
    queryFn: fetchMyWorkExperiences,
    enabled,
  });
}

function useInvalidatePolicy() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: agentPolicyQueryKeys.policy });
  };
}

export function useUpdateAgentPolicy() {
  const invalidate = useInvalidatePolicy();
  return useMutation({
    mutationFn: (payload: UpdateAgentPolicyInput) => updateAgentPolicy(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateWorkExperienceDisclosure() {
  const invalidate = useInvalidatePolicy();
  return useMutation({
    mutationFn: (variables: {
      workExperienceId: string;
      disclosureLevel: AgentDisclosureLevel | null;
    }) =>
      updateWorkExperienceDisclosure(
        variables.workExperienceId,
        variables.disclosureLevel,
      ),
    onSuccess: invalidate,
  });
}
