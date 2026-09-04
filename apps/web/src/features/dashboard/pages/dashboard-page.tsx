import { zodResolver } from "@hookform/resolvers/zod";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  DEFAULT_PROFILE_APPEARANCE,
  type LinkIcon,
  type LinkResponse,
} from "@repo/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
import { RETRY_BEHIND_AN_ERROR_STATE } from "../../../lib/query-client";
import { reportError } from "../../../lib/report-error";
import { detectLinkIcon, LINK_ICON_OPTIONS } from "../../../lib/link-icons";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { SURFACE } from "../../../shared-components/surface";
import { DashboardHeader } from "../components/dashboard-header";
import { DashboardProfileDisplay } from "../components/dashboard-profile-display";
import { DashboardProfileDisplayError } from "../components/dashboard-profile-display-error";
import { DashboardProfileDisplaySkeleton } from "../components/dashboard-profile-display-skeleton";
import { LinkListSkeleton } from "../components/link-list-skeleton";
import { DashboardLinkForm } from "../components/dashboard-link-form";
import { linkFormSchema, type LinkFormValues } from "../lib/link-form-schema";
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

type MutationErrorSource = { isError: boolean; error: unknown };

/** First failing mutation's message, or its fallback copy. */
function resolveLinkMutationError(
  candidates: ReadonlyArray<readonly [MutationErrorSource, string]>,
): string | null {
  const failure = candidates.find(([mutation]) => mutation.isError);

  if (!failure) {
    return null;
  }

  const [mutation, fallback] = failure;

  return mutation.error instanceof Error && mutation.error.message
    ? mutation.error.message
    : fallback;
}

export function DashboardPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const userInfo = useUserInfoStore((state) => state.userInfo);
  const syncUserInfo = useUserInfoStore((state) => state.syncUserInfo);

  const DEFAULT_LINK_ICON_SELECT_OPTION: LinkIconSelectOption = {
    value: "",
    label: t("links.defaultIcon"),
  };

  const hasSession = Boolean(getAuthTokens() && userInfo);
  const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isProfileFormDirty, setIsProfileFormDirty] = useState(false);
  const [isDiscardProfileEditOpen, setIsDiscardProfileEditOpen] =
    useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const linkFormRef = useRef<HTMLDivElement | null>(null);
  const skipNextIconAutoDetectRef = useRef(false);

  const {
    register,
    control,
    handleSubmit: handleLinkFormSubmit,
    setValue,
    setFocus,
    reset,
    formState: { errors: linkFormErrors },
  } = useForm<LinkFormValues>({
    resolver: zodResolver(linkFormSchema),
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
    ...RETRY_BEHIND_AN_ERROR_STATE,
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

  /**
   * The AI-import prompt used to auto-open a modal over a dashboard the user
   * had not seen yet, and its `localStorage` dismissal key was permanent — so
   * the reflexive "close the thing covering my screen" meant they never saw the
   * prompt again. The inline card below carries the same call to action, so it
   * just gets highlighted while there is no resume to show. Nothing to dismiss,
   * nothing to lose, and it disappears on its own once a resume exists.
   */
  const shouldHighlightImport = resumeQuery.isFetched && !resumeQuery.data;

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
    onSuccess: (updated) => {
      /*
       * BEFORE the invalidation, and not optional: this form is the only place
       * a handle can change, and the persisted `userInfo` is what `TopBarNav`
       * turns into the "Public profile" link. Invalidating `["me"]` refreshes
       * this page but not that snapshot, so a rename used to leave the nav
       * pointing at the old username — a 404 on the owner's own profile until
       * they signed out. `invalidatePublicProfileCache` still runs against the
       * OLD handle on purpose: that is the cache entry that just went stale.
       */
      syncUserInfo(updated);
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

  /**
   * Create / update / delete / toggle all used to fail completely silently —
   * no `onError`, no message anywhere on the page. Only reorder had a surface.
   * The first failing mutation wins; they can't realistically overlap.
   */
  const linkMutationError = resolveLinkMutationError([
    [createLinkMutation, t("links.createFailed")],
    [updateLinkMutation, t("links.updateFailed")],
    [deleteLinkMutation, t("links.deleteFailed")],
    [toggleLinkVisibilityMutation, t("links.visibilityFailed")],
  ]);

  const isCatalogLoading =
    skillsCatalogQuery.isLoading || titlesCatalogQuery.isLoading;

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
      appearance: meQuery.data?.appearance ?? DEFAULT_PROFILE_APPEARANCE,
      themePreset: meQuery.data?.themePreset ?? DEFAULT_THEME_PRESET,
      themeAccent: meQuery.data?.themeAccent ?? "",
      openToWork: meQuery.data?.openToWork ?? false,
      location: meQuery.data?.location ?? "",
      persona: meQuery.data?.persona ?? "",
      personaOther: meQuery.data?.personaOther ?? "",
    }),
    [
      meQuery.data?.username,
      meQuery.data?.name,
      meQuery.data?.description,
      meQuery.data?.userPhoto,
      meQuery.data?.bannerImageUrl,
      meQuery.data?.backgroundImageUrl,
      meQuery.data?.appearance,
      meQuery.data?.themePreset,
      meQuery.data?.themeAccent,
      meQuery.data?.openToWork,
      meQuery.data?.location,
      meQuery.data?.persona,
      meQuery.data?.personaOther,
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
    [t, DEFAULT_LINK_ICON_SELECT_OPTION],
  );

  const autoDetectedLinkIcon =
    detectLinkIcon({ title: watchedLinkTitle, url: watchedLinkUrl }) ?? null;

  const autoDetectedIconOption =
    linkIconOptions.find(
      (option) => option.value === (autoDetectedLinkIcon ?? ""),
    ) ?? DEFAULT_LINK_ICON_SELECT_OPTION;

  // Auto-detection must not run on the pass right after Edit populates the
  // form, or it would immediately overwrite the icon the link was saved with.
  useEffect(() => {
    if (skipNextIconAutoDetectRef.current) {
      skipNextIconAutoDetectRef.current = false;
      return;
    }

    setValue("iconOption", autoDetectedIconOption, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [autoDetectedIconOption, setValue]);

  // `mutateAsync` rejects on a failed save. Without this catch the rejection was
  // unhandled and the user got nothing at all — no spinner, no cleared form, no
  // message — so they just clicked Create again. The mutation's own `isError`
  // drives the message below; this only stops the unhandled rejection.
  const handleSubmitLink = async (data: LinkFormValues) => {
    const icon = (data.iconOption?.value || null) as LinkIcon | null;

    try {
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
    } catch (error) {
      // Surfaced by `linkMutationError` below — reported here because the
      // message the user sees does not tell us the save failed.
      reportError(error, {
        action: "dashboard.save-link",
        extra: { isEdit: Boolean(data.editingLinkId) },
      });
    }
  };

  const handleEditClick = (link: LinkResponse) => {
    skipNextIconAutoDetectRef.current = true;
    reset({
      title: link.title,
      url: link.url,
      // Was `DEFAULT_LINK_ICON_SELECT_OPTION`, which silently reverted a
      // manually chosen icon to the default on the next save.
      iconOption:
        linkIconOptions.find((option) => option.value === (link.icon ?? "")) ??
        DEFAULT_LINK_ICON_SELECT_OPTION,
      isPublic: link.isPublic,
      editingLinkId: link.id,
    });

    // The form is at the top of a potentially long list — repopulating it
    // off-screen looked like the Edit click did nothing.
    linkFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setFocus("title");
  };

  // Hoisted out of the list's map callback: an inline handler there nested a
  // third function (the `setQueryData` updater) inside a second (the JSX
  // callback prop) inside the map, tripping sonarjs/no-nested-functions.
  const handleToggleVisibility = (linkId: string, isPublic: boolean) => {
    queryClient.setQueryData<LinkResponse[]>(["links"], (previous) => {
      if (!previous) {
        return previous;
      }

      return previous.map((item) =>
        item.id === linkId ? { ...item, isPublic } : item,
      );
    });

    toggleLinkVisibilityMutation.mutate({ linkId, isPublic });
  };

  // Without an explicit sensor list dnd-kit falls back to a KeyboardSensor with
  // no coordinate getter: arrow keys translate the lifted item by a fixed
  // offset that never reaches the neighbour's collision box, so `over` stays
  // the item itself and the drop is a no-op. `sortableKeyboardCoordinates`
  // moves it to the next sortable item instead, which is what makes the list
  // reorderable without a pointer. PointerSensor is declared with no options so
  // the mouse behaviour stays exactly what it was.
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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
        onError: (error) => {
          reportError(error, {
            action: "dashboard.reorder-links",
            extra: { linkCount: reordered.length },
          });
          queryClient.setQueryData(["links"], links);
        },
      },
    );
  };

  /**
   * Closing with unsaved edits asks first; a clean form closes straight away.
   * Opening always passes through.
   */
  const handleProfileDialogOpenChange = (open: boolean) => {
    if (!open && isProfileFormDirty) {
      setIsDiscardProfileEditOpen(true);
      return;
    }

    setIsProfileDialogOpen(open);
  };

  const handleSaveProfile = async (data: ProfileFormValues) => {
    try {
      await updateProfileMutation.mutateAsync({
        username: data.username,
        name: data.name,
        description: data.description,
        userPhoto: data.userPhoto.trim() || null,
        bannerImageUrl: data.bannerImageUrl.trim() || null,
        backgroundImageUrl: data.backgroundImageUrl.trim() || null,
        appearance: data.appearance,
        themePreset: data.themePreset,
        themeAccent: data.themeAccent.trim() || null,
        openToWork: data.openToWork,
        location: data.location.trim() || null,
        persona: data.persona || null,
        // Only meaningful while persona is "other"; the API clears it anyway
        // whenever persona is something else, so the two can never disagree.
        personaOther:
          data.persona === "other" ? data.personaOther?.trim() || null : null,
      });

      // Only on success. A rejected save (e.g. duplicate username) keeps the
      // modal open, where `errorMessage` now explains why.
      setIsProfileFormDirty(false);
      setIsProfileDialogOpen(false);
    } catch (error) {
      // Surfaced inside the modal via `updateProfileMutation.isError`.
      reportError(error, { action: "dashboard.save-profile" });
    }
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

        <div ref={linkFormRef} className="scroll-mt-4">
          <DashboardLinkForm
            register={register}
            control={control}
            handleSubmit={handleLinkFormSubmit}
            onSubmit={handleSubmitLink}
            errors={linkFormErrors}
            isSubmitting={
              createLinkMutation.isPending || updateLinkMutation.isPending
            }
            isEditing={Boolean(watchedEditingLinkId)}
            onCancel={resetLinkForm}
            linkIconOptions={linkIconOptions}
          />
        </div>

        {linkMutationError ? (
          <FeedbackMessage tone="error" message={linkMutationError} />
        ) : null}

        {/* The list used to render an EMPTY DndContext under a "Loading
            links..." line; the placeholders now occupy the rows the links will
            take, and the drag context mounts with real items. */}
        {linksQuery.isLoading ? (
          <LinkListSkeleton />
        ) : (
          <DndContext
            sensors={sensors}
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
                    onToggleVisibility={handleToggleVisibility}
                    onEdit={handleEditClick}
                    onDelete={(linkId) => deleteLinkMutation.mutate(linkId)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {reorderLinksMutation.isError ? (
          <FeedbackMessage tone="error" message={t("links.reorderFailed")} />
        ) : null}

        <div
          className={[
            "flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-violet-500/30 dark:bg-violet-500/10",
            shouldHighlightImport
              ? "anim-glow-pulse ring-2 ring-violet-400 dark:ring-violet-500/60"
              : "",
          ].join(" ")}
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-700 text-white">
              <FiUploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {t("dashboard.importFromResume")}
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                {t("dashboard.importFromResumeHelp")}
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
            {t("dashboard.importResumeFile")}
          </Button>
        </div>

        <ResumeReadOnlyCard
          resume={resumeQuery.data ?? null}
          isLoading={resumeQuery.isLoading}
          subtitle={t("dashboard.resumeSnapshot")}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              fullWidth={false}
              className="rounded-full"
              // The edit dialog is driven by the skill/title catalogs; opening
              // it before they arrive shows empty pickers, so the trigger stays
              // busy until they do (they had no loading UI at all).
              isLoading={isCatalogLoading}
              loadingLabel={t("common.edit")}
              onClick={() => setIsResumeDialogOpen(true)}
            >
              {t("common.edit")}
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
          onOpenChange={setIsImportModalOpen}
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

      <aside
        className={`anim-fade-up w-full space-y-4 p-5 ${SURFACE} lg:w-1/3`}
        style={{ animationDelay: "0.12s" }}
      >
        {/* Text-only heading, like every other dashboard section header. The
            avatar used to sit here too, so the photo rendered twice within the
            same card — once beside the title and again in the identity row
            immediately below it. */}
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {t("common.profile")}
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t("dashboard.updateIdentity")}
          </p>
        </div>

        {/* Error is its own state. Rendering the display's defaults for a
            failed /me made a transient 5xx look like a wiped account. Stale
            data still wins over the error panel: showing what we last had
            beats blanking the panel on a failed background refetch. */}
        {meQuery.isLoading ? (
          <DashboardProfileDisplaySkeleton />
        ) : meQuery.isError && !meQuery.data ? (
          <DashboardProfileDisplayError
            onRetry={() => {
              void meQuery.refetch();
            }}
            isRetrying={meQuery.isFetching}
          />
        ) : (
          <DashboardProfileDisplay
            name={meQuery.data?.name ?? ""}
            username={meQuery.data?.username ?? ""}
            description={meQuery.data?.description ?? null}
            avatarUrl={meQuery.data?.userPhoto ?? null}
            bannerImageUrl={meQuery.data?.bannerImageUrl ?? null}
            backgroundImageUrl={meQuery.data?.backgroundImageUrl ?? null}
            appearance={meQuery.data?.appearance ?? null}
            themePreset={meQuery.data?.themePreset ?? null}
            themeAccent={meQuery.data?.themeAccent ?? null}
            openToWork={meQuery.data?.openToWork ?? false}
            location={meQuery.data?.location ?? null}
            persona={meQuery.data?.persona ?? null}
            personaOther={meQuery.data?.personaOther ?? null}
            onEdit={() => setIsProfileDialogOpen(true)}
          />
        )}

        <Dialog
          open={isProfileDialogOpen}
          onOpenChange={handleProfileDialogOpenChange}
          title={t("dashboard.editProfile")}
          description={t("dashboard.updateIdentityAndAppearance")}
          contentClassName="max-w-3xl"
        >
          <DashboardProfileForm
            avatarUrl={meQuery.data?.userPhoto ?? null}
            initialValues={profileFormInitialValues}
            // From `/me`, not from `initialValues`: this is "what the account
            // holds right now", and it is what keeps the availability check
            // silent about the handle the person already owns.
            currentUsername={meQuery.data?.username}
            onSubmit={handleSaveProfile}
            isSaving={updateProfileMutation.isPending}
            onDirtyChange={setIsProfileFormDirty}
            errorMessage={
              updateProfileMutation.isError
                ? updateProfileMutation.error instanceof Error
                  ? updateProfileMutation.error.message
                  : t("dashboard.unableToUpdateProfile")
                : null
            }
          />
        </Dialog>

        {/* Confirmation for discarding an in-progress appearance edit. Esc, the
            X and an overlay click all route through here. */}
        <Dialog
          open={isDiscardProfileEditOpen}
          onOpenChange={setIsDiscardProfileEditOpen}
          title={t("dashboard.discardTitle")}
          description={t("dashboard.discardDescription")}
          buttons={
            <>
              <Button
                type="button"
                variant="outline"
                fullWidth={false}
                onClick={() => setIsDiscardProfileEditOpen(false)}
              >
                {t("common.keepEditing")}
              </Button>
              <Button
                type="button"
                variant="danger"
                fullWidth={false}
                onClick={() => {
                  setIsDiscardProfileEditOpen(false);
                  setIsProfileFormDirty(false);
                  setIsProfileDialogOpen(false);
                }}
              >
                {t("common.discardChanges")}
              </Button>
            </>
          }
        />
      </aside>
    </main>
  );
}
