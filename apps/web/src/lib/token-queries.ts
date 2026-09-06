import {
  apiTokenSchema,
  createApiTokenSchemaInput,
  createApiTokenSchemaOutput,
  type ApiToken,
  type CreateApiTokenInput,
  type CreateApiTokenOutput,
} from "@repo/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// Personal-access-token fetchers live here (not in auth-api.ts) to avoid
// conflicts with a parallel agent. They reuse the shared authed axios wrapper
// from auth-api so base URL + bearer/refresh header handling stay in exactly
// one place — mirroring post-queries.ts.
import { fetchWithTokens } from "./auth-api";

/* ------------------------------------------------------------------ *
 * Query keys
 * ------------------------------------------------------------------ */

export const tokenQueryKeys = {
  mine: ["my-tokens"] as const,
};

/* ------------------------------------------------------------------ *
 * Fetchers
 * ------------------------------------------------------------------ */

export async function fetchMyTokens(): Promise<ApiToken[]> {
  const response = await fetchWithTokens("/me/tokens", { method: "GET" });
  return apiTokenSchema.array().parse(response.data);
}

export async function createToken(
  payload: CreateApiTokenInput,
): Promise<CreateApiTokenOutput> {
  const body = createApiTokenSchemaInput.parse(payload);
  const response = await fetchWithTokens("/me/tokens", {
    method: "POST",
    data: body,
  });
  return createApiTokenSchemaOutput.parse(response.data);
}

export async function revokeToken(
  tokenId: string,
): Promise<{ success: boolean }> {
  const response = await fetchWithTokens(`/me/tokens/${tokenId}`, {
    method: "DELETE",
  });
  // The endpoint returns 204 (no body) on success.
  return { success: response.status >= 200 && response.status < 300 };
}

/* ------------------------------------------------------------------ *
 * React Query hooks
 * ------------------------------------------------------------------ */

export function useMyTokens(enabled = true) {
  return useQuery({
    queryKey: tokenQueryKeys.mine,
    queryFn: () => fetchMyTokens(),
    enabled,
  });
}

function useInvalidateTokens() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: tokenQueryKeys.mine });
}

export function useCreateToken() {
  const invalidate = useInvalidateTokens();
  return useMutation({
    mutationFn: (payload: CreateApiTokenInput) => createToken(payload),
    onSuccess: invalidate,
  });
}

export function useRevokeToken() {
  const invalidate = useInvalidateTokens();
  return useMutation({
    mutationFn: (tokenId: string) => revokeToken(tokenId),
    onSuccess: invalidate,
  });
}
