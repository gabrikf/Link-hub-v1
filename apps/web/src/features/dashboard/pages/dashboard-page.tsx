import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { LinkIcon, LinkResponse } from "@repo/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  createLink,
  createSkillCatalogItem,
  createTitleCatalogItem,
  deleteLink,
  saveResumeSkillsBulk,
  saveResumeTitlesBulk,
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
import { getAuthTokens } from "../../../lib/auth-tokens";
import { useMyResumeQuery } from "../../../lib/profile-queries";
import { detectLinkIcon, LINK_ICON_OPTIONS } from "../../../lib/link-icons";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Avatar } from "../../../shared-components/avatar";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { DashboardHeader } from "../components/dashboard-header";
import { DashboardProfileDisplay } from "../components/dashboard-profile-display";
import {
  DashboardLinkForm,
  type LinkFormValues,
} from "../components/dashboard-link-form";
import {
  DashboardProfileForm,
  type ProfileFormValues,
} from "../components/dashboard-profile-form";
import { DEFAULT_THEME_PRESET } from "../../profile/components/profile-theme";
import { SortableLinkItem } from "../components/sortable-link-item";
import { ResumeEditDialog } from "../../resume/components/resume-edit-dialog";
import { ResumeReadOnlyCard } from "../../resume/components/resume-read-only-card";
import { WorkHistoryManager } from "../../work-history/components/work-history-manager";
import { ResumeImportModal } from "../../resume-import/components/resume-import-modal";
import { FiUploadCloud } from "react-icons/fi";

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

  const hasSession = Boolean(getAuthTokens() && userInfo);
  const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const hasCheckedImportPromptRef = useRef(false);

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

  const resumeQuery = useMyResumeQuery(hasSession);

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

  const importPromptStorageKey = userInfo?.login
    ? `resume-import-prompt-seen:${userInfo.login}`
    : null;

  // First-visit nudge: if the user has no resume yet and hasn't dismissed the
  // prompt before, open the AI import modal automatically. This intentionally
  // runs once when the resume query first settles (syncing UI to async + storage).
  useEffect(() => {
    if (
      hasCheckedImportPromptRef.current ||
      !importPromptStorageKey ||
      resumeQuery.isLoading ||
      !resumeQuery.isFetched
    ) {
      return;
    }

    hasCheckedImportPromptRef.current = true;

    const alreadySeen =
      window.localStorage.getItem(importPromptStorageKey) === "true";

    if (!alreadySeen && !resumeQuery.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time open after async resume load
      setIsImportModalOpen(true);
    }
  }, [
    importPromptStorageKey,
    resumeQuery.isLoading,
    resumeQuery.isFetched,
    resumeQuery.data,
  ]);

  const handleImportModalOpenChange = (open: boolean) => {
    setIsImportModalOpen(open);
    if (!open && importPromptStorageKey) {
      window.localStorage.setItem(importPromptStorageKey, "true");
    }
  };

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

  // Memoized on the individual saved profile field values (NOT on a fresh object
  // literal per render). A background `meQuery` refetch on window refocus, or the
  // mutation pending-flip while the edit modal is OPEN, no longer produces a new
  // object identity — so the form's `reset(initialValues)` effect doesn't fire
  // and in-progress edits are preserved. A real change to the saved profile (e.g.
  // after a successful save re-fetches) yields a new reference and re-hydrates.
  const profileFormInitialValues = useMemo<ProfileFormValues>(
    () => ({
      username: meQuery.data?.username ?? "",
      name: meQuery.data?.name ?? "",
      description: meQuery.data?.description ?? "",
      userPhoto: meQuery.data?.userPhoto ?? "",
      bannerImageUrl: meQuery.data?.bannerImageUrl ?? "",
      backgroundImageUrl: meQuery.data?.backgroundImageUrl ?? "",
      themePreset: meQuery.data?.themePreset ?? DEFAULT_THEME_PRESET,
      themeAccent: meQuery.data?.themeAccent ?? "",
      openToWork: meQuery.data?.openToWork ?? false,
      location: meQuery.data?.location ?? "",
      persona: meQuery.data?.persona ?? "",
    }),
    [
      meQuery.data?.username,
      meQuery.data?.name,
      meQuery.data?.description,
      meQuery.data?.userPhoto,
      meQuery.data?.bannerImageUrl,
      meQuery.data?.backgroundImageUrl,
      meQuery.data?.themePreset,
      meQuery.data?.themeAccent,
      meQuery.data?.openToWork,
      meQuery.data?.location,
      meQuery.data?.persona,
    ],
  );

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

  const handleSaveProfile = async (data: ProfileFormValues) => {
    await updateProfileMutation.mutateAsync({
      username: data.username,
      name: data.name,
      description: data.description,
      userPhoto: data.userPhoto.trim() || null,
      bannerImageUrl: data.bannerImageUrl.trim() || null,
      backgroundImageUrl: data.backgroundImageUrl.trim() || null,
      themePreset: data.themePreset,
      themeAccent: data.themeAccent.trim() || null,
      openToWork: data.openToWork,
      location: data.location.trim() || null,
      persona: data.persona || null,
    });
    setIsProfileDialogOpen(false);
  };

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-4 lg:flex-row lg:items-start lg:p-8">
      {/* Ambient futuristic backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="anim-grid-bg absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_65%)]" />
        <div className="anim-float absolute -top-20 right-10 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <section className="anim-fade-up w-full space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm lg:w-2/3 dark:border-zinc-800 dark:bg-zinc-900">
        <DashboardHeader />

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

        <div className="anim-sheen anim-glow-pulse flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-violet-500/30 dark:bg-violet-500/10">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-700 text-white">
              <FiUploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Import from your resume
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Upload a PDF or Word file and let AI auto-fill your resume and
                work history.
              </p>
            </div>
          </div>
          <Button
            type="button"
            fullWidth={false}
            className="shrink-0 rounded-full"
            onClick={() => setIsImportModalOpen(true)}
          >
            <FiUploadCloud className="h-4 w-4" aria-hidden="true" />
            Import resume file
          </Button>
        </div>

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

        <WorkHistoryManager
          enabled={hasSession}
          onMutated={invalidatePublicProfileCache}
        />

        <ResumeImportModal
          open={isImportModalOpen}
          onOpenChange={handleImportModalOpenChange}
          currentResume={resumeQuery.data ?? null}
          currentProfileName={meQuery.data?.name ?? ""}
          currentProfileDescription={meQuery.data?.description ?? null}
          onApplied={() => {
            queryClient.invalidateQueries({ queryKey: ["resume"] });
            queryClient.invalidateQueries({ queryKey: ["work-experiences"] });
            queryClient.invalidateQueries({ queryKey: ["me"] });
            invalidatePublicProfileCache();
          }}
        />
      </section>

      <aside className="anim-fade-up anim-delay-2 w-full space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 lg:w-1/3">
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

        <DashboardProfileDisplay
          name={meQuery.data?.name ?? ""}
          username={meQuery.data?.username ?? ""}
          description={meQuery.data?.description ?? null}
          avatarUrl={meQuery.data?.userPhoto ?? null}
          bannerImageUrl={meQuery.data?.bannerImageUrl ?? null}
          backgroundImageUrl={meQuery.data?.backgroundImageUrl ?? null}
          themePreset={meQuery.data?.themePreset ?? null}
          themeAccent={meQuery.data?.themeAccent ?? null}
          openToWork={meQuery.data?.openToWork ?? false}
          location={meQuery.data?.location ?? null}
          persona={meQuery.data?.persona ?? null}
          onEdit={() => setIsProfileDialogOpen(true)}
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

        <Dialog
          open={isProfileDialogOpen}
          onOpenChange={setIsProfileDialogOpen}
          title="Edit profile"
          description="Update your public identity and appearance."
          contentClassName="max-w-3xl"
        >
          <DashboardProfileForm
            avatarUrl={meQuery.data?.userPhoto ?? null}
            initialValues={profileFormInitialValues}
            onSubmit={handleSaveProfile}
          />
        </Dialog>
      </aside>
    </main>
  );
}
