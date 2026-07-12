import type {
  CreatePostInput,
  Post,
  UpdatePostInput,
} from "@repo/schemas";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FiEdit2, FiExternalLink, FiPlus, FiTrash2 } from "react-icons/fi";
import { getAuthTokens } from "../../../lib/auth-tokens";
import {
  useCreatePost,
  useDeletePost,
  useMyPosts,
  useUpdatePost,
} from "../../../lib/post-queries";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Button } from "../../../shared-components/button";
import { PostComposerDialog } from "../components/post-composer-dialog";
import { markdownExcerpt } from "../lib/markdown";
import {
  formatPostDate,
  SOURCE_META,
  STATUS_META,
} from "../lib/post-format";

export function PostsPage() {
  const navigate = useNavigate();
  const userInfo = useUserInfoStore((state) => state.userInfo);
  const hasSession = Boolean(getAuthTokens() && userInfo);

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);

  useEffect(() => {
    if (!hasSession) {
      navigate({ to: "/" });
    }
  }, [hasSession, navigate]);

  const postsQuery = useMyPosts(hasSession);
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const deletePost = useDeletePost();

  const posts = postsQuery.data ?? [];

  const openCreate = () => {
    setEditingPost(null);
    setComposerOpen(true);
  };

  const openEdit = (post: Post) => {
    setEditingPost(post);
    setComposerOpen(true);
  };

  const handleSubmit = async (input: CreatePostInput | UpdatePostInput) => {
    if (editingPost) {
      await updatePost.mutateAsync({
        postId: editingPost.id,
        patch: input as UpdatePostInput,
      });
    } else {
      await createPost.mutateAsync(input as CreatePostInput);
    }
  };

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-4 lg:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="anim-grid-bg absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_65%)]" />
        <div className="anim-float absolute -top-20 right-10 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <header className="anim-fade-up flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="anim-gradient bg-linear-to-r from-violet-600 via-fuchsia-500 to-cyan-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
            Posts
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Write updates, articles and changelog entries. Published posts appear
            in your profile’s Posts block.
          </p>
        </div>
        <Button
          type="button"
          fullWidth={false}
          className="rounded-full"
          onClick={openCreate}
        >
          <FiPlus className="h-4 w-4" aria-hidden="true" />
          New post
        </Button>
      </header>

      {postsQuery.isLoading ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Loading posts...
        </p>
      ) : postsQuery.isError ? (
        <p className="text-sm text-red-600">
          Could not load your posts. Please try again.
        </p>
      ) : posts.length === 0 ? (
        <div className="anim-fade-up rounded-3xl border border-dashed border-zinc-300 bg-white/60 p-10 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            You haven’t written any posts yet.
          </p>
          <Button
            type="button"
            variant="soft"
            fullWidth={false}
            className="mt-4 rounded-full"
            onClick={openCreate}
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" />
            Write your first post
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {posts.map((post, index) => {
            const source = SOURCE_META[post.source];
            const statusMeta = STATUS_META[post.status];
            const excerpt = markdownExcerpt(post.body, 140);
            return (
              <li
                key={post.id}
                style={{ animationDelay: `${0.05 + index * 0.05}s` }}
                className="anim-fade-up group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_0_24px_-6px_rgba(139,92,246,0.5)] dark:border-zinc-800 dark:bg-zinc-900/70 dark:hover:border-violet-500/70"
              >
                {post.coverImageUrl ? (
                  <img
                    src={post.coverImageUrl}
                    alt=""
                    loading="lazy"
                    className="h-36 w-full object-cover"
                  />
                ) : null}
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${statusMeta.className}`}
                    >
                      {statusMeta.label}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${source.className}`}
                    >
                      {source.label}
                    </span>
                    <span className="ml-auto text-xs text-zinc-400">
                      {formatPostDate(post.publishedAt ?? post.createdAt)}
                    </span>
                  </div>

                  <div className="flex-1">
                    <h2 className="line-clamp-2 font-semibold text-zinc-900 dark:text-zinc-100">
                      {post.title ?? (excerpt.slice(0, 60) || "Untitled post")}
                    </h2>
                    {post.title ? (
                      <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {excerpt}
                      </p>
                    ) : null}
                  </div>

                  {post.tags && post.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {post.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700 dark:bg-violet-500/10 dark:text-violet-200"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      fullWidth={false}
                      onClick={() => openEdit(post)}
                    >
                      <FiEdit2 className="h-4 w-4" aria-hidden="true" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      fullWidth={false}
                      shouldHaveConfirmation
                      confirmationTitle="Delete post?"
                      confirmationDescription="This permanently removes the post."
                      onClick={() => deletePost.mutate(post.id)}
                    >
                      <FiTrash2 className="h-4 w-4" aria-hidden="true" />
                      Delete
                    </Button>
                    {post.externalUrl ? (
                      <a
                        href={post.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-violet-600 dark:hover:text-violet-300"
                      >
                        <FiExternalLink className="h-4 w-4" aria-hidden="true" />
                        Link
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PostComposerDialog
        open={composerOpen}
        onOpenChange={(open) => {
          setComposerOpen(open);
          if (!open) {
            setEditingPost(null);
          }
        }}
        initialPost={editingPost}
        isSubmitting={createPost.isPending || updatePost.isPending}
        onSubmit={handleSubmit}
      />
    </main>
  );
}
