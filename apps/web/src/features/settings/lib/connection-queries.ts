import {
  createGitConnectionSchemaInput,
  digestPreviewSchema,
  gitConnectionHealthSchema,
  gitConnectionSchema,
  updateGitConnectionSchemaInput,
  type CreateGitConnectionInput,
  type DigestPreview,
  type GitConnection,
  type GitConnectionHealth,
  type UpdateGitConnectionInput,
} from "@repo/schemas";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
// Connection fetchers live here rather than in `auth-api.ts` for the same
// reason `post-queries.ts` and `token-queries.ts` do: that module is large and
// read by other work in flight. They reuse the shared authed axios wrapper, so
// base URL + bearer/refresh handling stay in exactly one place.
import { fetchWithTokens } from "../../../lib/auth-api";
import { reportError } from "../../../lib/report-error";

/* ------------------------------------------------------------------ *
 * Query keys
 * ------------------------------------------------------------------ */

export const connectionQueryKeys = {
  mine: ["git-connections"] as const,
  health: (connectionId: string) =>
    ["git-connections", connectionId, "health"] as const,
  digestPreview: (connectionId: string) =>
    ["git-connections", connectionId, "digest-preview"] as const,
};

/* ------------------------------------------------------------------ *
 * Fetchers
 * ------------------------------------------------------------------ */

/**
 * The create response, and only the create response.
 *
 * `gitConnectionSchema` omits `webhookSecret` on purpose, and it strips unknown
 * keys — which is exactly the behaviour we want on every read path. The one
 * moment the plaintext secret must be disclosed is expressed here, by reading
 * it off the raw body after the read model has been parsed, rather than by
 * widening the shared schema.
 */
export type CreateGitConnectionOutput = GitConnection & {
  /** Plaintext, returned exactly once. Null for providers with no signed webhooks. */
  webhookSecret: string | null;
};

export async function fetchMyConnections(): Promise<GitConnection[]> {
  const response = await fetchWithTokens("/me/connections", { method: "GET" });
  return gitConnectionSchema.array().parse(response.data);
}

export async function createConnection(
  payload: CreateGitConnectionInput,
): Promise<CreateGitConnectionOutput> {
  const body = createGitConnectionSchemaInput.parse(payload);
  const response = await fetchWithTokens("/me/connections", {
    method: "POST",
    data: body,
  });

  const connection = gitConnectionSchema.parse(response.data);
  const raw = response.data as { webhookSecret?: string | null };

  return { ...connection, webhookSecret: raw.webhookSecret ?? null };
}

export async function updateConnection(
  connectionId: string,
  payload: UpdateGitConnectionInput,
): Promise<GitConnection> {
  const body = updateGitConnectionSchemaInput.parse(payload);
  const response = await fetchWithTokens(`/me/connections/${connectionId}`, {
    method: "PATCH",
    data: body,
  });

  return gitConnectionSchema.parse(response.data);
}

/**
 * Live counters for one connection — the wizard's "listening for first
 * activity" step polls this. Counts and dates only; the schema has nothing
 * that could echo an identity back, which is what makes polling it in a loop
 * acceptable.
 */
export async function fetchConnectionHealth(
  connectionId: string,
): Promise<GitConnectionHealth> {
  const response = await fetchWithTokens(
    `/me/connections/${connectionId}/health`,
    { method: "GET" },
  );
  return gitConnectionHealthSchema.parse(response.data);
}

/**
 * What the next scheduled digest WOULD say, rendered on demand and thrown
 * away server-side. This is the wizard's proof-by-example: a real post built
 * from the user's real events, before anything is enabled.
 */
export async function fetchDigestPreview(
  connectionId: string,
): Promise<DigestPreview> {
  const response = await fetchWithTokens(
    `/me/connections/${connectionId}/digest-preview`,
    { method: "GET" },
  );
  return digestPreviewSchema.parse(response.data);
}

export async function deleteConnection(
  connectionId: string,
): Promise<{ success: boolean }> {
  const response = await fetchWithTokens(`/me/connections/${connectionId}`, {
    method: "DELETE",
  });

  return response.data as { success: boolean };
}

/* ------------------------------------------------------------------ *
 * React Query hooks
 * ------------------------------------------------------------------ */

export function useMyConnections(enabled = true) {
  return useQuery({
    queryKey: connectionQueryKeys.mine,
    queryFn: fetchMyConnections,
    enabled,
  });
}

type ConnectionHealthOptions = {
  enabled?: boolean;
  /** Pass while the verify step is mounted; omit everywhere else. */
  refetchInterval?: number | false;
};

/**
 * `connectionId` is nullable so the wizard can call this unconditionally —
 * hooks cannot be conditional, but a query can be disabled until the create
 * call has answered with an id.
 */
export function useConnectionHealth(
  connectionId: string | null,
  { enabled = true, refetchInterval = false }: ConnectionHealthOptions = {},
) {
  return useQuery({
    queryKey: connectionQueryKeys.health(connectionId ?? "none"),
    queryFn: () => fetchConnectionHealth(connectionId as string),
    enabled: enabled && connectionId !== null,
    refetchInterval,
    // The wizard's verify step promises "flips green the moment the first
    // event lands", and the user is in a terminal — this tab hidden — at
    // exactly that moment. Without this, TanStack pauses the interval for
    // hidden tabs and the flip waits for a window focus that may never come.
    refetchIntervalInBackground: refetchInterval !== false,
  });
}

export function useDigestPreview(
  connectionId: string | null,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: connectionQueryKeys.digestPreview(connectionId ?? "none"),
    queryFn: () => fetchDigestPreview(connectionId as string),
    enabled: enabled && connectionId !== null,
    // A preview is a point-in-time render; refetching it behind the user's
    // back would swap the post they are reading.
    staleTime: Infinity,
  });
}

function useInvalidateConnections() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: connectionQueryKeys.mine });
}

/**
 * Optimistic edit of the cached connection list — same snapshot / patch /
 * restore-in-`onError` / reconcile-in-`onSettled` shape as `patchMyPosts` in
 * `lib/post-queries.ts`, `cancelQueries` included so an in-flight refetch
 * cannot land after the patch and undo it.
 */
async function patchMyConnections(
  queryClient: QueryClient,
  fn: (connections: GitConnection[]) => GitConnection[],
): Promise<GitConnection[] | undefined> {
  await queryClient.cancelQueries({ queryKey: connectionQueryKeys.mine });
  const previous = queryClient.getQueryData<GitConnection[]>(
    connectionQueryKeys.mine,
  );
  queryClient.setQueryData<GitConnection[]>(
    connectionQueryKeys.mine,
    (current) => (current ? fn(current) : current),
  );
  return previous;
}

function rollbackMyConnections(
  queryClient: QueryClient,
  previous: GitConnection[] | undefined,
): void {
  if (previous) {
    queryClient.setQueryData(connectionQueryKeys.mine, previous);
  }
}

/**
 * Create is deliberately NOT optimistic. The server mints the id the webhook
 * URL is built from and the one-time secret shown afterwards, so there is
 * nothing truthful to render until it answers.
 */
export function useCreateConnection() {
  const invalidate = useInvalidateConnections();
  return useMutation({
    mutationFn: (payload: CreateGitConnectionInput) =>
      createConnection(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateConnection() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateConnections();
  return useMutation({
    mutationFn: ({
      connectionId,
      patch,
    }: {
      connectionId: string;
      patch: UpdateGitConnectionInput;
    }) => updateConnection(connectionId, patch),
    onMutate: async ({ connectionId, patch }) => {
      const previous = await patchMyConnections(queryClient, (connections) =>
        connections.map((connection) =>
          connection.id === connectionId
            ? { ...connection, ...patch }
            : connection,
        ),
      );
      return { previous };
    },
    onError: (error, { connectionId }, context) => {
      reportError(error, {
        action: "settings.update-connection",
        extra: { connectionId },
      });
      return rollbackMyConnections(queryClient, context?.previous);
    },
    onSettled: invalidate,
  });
}

export function useDeleteConnection() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateConnections();
  return useMutation({
    mutationFn: (connectionId: string) => deleteConnection(connectionId),
    onMutate: async (connectionId: string) => {
      const previous = await patchMyConnections(queryClient, (connections) =>
        connections.filter((connection) => connection.id !== connectionId),
      );
      return { previous };
    },
    onError: (error, connectionId, context) => {
      reportError(error, {
        action: "settings.delete-connection",
        extra: { connectionId },
      });
      return rollbackMyConnections(queryClient, context?.previous);
    },
    onSettled: invalidate,
  });
}
