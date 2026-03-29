import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { LinkResponse } from "@repo/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  FiExternalLink,
  FiGlobe,
  FiLayout,
  FiLogOut,
  FiPlusCircle,
  FiSave,
  FiX,
} from "react-icons/fi";
import {
  createLink,
  deleteLink,
  fetchLinks,
  fetchMyProfile,
  reorderLinks,
  toggleLinkVisibility,
  updateLink,
  updateProfile,
} from "../../../lib/auth-api";
import { clearAuthTokens, getAuthTokens } from "../../../lib/auth-tokens";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { Input } from "../../../shared-components/input";
import { TextArea } from "../../../shared-components/text-area";
import { SortableLinkItem } from "../components/sortable-link-item";

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userInfo = useUserInfoStore((state) => state.userInfo);
  const clearUserInfo = useUserInfoStore((state) => state.clearUserInfo);

  const hasSession = Boolean(getAuthTokens() && userInfo);

  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkIsPublic, setLinkIsPublic] = useState(true);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: fetchMyProfile,
    enabled: hasSession,
  });

  const linksQuery = useQuery({
    queryKey: ["links"],
    queryFn: fetchLinks,
    enabled: hasSession,
  });

  useEffect(() => {
    if (!hasSession) {
      navigate({ to: "/" });
    }
  }, [hasSession, navigate]);

  const createLinkMutation = useMutation({
    mutationFn: createLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
      setLinkTitle("");
      setLinkUrl("");
      setLinkIsPublic(true);
    },
  });

  const updateLinkMutation = useMutation({
    mutationFn: ({
      linkId,
      payload,
    }: {
      linkId: string;
      payload: { title: string; url: string; isPublic: boolean };
    }) => updateLink(linkId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
      setEditingLinkId(null);
      setLinkTitle("");
      setLinkUrl("");
      setLinkIsPublic(true);
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: deleteLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
    },
  });

  const toggleLinkVisibilityMutation = useMutation({
    mutationFn: ({ linkId, isPublic }: { linkId: string; isPublic: boolean }) =>
      toggleLinkVisibility(linkId, { isPublic }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
    },
  });

  const reorderLinksMutation = useMutation({
    mutationFn: reorderLinks,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const links = useMemo(() => linksQuery.data ?? [], [linksQuery.data]);

  const handleSubmitLink = async () => {
    if (editingLinkId) {
      await updateLinkMutation.mutateAsync({
        linkId: editingLinkId,
        payload: {
          title: linkTitle,
          url: linkUrl,
          isPublic: linkIsPublic,
        },
      });

      return;
    }

    await createLinkMutation.mutateAsync({
      title: linkTitle,
      url: linkUrl,
      isPublic: linkIsPublic,
    });
  };

  const handleEditClick = (link: {
    id: string;
    title: string;
    url: string;
    isPublic: boolean;
  }) => {
    setEditingLinkId(link.id);
    setLinkTitle(link.title);
    setLinkUrl(link.url);
    setLinkIsPublic(link.isPublic);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = links.findIndex((link) => link.id === active.id);
    const newIndex = links.findIndex((link) => link.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const reordered = arrayMove(links, oldIndex, newIndex);

    queryClient.setQueryData(["links"], reordered);

    reorderLinksMutation.mutate(
      {
        linkIds: reordered.map((link) => link.id),
      },
      {
        onError: () => {
          queryClient.setQueryData(["links"], links);
        },
      },
    );
  };

  const logout = () => {
    clearAuthTokens();
    clearUserInfo();
    navigate({ to: "/" });
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const username = String(formData.get("username") ?? "");
    const name = String(formData.get("name") ?? "");
    const description = String(formData.get("description") ?? "");

    await updateProfileMutation.mutateAsync({
      username,
      name,
      description,
    });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-4 lg:flex-row lg:items-start lg:p-8">
      <section className="w-full space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:w-2/3">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 items-center">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-sm">
              <FiLayout className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="flex flex-col">
              <h1 className="flex items-center gap-1 text-lg font-semibold">
                Dashboard
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Manage your link collection.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            {meQuery.data?.username ? (
              <Link
                to="/profile/$username"
                params={{ username: meQuery.data.username }}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
              >
                <FiExternalLink className="h-4 w-4" aria-hidden="true" />
                Public profile
              </Link>
            ) : null}
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
            >
              <FiLogOut className="h-4 w-4" aria-hidden="true" />
              Logout
            </button>
          </div>
        </header>

        <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
          <Input
            id="link-title"
            label="Title"
            placeholder="My website"
            value={linkTitle}
            onChange={(event) => setLinkTitle(event.target.value)}
          />
          <Input
            id="link-url"
            label="URL"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <FiGlobe className="h-4 w-4" aria-hidden="true" />
            <input
              type="checkbox"
              checked={linkIsPublic}
              onChange={(event) => setLinkIsPublic(event.target.checked)}
            />
            Public link
          </label>
          <div className="flex gap-2">
            <Button className="w-auto" onClick={handleSubmitLink}>
              {editingLinkId ? (
                <>
                  <FiSave className="h-4 w-4" aria-hidden="true" />
                  Update link
                </>
              ) : (
                <>
                  <FiPlusCircle className="h-4 w-4" aria-hidden="true" />
                  Create link
                </>
              )}
            </Button>
            {editingLinkId ? (
              <button
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
                onClick={() => {
                  setEditingLinkId(null);
                  setLinkTitle("");
                  setLinkUrl("");
                  setLinkIsPublic(true);
                }}
              >
                <FiX className="h-4 w-4" aria-hidden="true" />
                Cancel
              </button>
            ) : null}
          </div>
        </div>

        {linksQuery.isLoading ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Loading links...
          </p>
        ) : null}

        <DndContext
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={links.map((link) => link.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {links.map((link) => (
                <SortableLinkItem
                  key={link.id}
                  link={link}
                  onToggleVisibility={(linkId, isPublic) => {
                    queryClient.setQueryData<LinkResponse[]>(
                      ["links"],
                      (previous) => {
                        if (!previous) {
                          return previous;
                        }

                        return previous.map((item) =>
                          item.id === linkId ? { ...item, isPublic } : item,
                        );
                      },
                    );

                    toggleLinkVisibilityMutation.mutate({ linkId, isPublic });
                  }}
                  onEdit={handleEditClick}
                  onDelete={(linkId) => deleteLinkMutation.mutate(linkId)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {reorderLinksMutation.isError ? (
          <FeedbackMessage
            tone="error"
            message="Unable to reorder links right now."
          />
        ) : null}
      </section>

      <aside className="w-full space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:w-1/3">
        <div className="flex gap-2 items-center">
          <img
            src={meQuery.data?.userPhoto ?? undefined}
            alt={meQuery.data?.name ?? "User photo"}
            className="h-9 w-9 items-center justify-center rounded-full "
            aria-hidden="true"
          />
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              Profile
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Update your public identity.
            </p>
          </div>
        </div>

        <form
          key={meQuery.data?.username ?? "profile-form"}
          className="space-y-4"
          onSubmit={handleSaveProfile}
        >
          <Input
            id="profile-username"
            name="username"
            label="Username"
            defaultValue={meQuery.data?.username}
          />
          <Input
            id="profile-name"
            name="name"
            label="Name"
            defaultValue={meQuery.data?.name}
          />
          <TextArea
            id="profile-description"
            name="description"
            label="Description"
            rows={5}
            defaultValue={meQuery.data?.description ?? ""}
          />

          <Button className="w-auto" type="submit">
            <FiSave className="h-4 w-4" aria-hidden="true" />
            Save profile
          </Button>
        </form>

        {updateProfileMutation.isError ? (
          <FeedbackMessage
            tone="error"
            message={
              updateProfileMutation.error instanceof Error
                ? updateProfileMutation.error.message
                : "Unable to update profile"
            }
          />
        ) : null}
      </aside>
    </main>
  );
}
