import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import {
  GRID_COLUMNS,
  type ButtonBlockConfig,
  type CreateBlockInput,
  type CustomBlockKind,
  type FullProfileLayout,
  type ImageBlockConfig,
  type PostsBlockConfig,
  type ProfileBlock,
  type ProfileTab,
  type ProfileViewport,
  type TextBlockConfig,
  type VideoBlockConfig,
} from "@repo/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiEdit2,
  FiEye,
  FiMonitor,
  FiPlus,
  FiSmartphone,
  FiTrash2,
} from "react-icons/fi";
import {
  createBlock,
  createTab,
  deleteBlock,
  deleteTab,
  fetchLayout,
  fetchLinks,
  fetchMyProfile,
  fetchMyWorkExperiences,
  renameTab,
  reorderTabs,
  updateBlock,
  updateBlockPositions,
} from "../../../lib/auth-api";
import { getAuthTokens } from "../../../lib/auth-tokens";
import { useMyResumeQuery } from "../../../lib/profile-queries";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { Input } from "../../../shared-components/input";
import { PublicProfilePreview } from "../../profile/components/public-profile-preview";
import { CUSTOM_BLOCK_META } from "../block-meta";
import { ButtonBlockDialog } from "../components/button-block-dialog";
import { EditorGrid } from "../components/editor-grid";
import { GridBlockCard } from "../components/grid-block-card";
import { ImageBlockDialog } from "../components/image-block-dialog";
import { PostsBlockDialog } from "../components/posts-block-dialog";
import { TextBlockDialog } from "../components/text-block-dialog";
import { VideoBlockDialog } from "../components/video-block-dialog";
import {
  blocksForTab,
  buildDefaultLayout,
  computeNextPlacement,
  pinnedBlocks,
  type GridLayoutItem,
} from "../grid-utils";

type CustomConfig =
  | TextBlockConfig
  | VideoBlockConfig
  | ImageBlockConfig
  | ButtonBlockConfig
  | PostsBlockConfig;

const CUSTOM_KINDS = ["text", "video", "image", "button", "posts"] as const;

export function ProfileLayoutPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userInfo = useUserInfoStore((state) => state.userInfo);
  const hasSession = Boolean(getAuthTokens() && userInfo);

  const [viewport, setViewport] = useState<ProfileViewport>("pc");
  const [previewOpen, setPreviewOpen] = useState(false);
  // The preview modal has its own pc/mobile switch, independent of the editor's
  // active viewport (it defaults to it when the modal is opened).
  const [previewDevice, setPreviewDevice] = useState<ProfileViewport>("pc");
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProfileTab | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addKind, setAddKind] = useState<CustomBlockKind | null>(null);
  const [editingBlock, setEditingBlock] = useState<ProfileBlock | null>(null);

  // One debounce timer PER grid zone (keyed by zone key, e.g. "pinned" or
  // `tab:<id>`). A shared single timer would let a drag in one zone cancel the
  // pending network save of another zone, dropping that zone's positions.
  const positionsTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const addMenuRef = useRef<HTMLDivElement | null>(null);

  // Dismiss the "Add block" menu on outside-click or Escape.
  useEffect(() => {
    if (!addMenuOpen) {
      return;
    }

    const handlePointer = (event: MouseEvent) => {
      if (
        addMenuRef.current &&
        !addMenuRef.current.contains(event.target as Node)
      ) {
        setAddMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [addMenuOpen]);

  useEffect(() => {
    if (!hasSession) {
      navigate({ to: "/" });
    }
  }, [hasSession, navigate]);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: fetchMyProfile,
    enabled: hasSession,
  });

  const layoutQuery = useQuery({
    queryKey: ["layout"],
    queryFn: fetchLayout,
    enabled: hasSession,
  });

  const linksQuery = useQuery({
    queryKey: ["links"],
    queryFn: fetchLinks,
    enabled: hasSession,
  });

  const resumeQuery = useMyResumeQuery(hasSession);

  const workExperiencesQuery = useQuery({
    queryKey: ["work-experiences"],
    queryFn: fetchMyWorkExperiences,
    enabled: hasSession,
  });

  const invalidatePublicProfileCache = () => {
    const username = meQuery.data?.username;
    if (username) {
      queryClient.invalidateQueries({
        queryKey: ["public-profile", username],
      });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["public-profile"] });
  };

  const invalidateLayout = () => {
    queryClient.invalidateQueries({ queryKey: ["layout"] });
    invalidatePublicProfileCache();
  };

  const full = layoutQuery.data;
  const layout = useMemo(
    () => (full ? full[viewport] : buildDefaultLayout(viewport)),
    [full, viewport],
  );

  const orderedTabs = useMemo(
    () => [...layout.tabs].sort((a, b) => a.order - b.order),
    [layout.tabs],
  );

  const activeTab =
    orderedTabs.find((tab) => tab.id === activeTabId) ?? orderedTabs[0] ?? null;

  const cols = GRID_COLUMNS[viewport];
  const pinned = pinnedBlocks(layout);
  const tabBlocks = activeTab ? blocksForTab(layout, activeTab.id) : [];

  /** Apply an optimistic patch to a single viewport of the cached full layout. */
  const patchLayout = (
    target: ProfileViewport,
    fn: (
      current: FullProfileLayout[ProfileViewport],
    ) => FullProfileLayout[ProfileViewport],
  ): FullProfileLayout | undefined => {
    const previous = queryClient.getQueryData<FullProfileLayout>(["layout"]);
    queryClient.setQueryData<FullProfileLayout>(["layout"], (prev) =>
      prev ? { ...prev, [target]: fn(prev[target]) } : prev,
    );
    return previous;
  };

  const rollback = (previous: FullProfileLayout | undefined) => {
    if (previous) {
      queryClient.setQueryData(["layout"], previous);
    }
  };

  /* ----------------------------- Tab mutations ----------------------------- */

  const createTabMutation = useMutation({
    mutationFn: createTab,
    onSuccess: (tab) => {
      setActiveTabId(tab.id);
      invalidateLayout();
    },
  });

  const renameTabMutation = useMutation({
    mutationFn: ({ tabId, title }: { tabId: string; title: string }) =>
      renameTab(tabId, { title }),
    onMutate: ({ tabId, title }) => {
      const previous = patchLayout(viewport, (current) => ({
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, title } : tab,
        ),
      }));
      return { previous };
    },
    onError: (_error, _vars, context) => rollback(context?.previous),
    onSettled: invalidateLayout,
  });

  const deleteTabMutation = useMutation({
    mutationFn: deleteTab,
    onMutate: (tabId: string) => {
      const previous = patchLayout(viewport, (current) => ({
        tabs: current.tabs.filter((tab) => tab.id !== tabId),
        blocks: current.blocks.filter(
          (block) => block.pinnedAllTabs || block.tabId !== tabId,
        ),
      }));
      return { previous };
    },
    onError: (_error, _vars, context) => rollback(context?.previous),
    onSuccess: () => setActiveTabId(null),
    onSettled: invalidateLayout,
  });

  const reorderTabsMutation = useMutation({
    mutationFn: (tabIds: string[]) => reorderTabs({ viewport, tabIds }),
    onMutate: (tabIds: string[]) => {
      const previous = patchLayout(viewport, (current) => ({
        ...current,
        tabs: current.tabs.map((tab) => ({
          ...tab,
          order: tabIds.indexOf(tab.id),
        })),
      }));
      return { previous };
    },
    onError: (_error, _vars, context) => rollback(context?.previous),
    onSettled: invalidateLayout,
  });

  /* ---------------------------- Block mutations ---------------------------- */

  const createBlockMutation = useMutation({
    mutationFn: createBlock,
    onSuccess: () => invalidateLayout(),
  });

  const updateBlockMutation = useMutation({
    mutationFn: ({
      blockId,
      patch,
    }: {
      blockId: string;
      patch: Parameters<typeof updateBlock>[1];
    }) => updateBlock(blockId, patch),
    onMutate: ({ blockId, patch }) => {
      const previous = patchLayout(viewport, (current) => ({
        ...current,
        blocks: current.blocks.map((block) =>
          block.id === blockId ? { ...block, ...patch } : block,
        ),
      }));
      return { previous };
    },
    onError: (_error, _vars, context) => rollback(context?.previous),
    onSettled: invalidateLayout,
  });

  const deleteBlockMutation = useMutation({
    mutationFn: deleteBlock,
    onMutate: (blockId: string) => {
      const previous = patchLayout(viewport, (current) => ({
        ...current,
        blocks: current.blocks.filter((block) => block.id !== blockId),
      }));
      return { previous };
    },
    onError: (_error, _vars, context) => rollback(context?.previous),
    onSettled: invalidateLayout,
  });

  const persistPositions = (items: GridLayoutItem[], zoneKey: string) => {
    // Optimistic: reflect new geometry immediately in the cached layout. This
    // runs for every call regardless of the (per-zone) network debounce below.
    patchLayout(viewport, (current) => ({
      ...current,
      blocks: current.blocks.map((block) => {
        const item = items.find((entry) => entry.i === block.id);
        return item
          ? {
              ...block,
              gridX: item.x,
              gridY: item.y,
              gridW: item.w,
              gridH: item.h,
            }
          : block;
      }),
    }));

    // Debounce the network write PER zone: a pending save for this zone is
    // replaced by the latest payload for the same zone, but never cancels a
    // pending save for a different zone. `viewport` and `items` are captured in
    // the closure, so each zone carries its own payload independently.
    const timers = positionsTimersRef.current;
    const existing = timers.get(zoneKey);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      timers.delete(zoneKey);
      updateBlockPositions({
        viewport,
        positions: items.map((item) => ({
          id: item.i,
          gridX: item.x,
          gridY: item.y,
          gridW: item.w,
          gridH: item.h,
        })),
      })
        .then(() => invalidatePublicProfileCache())
        .catch(() => invalidateLayout());
    }, 600);
    timers.set(zoneKey, timer);
  };

  useEffect(() => {
    const timers = positionsTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  /* ------------------------------- Handlers -------------------------------- */

  const handleAddTab = () => {
    const title = `Tab ${orderedTabs.length + 1}`;
    createTabMutation.mutate({ viewport, title });
  };

  const handleDeleteTab = (tabId: string) => {
    if (orderedTabs.length <= 1) {
      return;
    }
    deleteTabMutation.mutate(tabId);
  };

  const moveTab = (tabId: string, direction: -1 | 1) => {
    const ids = orderedTabs.map((tab) => tab.id);
    const index = ids.indexOf(tabId);
    const target = index + direction;
    if (target < 0 || target >= ids.length) {
      return;
    }
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorderTabsMutation.mutate(ids);
  };

  const submitRename = () => {
    if (!renameTarget || renameValue.trim().length === 0) {
      return;
    }
    renameTabMutation.mutate({
      tabId: renameTarget.id,
      title: renameValue.trim(),
    });
    setRenameTarget(null);
  };

  const handleAddCustomBlock = (kind: CustomBlockKind) => {
    setAddMenuOpen(false);
    setAddKind(kind);
  };

  const submitCustomBlock = async (
    kind: CustomBlockKind,
    config: CustomConfig,
  ) => {
    if (editingBlock) {
      await updateBlockMutation.mutateAsync({
        blockId: editingBlock.id,
        patch: { config },
      });
      setEditingBlock(null);
      return;
    }

    const placement = computeNextPlacement(tabBlocks, viewport);
    const payload = {
      kind,
      viewport,
      tabId: activeTab?.id ?? null,
      config,
      placement,
    } as CreateBlockInput;

    await createBlockMutation.mutateAsync(payload);
    setAddKind(null);
  };

  const renderCard = (block: ProfileBlock) => (
    <GridBlockCard
      block={block}
      onToggleVisibility={(target, isVisible) =>
        updateBlockMutation.mutate({
          blockId: target.id,
          patch: { isVisible },
        })
      }
      onTogglePin={(target, pinnedAllTabs) =>
        updateBlockMutation.mutate({
          blockId: target.id,
          patch: {
            pinnedAllTabs,
            tabId: pinnedAllTabs ? null : (activeTab?.id ?? null),
          },
        })
      }
      onEdit={(target) => setEditingBlock(target)}
      onDelete={(target) => deleteBlockMutation.mutate(target.id)}
    />
  );

  const dialogBlock = editingBlock ?? null;
  const dialogKind: CustomBlockKind | null =
    editingBlock &&
    CUSTOM_KINDS.includes(editingBlock.kind as CustomBlockKind)
      ? (editingBlock.kind as CustomBlockKind)
      : addKind;

  const hiddenBuiltins = layout.blocks.filter(
    (block) =>
      !block.isVisible &&
      !CUSTOM_KINDS.includes(block.kind as CustomBlockKind),
  );

  // Include the appearance fields so the preview modal matches the live profile
  // (banner, background, theme accent/preset, open-to-work, location, persona)
  // instead of always rendering the default theme.
  const profileView = {
    name: meQuery.data?.name ?? "",
    username: meQuery.data?.username ?? "",
    description: meQuery.data?.description ?? null,
    userPhoto: meQuery.data?.userPhoto ?? null,
    bannerImageUrl: meQuery.data?.bannerImageUrl ?? null,
    backgroundImageUrl: meQuery.data?.backgroundImageUrl ?? null,
    themeAccent: meQuery.data?.themeAccent ?? null,
    themePreset: meQuery.data?.themePreset ?? null,
    openToWork: meQuery.data?.openToWork ?? false,
    location: meQuery.data?.location ?? null,
    persona: meQuery.data?.persona ?? null,
  };

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 p-4 lg:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="anim-grid-bg absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_65%)]" />
        <div className="anim-float absolute -top-20 right-10 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <header className="anim-fade-up space-y-1">
        <h1 className="anim-gradient bg-linear-to-r from-violet-600 via-fuchsia-500 to-cyan-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
          Profile layout
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Design independent layouts for desktop and mobile. Arrange blocks in a
          freeform grid, group them into content tabs, and pin blocks so they
          show everywhere.
        </p>
      </header>

      <div className="w-full space-y-5">
          {/* Viewport switch + live-preview trigger */}
          <div className="anim-fade-up flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <div className="flex flex-1 items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              {(
                [
                  { value: "pc", label: "PC layout", Icon: FiMonitor },
                  { value: "mobile", label: "Mobile layout", Icon: FiSmartphone },
                ] as const
              ).map((option) => {
                const isActive = viewport === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      setViewport(option.value);
                      setActiveTabId(null);
                    }}
                    className={[
                      "inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
                      isActive
                        ? "bg-violet-700 text-white shadow-sm dark:bg-violet-600"
                        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
                    ].join(" ")}
                  >
                    <option.Icon className="h-4 w-4" aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="outline"
              fullWidth={false}
              className="justify-center rounded-2xl"
              onClick={() => {
                setPreviewDevice(viewport);
                setPreviewOpen(true);
              }}
            >
              <FiEye className="h-4 w-4" aria-hidden="true" />
              Preview
            </Button>
          </div>

          <p className="anim-fade-up text-xs text-zinc-500 dark:text-zinc-400">
            You are editing the{" "}
            <span className="font-semibold text-violet-700 dark:text-violet-300">
              {viewport === "pc" ? "desktop" : "mobile"}
            </span>{" "}
            layout. PC and mobile layouts are saved separately — switch above to
            edit the other.
          </p>

          {layoutQuery.isLoading ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Loading layout...
            </p>
          ) : null}

          {/* Pinned zone */}
          <section className="anim-fade-up space-y-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-500/30 dark:bg-violet-500/5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Shown on all tabs
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Pinned blocks render above the tab content on every tab.
              </p>
            </div>
            <EditorGrid
              blocks={pinned}
              cols={cols}
              onChange={(items) => persistPositions(items, "pinned")}
              renderCard={renderCard}
              emptyMessage="No pinned blocks. Toggle a block's “All tabs” switch to pin it here."
            />
          </section>

          {/* Tab manager */}
          <section className="anim-fade-up space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center gap-2">
              {orderedTabs.map((tab, index) => {
                const isActive = activeTab?.id === tab.id;
                return (
                  <div
                    key={tab.id}
                    className={[
                      "inline-flex items-center gap-1 rounded-full border px-2 py-1 transition",
                      isActive
                        ? "border-violet-500 bg-violet-50 dark:border-violet-500/60 dark:bg-violet-500/10"
                        : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      aria-label={`Move ${tab.title} left`}
                      disabled={index === 0}
                      onClick={() => moveTab(tab.id, -1)}
                      className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200"
                    >
                      <FiChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTabId(tab.id)}
                      className={[
                        "px-1 text-sm font-medium",
                        isActive
                          ? "text-violet-700 dark:text-violet-200"
                          : "text-zinc-600 dark:text-zinc-300",
                      ].join(" ")}
                    >
                      {tab.title}
                    </button>
                    <button
                      type="button"
                      aria-label={`Rename ${tab.title}`}
                      onClick={() => {
                        setRenameTarget(tab);
                        setRenameValue(tab.title);
                      }}
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      <FiEdit2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${tab.title}`}
                      disabled={orderedTabs.length <= 1}
                      onClick={() => handleDeleteTab(tab.id)}
                      className="text-zinc-400 hover:text-red-600 disabled:opacity-30 dark:hover:text-red-400"
                    >
                      <FiTrash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${tab.title} right`}
                      disabled={index === orderedTabs.length - 1}
                      onClick={() => moveTab(tab.id, 1)}
                      className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200"
                    >
                      <FiChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}

              <Button
                type="button"
                variant="soft"
                size="sm"
                fullWidth={false}
                className="rounded-full"
                onClick={handleAddTab}
              >
                <FiPlus className="h-4 w-4" aria-hidden="true" />
                Add tab
              </Button>
            </div>

            {/* Add block menu */}
            <div
              ref={addMenuRef}
              className="relative flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800"
            >
              <Button
                type="button"
                fullWidth={false}
                size="sm"
                className="rounded-full"
                onClick={() => setAddMenuOpen((open) => !open)}
              >
                <FiPlus className="h-4 w-4" aria-hidden="true" />
                Add block
              </Button>

              {hiddenBuiltins.map((block) => (
                <Button
                  key={block.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  fullWidth={false}
                  className="rounded-full"
                  onClick={() =>
                    updateBlockMutation.mutate({
                      blockId: block.id,
                      patch: { isVisible: true },
                    })
                  }
                >
                  Show {block.kind.replace("_", " ")}
                </Button>
              ))}

              {addMenuOpen ? (
                <div
                  role="menu"
                  aria-label="Add a custom block"
                  className="absolute left-0 top-12 z-20 w-64 space-y-1 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {(Object.keys(CUSTOM_BLOCK_META) as CustomBlockKind[]).map(
                    (kind) => {
                      const meta = CUSTOM_BLOCK_META[kind];
                      return (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => handleAddCustomBlock(kind)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                            <meta.Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span>
                            <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {meta.label}
                            </span>
                            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                              {meta.description}
                            </span>
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>
              ) : null}
            </div>

            {/* Active tab grid */}
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Tip: drag a block's corner to resize it — make blocks narrower to
              place them side by side.
            </p>
            <EditorGrid
              blocks={tabBlocks}
              cols={cols}
              onChange={(items) =>
                persistPositions(items, `tab:${activeTab?.id ?? "none"}`)
              }
              renderCard={renderCard}
              emptyMessage="This tab has no blocks yet. Use “Add block” to place one."
            />
          </section>
      </div>

      {/* Live preview modal */}
      <Dialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title="Live preview"
        contentClassName="w-[96vw] max-w-5xl"
      >
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-800">
              {(
                [
                  { value: "pc", label: "Desktop", Icon: FiMonitor },
                  { value: "mobile", label: "Mobile", Icon: FiSmartphone },
                ] as const
              ).map((option) => {
                const isActive = previewDevice === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setPreviewDevice(option.value)}
                    className={[
                      "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition",
                      isActive
                        ? "bg-white text-violet-700 shadow-sm dark:bg-zinc-900 dark:text-violet-200"
                        : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
                    ].join(" ")}
                  >
                    <option.Icon className="h-4 w-4" aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-center">
            <PublicProfilePreview
              layout={
                full ? full[previewDevice] : buildDefaultLayout(previewDevice)
              }
              viewport={previewDevice}
              frameWidth={previewDevice === "mobile" ? 390 : undefined}
              profile={profileView}
              links={linksQuery.data ?? []}
              resume={resumeQuery.data ?? null}
              workExperiences={workExperiencesQuery.data ?? []}
              resumeLoading={resumeQuery.isLoading}
              workLoading={workExperiencesQuery.isLoading}
            />
          </div>
        </div>
      </Dialog>

      {/* Rename tab dialog */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
        title="Rename tab"
      >
        <div className="space-y-4">
          <Input
            id="rename-tab"
            label="Tab title"
            value={renameValue}
            maxLength={40}
            onChange={(event) => setRenameValue(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              fullWidth={false}
              onClick={() => setRenameTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" fullWidth={false} onClick={submitRename}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Custom block dialogs */}
      <TextBlockDialog
        open={dialogKind === "text"}
        onOpenChange={(open) => {
          if (!open) {
            setAddKind(null);
            setEditingBlock(null);
          }
        }}
        initialConfig={
          dialogBlock?.kind === "text"
            ? (dialogBlock.config as TextBlockConfig)
            : null
        }
        isSubmitting={
          createBlockMutation.isPending || updateBlockMutation.isPending
        }
        onSubmit={(config) => submitCustomBlock("text", config)}
      />
      <VideoBlockDialog
        open={dialogKind === "video"}
        onOpenChange={(open) => {
          if (!open) {
            setAddKind(null);
            setEditingBlock(null);
          }
        }}
        initialConfig={
          dialogBlock?.kind === "video"
            ? (dialogBlock.config as VideoBlockConfig)
            : null
        }
        isSubmitting={
          createBlockMutation.isPending || updateBlockMutation.isPending
        }
        onSubmit={(config) => submitCustomBlock("video", config)}
      />
      <ImageBlockDialog
        open={dialogKind === "image"}
        onOpenChange={(open) => {
          if (!open) {
            setAddKind(null);
            setEditingBlock(null);
          }
        }}
        initialConfig={
          dialogBlock?.kind === "image"
            ? (dialogBlock.config as ImageBlockConfig)
            : null
        }
        isSubmitting={
          createBlockMutation.isPending || updateBlockMutation.isPending
        }
        onSubmit={(config) => submitCustomBlock("image", config)}
      />
      <ButtonBlockDialog
        open={dialogKind === "button"}
        onOpenChange={(open) => {
          if (!open) {
            setAddKind(null);
            setEditingBlock(null);
          }
        }}
        initialConfig={
          dialogBlock?.kind === "button"
            ? (dialogBlock.config as ButtonBlockConfig)
            : null
        }
        isSubmitting={
          createBlockMutation.isPending || updateBlockMutation.isPending
        }
        onSubmit={(config) => submitCustomBlock("button", config)}
      />
      <PostsBlockDialog
        open={dialogKind === "posts"}
        onOpenChange={(open) => {
          if (!open) {
            setAddKind(null);
            setEditingBlock(null);
          }
        }}
        initialConfig={
          dialogBlock?.kind === "posts"
            ? (dialogBlock.config as PostsBlockConfig)
            : null
        }
        isSubmitting={
          createBlockMutation.isPending || updateBlockMutation.isPending
        }
        onSubmit={(config) => submitCustomBlock("posts", config)}
      />
    </main>
  );
}
