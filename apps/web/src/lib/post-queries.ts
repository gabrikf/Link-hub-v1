import {
  createPostSchemaInput,
  postSchema,
  publicPostSchema,
  updatePostSchemaInput,
  type CreatePostInput,
  type Post,
  type PublicPost,
  type UpdatePostInput,
} from "@repo/schemas";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
// Post fetchers live here (not in auth-api.ts) to avoid conflicts with a
// parallel agent. They reuse the shared authed axios wrapper from auth-api so
// base URL + bearer/refresh header handling stay in exactly one place.
import { fetchWithTokens } from "./auth-api";
import { reportError } from "./report-error";

/* ------------------------------------------------------------------ *
 * Query keys
 * ------------------------------------------------------------------ */

export type PublicPostsParams = {
  limit?: number;
  offset?: number;
};

export const postQueryKeys = {
  mine: ["my-posts"] as const,
  public: (username: string, params: PublicPostsParams = {}) =>
    ["public-posts", username, params.limit ?? null, params.offset ?? null] as const,
};

/* ------------------------------------------------------------------ *
 * Fetchers
 * ------------------------------------------------------------------ */

export async function fetchMyPosts(
  limit = 50,
  offset = 0,
): Promise<Post[]> {
  const response = await fetchWithTokens(
    `/me/posts?limit=${limit}&offset=${offset}`,
    { method: "GET" },
  );
  return postSchema.array().parse(response.data);
}

export async function fetchPostById(postId: string): Promise<Post> {
  const response = await fetchWithTokens(`/me/posts/${postId}`, {
    method: "GET",
  });
  return postSchema.parse(response.data);
}

/**
 * The public feed serves `publicPostSchema` — a post without `metadata`, which
 * is provenance that may never leave the owner's own views. Parsing it with
 * `postSchema` (where `metadata` is required) made every profile with a
 * published post render the error state, so this parses the shape the route
 * actually declares.
 */
export async function fetchPublicPosts(
  username: string,
  params: PublicPostsParams = {},
): Promise<PublicPost[]> {
  // Public endpoint — fetchWithTokens only *adds* auth headers when present, so
  // it works both for a logged-out visitor and the owner previewing their feed.
  const query = new URLSearchParams();
  if (params.limit !== undefined) {
    query.set("limit", String(params.limit));
  }
  if (params.offset !== undefined) {
    query.set("offset", String(params.offset));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetchWithTokens(`/profile/${username}/posts${suffix}`, {
    method: "GET",
  });
  return publicPostSchema.array().parse(response.data);
}

export async function createPost(payload: CreatePostInput): Promise<Post> {
  const body = createPostSchemaInput.parse(payload);
  const response = await fetchWithTokens("/me/posts", {
    method: "POST",
    data: body,
  });
  return postSchema.parse(response.data);
}

export async function updatePost(
  postId: string,
  payload: UpdatePostInput,
): Promise<Post> {
  const body = updatePostSchemaInput.parse(payload);
  const response = await fetchWithTokens(`/me/posts/${postId}`, {
    method: "PATCH",
    data: body,
  });
  return postSchema.parse(response.data);
}

/**
 * `pending_review -> published`. Separate from `updatePost` on purpose: a
 * machine-authored post rejects any PATCH that touches its content, so approval
 * is its own endpoint rather than `{ status: "published" }` on a general update.
 * Idempotent server-side — approving an already-published post returns it as-is.
 */
export async function approvePost(postId: string): Promise<Post> {
  const response = await fetchWithTokens(`/me/posts/${postId}/approve`, {
    method: "POST",
  });
  return postSchema.parse(response.data);
}

export async function deletePost(
  postId: string,
): Promise<{ success: boolean }> {
  const response = await fetchWithTokens(`/me/posts/${postId}`, {
    method: "DELETE",
  });
  return response.data as { success: boolean };
}

/* ------------------------------------------------------------------ *
 * React Query hooks
 * ------------------------------------------------------------------ */

export function useMyPosts(
  enabled = true,
  options: {
    /**
     * Polling opt-in for the auto-post wizard's MCP verify step, which watches
     * for a post the user's agent creates out-of-band. Off everywhere else.
     */
    refetchInterval?: number | false;
  } = {},
) {
  return useQuery({
    queryKey: postQueryKeys.mine,
    queryFn: () => fetchMyPosts(),
    enabled,
    refetchInterval: options.refetchInterval ?? false,
    // The verify step's promise is "flips green the moment the post arrives",
    // and the user is in their agent — this tab hidden — when it does.
    refetchIntervalInBackground: (options.refetchInterval ?? false) !== false,
  });
}

export function usePublicPosts(
  username: string,
  params: PublicPostsParams = {},
  enabled = true,
) {
  return useQuery({
    queryKey: postQueryKeys.public(username, params),
    queryFn: () => fetchPublicPosts(username, params),
    enabled: enabled && username.length > 0,
  });
}

/** Invalidate every post cache (own list + any public feed). */
function useInvalidatePosts() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: postQueryKeys.mine });
    queryClient.invalidateQueries({ queryKey: ["public-posts"] });
  };
}

/**
 * Optimistic edit of the cached `my-posts` list.
 *
 * Same shape as the layout editor's `patchLayout`/`rollback` pair
 * (`features/profile-layout/pages/profile-layout-page.tsx`): snapshot, patch,
 * hand the snapshot back as mutation context, restore it in `onError`,
 * reconcile with the server in `onSettled`.
 *
 * The one addition is `cancelQueries`. A `my-posts` refetch that was already in
 * flight when the user hit Approve would otherwise land *after* the patch and
 * put the approved post straight back into the queue, which reads exactly like
 * the approve silently failing.
 */
async function patchMyPosts(
  queryClient: QueryClient,
  fn: (posts: Post[]) => Post[],
): Promise<Post[] | undefined> {
  await queryClient.cancelQueries({ queryKey: postQueryKeys.mine });
  const previous = queryClient.getQueryData<Post[]>(postQueryKeys.mine);
  queryClient.setQueryData<Post[]>(postQueryKeys.mine, (current) =>
    current ? fn(current) : current,
  );
  return previous;
}

function rollbackMyPosts(
  queryClient: QueryClient,
  previous: Post[] | undefined,
): void {
  if (previous) {
    queryClient.setQueryData(postQueryKeys.mine, previous);
  }
}

export function useCreatePost() {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (payload: CreatePostInput) => createPost(payload),
    onSuccess: invalidate,
  });
}

export function useUpdatePost() {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: ({
      postId,
      patch,
    }: {
      postId: string;
      patch: UpdatePostInput;
    }) => updatePost(postId, patch),
    onSuccess: invalidate,
  });
}

/**
 * Approve a post waiting for review.
 *
 * Optimistically flips the cached row to `published` rather than dropping it:
 * the review queue filters on `status === "pending_review"`, so the item leaves
 * the queue immediately, while the posts list — which shows every status —
 * keeps the card and just re-badges it.
 */
export function useApprovePost() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (postId: string) => approvePost(postId),
    onMutate: async (postId: string) => {
      const approvedAt = new Date();
      const previous = await patchMyPosts(queryClient, (posts) =>
        posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                status: "published" as const,
                publishedAt: post.publishedAt ?? approvedAt,
              }
            : post,
        ),
      );
      return { previous };
    },
    onError: (error, postId, context) => {
      reportError(error, { action: "posts.approve", extra: { postId } });
      return rollbackMyPosts(queryClient, context?.previous);
    },
    onSettled: invalidate,
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (postId: string) => deletePost(postId),
    onMutate: async (postId: string) => {
      const previous = await patchMyPosts(queryClient, (posts) =>
        posts.filter((post) => post.id !== postId),
      );
      return { previous };
    },
    onError: (error, postId, context) => {
      reportError(error, { action: "posts.delete", extra: { postId } });
      return rollbackMyPosts(queryClient, context?.previous);
    },
    onSettled: invalidate,
  });
}
