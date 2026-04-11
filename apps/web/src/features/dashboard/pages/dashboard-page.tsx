import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { LinkIcon, LinkResponse } from "@repo/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import axios from "axios";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  createLink,
  createSkillCatalogItem,
  createTitleCatalogItem,
  deleteLink,
  saveResumeSkillsBulk,
  saveResumeTitlesBulk,
  fetchMyResume,
  fetchLinks,
  fetchMyProfile,
  fetchSkillsCatalog,
  fetchTitlesCatalog,
  reorderLinks,
  toggleLinkVisibility,
  upsertResume,
  updateLink,
  updateProfile,
} from "../../../lib/auth-api";
import { clearAuthTokens, getAuthTokens } from "../../../lib/auth-tokens";
import { detectLinkIcon, LINK_ICON_OPTIONS } from "../../../lib/link-icons";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Avatar } from "../../../shared-components/avatar";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { DashboardHeader } from "../components/dashboard-header";
import {
  DashboardLinkForm,
  type LinkFormValues,
} from "../components/dashboard-link-form";
import {
  DashboardProfileForm,
  type ProfileFormValues,
} from "../components/dashboard-profile-form";
import { SortableLinkItem } from "../components/sortable-link-item";
import { ResumeEditDialog } from "../../resume/components/resume-edit-dialog";
import { ResumeReadOnlyCard } from "../../resume/components/resume-read-only-card";

type LinkIconSelectOption = {
  value: LinkIcon | "";
  label: string;
  icon?: ReactNode;
};

const DEFAULT_LINK_ICON_SELECT_OPTION: LinkIconSelectOption = {
  value: "",
  label: "Default icon",
};

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userInfo = useUserInfoStore((state) => state.userInfo);
  const clearUserInfo = useUserInfoStore((state) => state.clearUserInfo);

  const hasSession = Boolean(getAuthTokens() && userInfo);
  const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false);

  const {
    register,
    control,
    handleSubmit: handleLinkFormSubmit,
    setValue,
    reset,
  } = useForm<LinkFormValues>({
    defaultValues: {
      title: "",
      url: "",
      iconOption: DEFAULT_LINK_ICON_SELECT_OPTION,
      isPublic: true,
      editingLinkId: null,
    },
  });

  const watchedLinkTitle = useWatch({ control, name: "title" });
  const watchedLinkUrl = useWatch({ control, name: "url" });
  const watchedEditingLinkId = useWatch({ control, name: "editingLinkId" });

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

  const resumeQuery = useQuery({
    queryKey: ["resume"],
    enabled: hasSession,
    retry: false,
    queryFn: async () => {
      try {
        return await fetchMyResume();
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return null;
        }

        throw error;
      }
    },
  });

  const skillsCatalogQuery = useQuery({
    queryKey: ["resume-catalog-skills"],
    enabled: hasSession,
    queryFn: fetchSkillsCatalog,
  });

  const titlesCatalogQuery = useQuery({
    queryKey: ["resume-catalog-titles"],
    enabled: hasSession,
    queryFn: fetchTitlesCatalog,
  });

  const invalidatePublicProfileCache = () => {
    const currentUsername = meQuery.data?.username;

    if (currentUsername) {
      queryClient.invalidateQueries({
        queryKey: ["public-profile", currentUsername],
      });
      queryClient.invalidateQueries({
        queryKey: ["public-resume", currentUsername],
      });

      return;
    }

    queryClient.invalidateQueries({ queryKey: ["public-profile"] });
    queryClient.invalidateQueries({ queryKey: ["public-resume"] });
  };

  useEffect(() => {
    if (!hasSession) {
      navigate({ to: "/" });
    }
  }, [hasSession, navigate]);

  const resetLinkForm = () => {
    reset({
      title: "",
      url: "",
      iconOption: DEFAULT_LINK_ICON_SELECT_OPTION,
      isPublic: true,
      editingLinkId: null,
    });
  };

  const createLinkMutation = useMutation({
    mutationFn: createLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
      invalidatePublicProfileCache();
      resetLinkForm();
    },
  });

  const updateLinkMutation = useMutation({
    mutationFn: ({
      linkId,
      payload,
    }: {
      linkId: string;
      payload: {
        title: string;
        url: string;
        icon: LinkIcon | null;
        isPublic: boolean;
      };
    }) => updateLink(linkId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
      invalidatePublicProfileCache();
      resetLinkForm();
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: deleteLink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
      invalidatePublicProfileCache();
    },
  });

  const toggleLinkVisibilityMutation = useMutation({
    mutationFn: ({ linkId, isPublic }: { linkId: string; isPublic: boolean }) =>
      toggleLinkVisibility(linkId, { isPublic }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
      invalidatePublicProfileCache();
    },
  });

  const reorderLinksMutation = useMutation({
    mutationFn: reorderLinks,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["links"] });
      invalidatePublicProfileCache();
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      invalidatePublicProfileCache();
    },
  });

  const upsertResumeMutation = useMutation({
    mutationFn: upsertResume,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resume"] });
      invalidatePublicProfileCache();
    },
  });

  const createSkillCatalogMutation = useMutation({
    mutationFn: createSkillCatalogItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resume-catalog-skills"] });
    },
  });

  const createTitleCatalogMutation = useMutation({
    mutationFn: createTitleCatalogItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resume-catalog-titles"] });
    },
  });

  const saveResumeSkillsBulkMutation = useMutation({
    mutationFn: saveResumeSkillsBulk,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resume"] });
      invalidatePublicProfileCache();
    },
  });

  const saveResumeTitlesBulkMutation = useMutation({
    mutationFn: saveResumeTitlesBulk,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resume"] });
      invalidatePublicProfileCache();
    },
  });

  const links = useMemo(() => linksQuery.data ?? [], [linksQuery.data]);

  const linkIconOptions = useMemo<LinkIconSelectOption[]>(
    () => [
      DEFAULT_LINK_ICON_SELECT_OPTION,
      ...LINK_ICON_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
        icon: (
          <option.Icon
            className="h-3.5 w-3.5"
            aria-hidden="true"
            style={{ color: option.color }}
          />
        ),
      })),
    ],
    [],
  );

  const autoDetectedLinkIcon =
    detectLinkIcon({ title: watchedLinkTitle, url: watchedLinkUrl }) ?? null;

  const autoDetectedIconOption =
    linkIconOptions.find(
      (option) => option.value === (autoDetectedLinkIcon ?? ""),
    ) ?? DEFAULT_LINK_ICON_SELECT_OPTION;

  useEffect(() => {
    setValue("iconOption", autoDetectedIconOption, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [autoDetectedIconOption, setValue]);

  const handleSubmitLink = async (data: LinkFormValues) => {
    const icon = (data.iconOption?.value || null) as LinkIcon | null;

    if (data.editingLinkId) {
      await updateLinkMutation.mutateAsync({
        linkId: data.editingLinkId,
        payload: {
          title: data.title,
          url: data.url,
          icon,
          isPublic: data.isPublic,
        },
      });

      return;
    }

    await createLinkMutation.mutateAsync({
      title: data.title,
      url: data.url,
      icon,
      isPublic: data.isPublic,
    });
  };

  const handleEditClick = (link: LinkResponse) => {
    reset({
      title: link.title,
      url: link.url,
      iconOption: DEFAULT_LINK_ICON_SELECT_OPTION,
      isPublic: link.isPublic,
      editingLinkId: link.id,
    });
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

  const handleSaveProfile = async (data: ProfileFormValues) => {
    await updateProfileMutation.mutateAsync({
      username: data.username,
      name: data.name,
      description: data.description,
    });
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-4 lg:flex-row lg:items-start lg:p-8">
      <section className="w-full space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:w-2/3">
        <DashboardHeader username={meQuery.data?.username} onLogout={logout} />

        <DashboardLinkForm
          register={register}
          control={control}
          handleSubmit={handleLinkFormSubmit}
          onSubmit={handleSubmitLink}
          isEditing={Boolean(watchedEditingLinkId)}
          onCancel={resetLinkForm}
          linkIconOptions={linkIconOptions}
        />

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

        <ResumeReadOnlyCard
          resume={resumeQuery.data ?? null}
          isLoading={resumeQuery.isLoading}
          subtitle="Public-facing resume snapshot"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              fullWidth={false}
              className="rounded-full"
              onClick={() => setIsResumeDialogOpen(true)}
            >
              Edit
            </Button>
          }
        />

        <ResumeEditDialog
          open={isResumeDialogOpen}
          onOpenChange={setIsResumeDialogOpen}
          resume={resumeQuery.data ?? null}
          skillsCatalog={skillsCatalogQuery.data ?? []}
          titlesCatalog={titlesCatalogQuery.data ?? []}
          isSavingResume={upsertResumeMutation.isPending}
          isSavingSkills={saveResumeSkillsBulkMutation.isPending}
          isSavingTitles={saveResumeTitlesBulkMutation.isPending}
          onSaveResume={async (payload) => {
            await upsertResumeMutation.mutateAsync(payload);
          }}
          onSaveSkillsBulk={async (payload) => {
            await saveResumeSkillsBulkMutation.mutateAsync(payload);
          }}
          onSaveTitlesBulk={async (payload) => {
            await saveResumeTitlesBulkMutation.mutateAsync(payload);
          }}
          onCreateSkillCatalogItem={async (name) =>
            createSkillCatalogMutation.mutateAsync({ name })
          }
          onCreateTitleCatalogItem={async (name) =>
            createTitleCatalogMutation.mutateAsync({ name })
          }
        />
      </section>

      <aside className="w-full space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:w-1/3">
        <div className="flex gap-2 items-center">
          <Avatar
            name={meQuery.data?.name}
            imageUrl={meQuery.data?.userPhoto}
            size={36}
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

        <DashboardProfileForm
          initialValues={{
            username: meQuery.data?.username ?? "",
            name: meQuery.data?.name ?? "",
            description: meQuery.data?.description ?? "",
          }}
          onSubmit={handleSaveProfile}
        />

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
