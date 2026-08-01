import {
  createPostSchemaInput,
  postSchema,
  updatePostSchemaInput,
  type CreatePostInput,
  type Post,
  type UpdatePostInput,
} from "@repo/schemas";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
// Post fetchers live here (not in auth-api.ts) to avoid conflicts with a
// parallel agent. They reuse the shared authed axios wrapper from auth-api so
// base URL + bearer/refresh header handling stay in exactly one place.
import { fetchWithTokens } from "./auth-api";

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

export async function fetchPublicPosts(
  username: string,
  params: PublicPostsParams = {},
): Promise<Post[]> {
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
  return postSchema.array().parse(response.data);
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

export function useMyPosts(enabled = true) {
  return useQuery({
    queryKey: postQueryKeys.mine,
    queryFn: () => fetchMyPosts(),
    enabled,
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

export function useDeletePost() {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (postId: string) => deletePost(postId),
    onSuccess: invalidate,
  });
}
