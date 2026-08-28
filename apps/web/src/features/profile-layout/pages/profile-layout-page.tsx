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
  type ProfileResponse,
  type ProfileTab,
  type ProfileViewport,
  type TextBlockConfig,
  type VideoBlockConfig,
} from "@repo/schemas";
import * as Switch from "@radix-ui/react-switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  FiAlertCircle,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiEdit2,
  FiEye,
  FiInfo,
  FiLoader,
  FiMonitor,
  FiPlus,
  FiRefreshCw,
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
  updateProfile,
} from "../../../lib/auth-api";
import { getAuthTokens } from "../../../lib/auth-tokens";
import { useMyResumeQuery } from "../../../lib/profile-queries";
import { RETRY_BEHIND_AN_ERROR_STATE } from "../../../lib/query-client";
import { reportError } from "../../../lib/report-error";
import { useUserInfoStore } from "../../../lib/user-info-store";
import { Button } from "../../../shared-components/button";
import { Dialog } from "../../../shared-components/dialog";
import { Input } from "../../../shared-components/input";
import { LoadingLabel, Skeleton } from "../../../shared-components/skeleton";
import {
  FOCUS_RING,
  SURFACE,
  SURFACE_INSET,
} from "../../../shared-components/surface";
import { PublicProfilePreview } from "../../profile/components/public-profile-preview";
import { getCustomBlockMeta } from "../block-meta";
import { ButtonBlockDialog } from "../components/button-block-dialog";
import { EditorGrid } from "../components/editor-grid";
import { EditorGridSkeleton } from "../components/editor-grid-skeleton";
import { GridBlockCard } from "../components/grid-block-card";
import { ImageBlockDialog } from "../components/image-block-dialog";
import { PostsBlockDialog } from "../components/posts-block-dialog";
import { TextBlockDialog } from "../components/text-block-dialog";
import { VideoBlockDialog } from "../components/video-block-dialog";
import {
  blocksForTab,
  blocksToRglLayout,
  buildDefaultLayout,
  computeNextPlacement,
  countBlocksHiddenWithoutTabs,
  moveBlockBy,
  pinnedBlocks,
  resizeBlockBy,
  type GridLayoutItem,
} from "../grid-utils";

type CustomConfig =
  | TextBlockConfig
  | VideoBlockConfig
  | ImageBlockConfig
  | ButtonBlockConfig
  | PostsBlockConfig;

const CUSTOM_KINDS = ["text", "video", "image", "button", "posts"] as const;

/**
 * Wired with `aria-describedby` rather than a hover tooltip. The explanation is
 * the whole point of the switch — it names the content-visibility consequence —
 * and a hover affordance is invisible on touch and to a keyboard user.
 */
const TABS_ENABLED_HINT_ID = "layout-tabs-enabled-hint";

/**
 * Placeholder geometry for the two editor zones while the layout loads. It
 * mirrors `DEFAULT_BUILTIN_BLOCKS` — the arrangement every profile starts from
 * — because the real one is precisely what the request is fetching.
 */
const PINNED_SKELETON_SPANS = (cols: number) => [{ w: cols, h: 4 }];
const TAB_SKELETON_SPANS = (cols: number) => [
  { w: cols, h: 4 },
  { w: cols, h: 6 },
  { w: cols, h: 6 },
];

/** Pill widths for the tab-manager placeholder row. */
const TAB_PILL_SKELETON_WIDTHS = [132, 118];

/**
 * Below `lg` the editor is unusable rather than merely cramped: the grid gets
 * ~311px at 375px, so a 12-column pc canvas is 14.9px per column while a block
 * card needs ~200px to render its label and switches. There is no point
 * shipping a broken editor — say so instead.
 */
const EDITOR_TOO_NARROW_QUERY = "(max-width: 1023px)";

const canMatchMedia = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

/** Module scope so `useSyncExternalStore` sees stable references. */
const subscribeToWidth = (onChange: () => void) => {
  if (!canMatchMedia()) {
    return () => {};
  }
  const mediaQuery = window.matchMedia(EDITOR_TOO_NARROW_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
};

const getIsTooNarrow = () =>
  canMatchMedia() ? window.matchMedia(EDITOR_TOO_NARROW_QUERY).matches : false;

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Persistent autosave indicator.
 *
 * The editor autosaves on a 600ms debounce and previously gave NO signal that
 * saving happened at all — and every mutation's `onError` just rolled the
 * optimistic patch back, so a failed save looked like the block spontaneously
 * snapping to its old position, silently, and again on every retry.
 *
 * It reads as plain helper text, not a chip: it lives in the page's status line
 * (above the title) rather than competing for room with the controls in the
 * toolbar. Phrasing content only — the status line is a `<p>`.
 */
function SaveIndicator({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  if (status === "error") {
    return (
      <Button
        type="button"
        variant="danger"
        size="sm"
        fullWidth={false}
        className="rounded-full"
        onClick={onRetry}
      >
        <FiAlertCircle className="h-4 w-4" aria-hidden="true" />
        {t("layout.saveFailedRetry")}
      </Button>
    );
  }

  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-1.5"
    >
      {status === "saving" ? (
        <>
          <FiLoader className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {t("common.saving")}
        </>
      ) : status === "saved" ? (
        <>
          <FiCheck
            className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400"
            aria-hidden="true"
          />
          {t("layout.allChangesSaved")}
        </>
      ) : (
        t("layout.autosaveNotice")
      )}
    </span>
  );
}

/**
 * Shown when `GET /me/layout` fails.
 *
 * The editor cannot be opened without the user's real layout. The old code fell
 * through to `buildDefaultLayout(viewport)` — the same fallback used for legacy
 * profiles that genuinely have no layout — so a 5xx rendered a stock
 * arrangement of tabs and blocks the user never created, under the line
 * "Changes save automatically". Nothing was actually lost (those blocks carry
 * synthetic ids like `default-pc-links`, and the api refuses any position
 * payload naming an id the user does not own), but a developer with a
 * customised profile could not tell a transient failure from a reset, and every
 * repair attempted from that screen was silently refused. Say what happened,
 * say the layout is untouched, and offer the retry instead.
 */
function LayoutLoadFailed({
  onRetry,
  isRetrying,
}: {
  onRetry: () => void;
  isRetrying: boolean;
}) {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16">
      <div className={`${SURFACE} anim-fade-up w-full p-8 text-center`}>
        <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200">
          <FiAlertCircle className="h-6 w-6" aria-hidden="true" />
        </span>
        {/* role="alert" on the wrapper, so the heading keeps its heading role. */}
        <div role="alert">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {t("layout.loadErrorTitle")}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            {t("layout.loadErrorBody")}
          </p>
        </div>
        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            fullWidth={false}
            isLoading={isRetrying}
            loadingLabel={t("common.tryAgain")}
            onClick={onRetry}
          >
            <FiRefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("common.tryAgain")}
          </Button>
        </div>
      </div>
    </main>
  );
}

export function ProfileLayoutPage() {
  const { t } = useTranslation();
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

  // Autosave feedback for the debounced position writes (mutation state is
  // read straight off the mutations further down).
  const [positionSaveState, setPositionSaveState] =
    useState<SaveStatus>("idle");
  const retrySaveRef = useRef<(() => void) | null>(null);

  // `useSyncExternalStore`, not `useState` + `useEffect`: the media query IS an
  // external store, and reading it this way means no setState-in-effect (and no
  // first-paint flash of the wrong branch).
  const isTooNarrow = useSyncExternalStore(
    subscribeToWidth,
    getIsTooNarrow,
    () => false,
  );

  // One debounce timer PER viewport+zone (e.g. `pc:pinned`, `mobile:tab:<id>`).
  // A shared single timer would let a drag in one zone cancel the pending
  // network save of another zone, dropping that zone's positions. The VIEWPORT
  // half of the key matters just as much: keying by zone alone meant dragging
  // in the PC layout, switching to mobile inside the 600ms window and touching
  // the same tab cancelled the PC save outright — and since positions are never
  // mirrored across viewports, that work was gone with no error shown.
  const timerKey = (zoneKey: string) => `${viewport}:${zoneKey}`;
  // Each entry keeps the pending timer AND the write it would perform, so a
  // unmount can FLUSH the save instead of throwing it away.
  const positionsTimersRef = useRef<
    Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>
  >(new Map());
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
    ...RETRY_BEHIND_AN_ERROR_STATE,
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

  /*
   * The profile-level "show tabs" switch. Absent (a profile fetched before the
   * field existed, or a `me` request still in flight) reads as ON, which is the
   * behaviour every profile had before this switch.
   */
  const tabsEnabled = meQuery.data?.tabsEnabled ?? true;

  // With tabs off there is only one editable section, and it is the first tab.
  // Honouring `activeTabId` here would leave the editor pointed at tab 3 —
  // editing a grid the public page no longer renders.
  const activeTab = tabsEnabled
    ? (orderedTabs.find((tab) => tab.id === activeTabId) ??
      orderedTabs[0] ??
      null)
    : (orderedTabs[0] ?? null);

  const cols = GRID_COLUMNS[viewport];
  const pinned = pinnedBlocks(layout);
  const tabBlocks = activeTab ? blocksForTab(layout, activeTab.id) : [];

  // While the layout is in flight `layout` is the DEFAULT fallback, i.e. tabs
  // and blocks the user never created. Rendering them as if they were real (and
  // mounting an EditorGrid over them) is what produced the old double render —
  // a "Loading layout..." line on top of an already-populated editor. Suppress
  // the fallback and render placeholders in the same boxes instead.
  const isLayoutLoading = layoutQuery.isLoading;
  const visibleTabs = isLayoutLoading ? [] : orderedTabs;

  // Counted off the DEFAULT fallback while the layout is in flight, this would
  // warn about blocks the user never created — so it waits for the real one.
  const hiddenBlockCount = isLayoutLoading
    ? 0
    : countBlocksHiddenWithoutTabs(layout);

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
    onError: (error, _vars, context) => {
      reportError(error, { action: "profile-layout.rename-tab" });
      return rollback(context?.previous);
    },
    onSettled: invalidateLayout,
  });

  const deleteTabMutation = useMutation({
    mutationFn: deleteTab,
    onMutate: (tabId: string) => {
      const previous = patchLayout(viewport, (current) => {
        const remaining = current.tabs.filter((tab) => tab.id !== tabId);
        // Mirrors the server: the deleted tab's blocks are NOT dropped — their
        // content is shared with the other viewport's rows — they fall back to
        // this viewport's first remaining tab.
        const fallbackTabId =
          [...remaining].sort((a, b) => a.order - b.order)[0]?.id ?? null;

        return {
          tabs: remaining,
          blocks: current.blocks.map((block) =>
            block.pinnedAllTabs || block.tabId !== tabId
              ? block
              : {
                  ...block,
                  tabId: fallbackTabId,
                  pinnedAllTabs: fallbackTabId === null,
                },
          ),
        };
      });
      return { previous };
    },
    onError: (error, _vars, context) => {
      reportError(error, { action: "profile-layout.delete-tab" });
      return rollback(context?.previous);
    },
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
    onError: (error, _vars, context) => {
      reportError(error, { action: "profile-layout.reorder-tabs" });
      return rollback(context?.previous);
    },
    onSettled: invalidateLayout,
  });

  /*
   * The tabs switch writes to the PROFILE, not the layout — it is one flag for
   * the whole profile, shared by both viewports, so it cannot live in a
   * per-viewport layout.
   *
   * Optimistic on the `["me"]` cache: the tab chrome and the live preview both
   * read `tabsEnabled` from there, and making the user watch a round-trip
   * before the strip disappears is exactly the lag a switch must not have. A
   * rejected write puts the previous profile back, so the switch springs back
   * rather than lying.
   *
   * NOTHING is deleted or reassigned here — no tab, no block. Off and on are
   * the same write with a different boolean.
   */
  const setTabsEnabledMutation = useMutation({
    mutationFn: (nextTabsEnabled: boolean) =>
      updateProfile({
        // `username` is required by `updateProfileSchemaInput`; the switch is
        // disabled until `meQuery` has supplied it.
        username: meQuery.data?.username ?? "",
        tabsEnabled: nextTabsEnabled,
      }),
    onMutate: (nextTabsEnabled: boolean) => {
      const previous = queryClient.getQueryData<ProfileResponse>(["me"]);
      queryClient.setQueryData<ProfileResponse>(["me"], (prev) =>
        prev ? { ...prev, tabsEnabled: nextTabsEnabled } : prev,
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      reportError(error, { action: "profile-layout.toggle-tabs" });
      if (context?.previous) {
        queryClient.setQueryData(["me"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      invalidatePublicProfileCache();
    },
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
    onError: (error, _vars, context) => {
      reportError(error, { action: "profile-layout.update-block" });
      return rollback(context?.previous);
    },
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
    onError: (error, _vars, context) => {
      reportError(error, { action: "profile-layout.delete-block" });
      return rollback(context?.previous);
    },
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

    // Debounce the network write PER viewport+zone: a pending save for this
    // key is replaced by the latest payload for the same key, but never cancels
    // a pending save for a different zone OR a different viewport. `viewport`
    // and `items` are captured in the closure, so each key carries its own
    // payload independently.
    const timers = positionsTimersRef.current;
    const key = timerKey(zoneKey);
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const run = () => {
      timers.delete(key);
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
        .then(() => {
          retrySaveRef.current = null;
          setPositionSaveState("saved");
          invalidatePublicProfileCache();
        })
        .catch((error: unknown) => {
          // Was `.catch(() => invalidateLayout())` and nothing else: the block
          // silently snapped back to its old position with no explanation, and
          // did so again on every subsequent attempt. Surface it and keep the
          // payload so the user can retry the exact write that failed.
          reportError(error, {
            action: "profile-layout.save-positions",
            extra: { viewport, zoneKey, blockCount: items.length },
          });
          retrySaveRef.current = run;
          setPositionSaveState("error");
          invalidateLayout();
        });
    };

    setPositionSaveState("saving");
    timers.set(key, { timer: setTimeout(run, 600), run });
  };

  /* ---------------------------- Save indicator ----------------------------- */

  const layoutMutations = [
    createTabMutation,
    renameTabMutation,
    deleteTabMutation,
    reorderTabsMutation,
    createBlockMutation,
    updateBlockMutation,
    deleteBlockMutation,
  ];

  const saveStatus: SaveStatus = layoutMutations.some(
    (mutation) => mutation.isError,
  )
    ? "error"
    : positionSaveState === "error"
      ? "error"
      : layoutMutations.some((mutation) => mutation.isPending) ||
          positionSaveState === "saving"
        ? "saving"
        : positionSaveState === "saved" ||
            layoutMutations.some((mutation) => mutation.isSuccess)
          ? "saved"
          : "idle";

  const handleRetrySave = () => {
    const retry = retrySaveRef.current;
    retrySaveRef.current = null;
    layoutMutations.forEach((mutation) => mutation.reset());

    if (retry) {
      setPositionSaveState("saving");
      retry();
      return;
    }

    // Nothing replayable (the failure came from a tab/block mutation, which
    // already rolled its optimistic patch back) — resync from the server.
    setPositionSaveState("idle");
    invalidateLayout();
  };

  useEffect(() => {
    const timers = positionsTimersRef.current;
    return () => {
      // FLUSH, don't discard. Navigating away within the 600ms debounce window
      // used to silently drop the arrangement the user had just made.
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach(({ timer, run }) => {
        clearTimeout(timer);
        run();
      });
    };
  }, []);

  /* ------------------------------- Handlers -------------------------------- */

  const handleAddTab = () => {
    const title = t("layout.tabNumber", { number: orderedTabs.length + 1 });
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

  /**
   * Apply a keyboard nudge/resize to the block's OWN zone and persist it. The
   * zone matters: pinned blocks and a tab's blocks are separate grids with
   * independent y-coordinates, so they must be recompacted separately.
   *
   * A nudge that cannot move — the top block pressing ArrowUp, a block already
   * at its minimum size — returns the very array it was given. Persisting that
   * would send the server a layout identical to the one it already stores, once
   * per keypress, so an arrow key held against the edge of the grid becomes a
   * write storm that changes nothing.
   */
  const applyGeometryChange = (
    block: ProfileBlock,
    transform: (zoneBlocks: ProfileBlock[]) => ProfileBlock[],
  ) => {
    const zoneBlocks = block.pinnedAllTabs ? pinned : tabBlocks;
    const next = transform(zoneBlocks);
    if (next === zoneBlocks) {
      return;
    }
    const zoneKey = block.pinnedAllTabs
      ? "pinned"
      : `tab:${activeTab?.id ?? "none"}`;
    persistPositions(blocksToRglLayout(next), zoneKey);
  };

  const renderCard = (block: ProfileBlock) => (
    <GridBlockCard
      block={block}
      tabs={orderedTabs}
      tabsEnabled={tabsEnabled}
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
      onMoveToTab={(target, tabId) =>
        updateBlockMutation.mutate({
          blockId: target.id,
          patch: { pinnedAllTabs: false, tabId },
        })
      }
      onMove={(target, dx, dy) =>
        applyGeometryChange(target, (zoneBlocks) =>
          moveBlockBy(zoneBlocks, target.id, dx, dy, cols),
        )
      }
      onResize={(target, dw, dh) =>
        applyGeometryChange(target, (zoneBlocks) =>
          resizeBlockBy(zoneBlocks, target.id, dw, dh, cols),
        )
      }
      onEdit={(target) => setEditingBlock(target)}
      onDelete={(target) => deleteBlockMutation.mutate(target.id)}
    />
  );

  const dialogBlock = editingBlock ?? null;
  const dialogKind: CustomBlockKind | null =
    editingBlock && CUSTOM_KINDS.includes(editingBlock.kind as CustomBlockKind)
      ? (editingBlock.kind as CustomBlockKind)
      : addKind;
  const customBlockMeta = getCustomBlockMeta(t);

  // NOTE: the "Show links" / "Show resume" pills that used to live in the
  // add-block row are gone. They competed with the in-card Visible switch for
  // the same job, and `hiddenBuiltins` filtered across the WHOLE viewport, so a
  // block hidden in Tab 2 showed its pill while you were editing Tab 1. The
  // in-card switch is better located and unambiguous.

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

  // Below every hook, so the editor's state machine is untouched by this exit.
  // The condition is about the layout being ABSENT, not about a request having
  // failed: invalidateLayout() refetches after every successful save, and a
  // failed refetch leaves `full` in the cache, so `isError` alone would replace
  // a working editor over a hiccup. Only a missing layout gets fabricated, and
  // only that is worth an error screen.
  if (layoutQuery.isError && !full) {
    return (
      <LayoutLoadFailed
        isRetrying={layoutQuery.isFetching}
        onRetry={() => {
          layoutQuery.refetch();
        }}
      />
    );
  }

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
        {/*
          One quiet status line for the page: which layout is being edited (the
          toolbar's toggle switches it) and the autosave state. Both used to be
          crammed into the toolbar — a chip wedged beside the controls plus a
          separate sentence under the bar.
        */}
        {isTooNarrow ? null : (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            {/* `Trans`, not `t`: the emphasis belongs on the viewport word,
                and which word that is sits in a different place in each of the
                three languages. The `<strong>` slot in the locale value maps
                onto the span below, so word order stays the translator's call
                and the styling stays ours. */}
            <span>
              <Trans
                i18nKey="layout.editingViewport"
                values={{
                  viewportLabel:
                    viewport === "pc"
                      ? t("layout.viewport.desktopLower")
                      : t("layout.viewport.mobileLower"),
                }}
                components={{
                  strong: (
                    <span className="font-semibold text-zinc-700 dark:text-zinc-200" />
                  ),
                }}
              />
            </span>
            <span
              aria-hidden="true"
              className="text-zinc-300 dark:text-zinc-700"
            >
              •
            </span>
            <SaveIndicator status={saveStatus} onRetry={handleRetrySave} />
          </p>
        )}

        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          {t("common.profileLayout")}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("layout.pageSubtitle")}
        </p>
      </header>

      {/*
        Hard gate below `lg`. The editor is not merely cramped on a phone — the
        grid gets ~311px at 375px, so a 12-column canvas is 14.9px per column
        against a block card that needs ~200px, and there is no keyboard or
        touch affordance that rescues that. Better to say so than to ship a
        surface that cannot be operated.
      */}
      {isTooNarrow ? (
        <section className="anim-fade-up flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
            <FiMonitor className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {t("layout.needsWiderScreen")}
          </h2>
          <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
            {t("layout.needsWiderScreenBody")}
          </p>
        </section>
      ) : (
        <div className="w-full space-y-5">
          {/* Viewport switch + live-preview trigger */}
          <div className="anim-fade-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              className={`flex items-center gap-1 p-1.5 sm:inline-flex ${SURFACE}`}
            >
              {(
                [
                  { value: "pc", label: t("layout.pcLayout"), Icon: FiMonitor },
                  {
                    value: "mobile",
                    label: t("layout.mobileLayout"),
                    Icon: FiSmartphone,
                  },
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
                      // `flex-1` here (plus a `flex-1` bar) is what stretched
                      // the toggle across the page; it sizes to its labels now.
                      "inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition sm:flex-none",
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
            {/* The preview renders the profile identity + layout, so it stays
                busy until both have arrived — `meQuery` had no loading UI at
                all and opened a preview with a blank name. */}
            <Button
              type="button"
              variant="outline"
              fullWidth={false}
              className="justify-center rounded-2xl"
              isLoading={isLayoutLoading || meQuery.isLoading}
              loadingLabel={t("common.preview")}
              onClick={() => {
                setPreviewDevice(viewport);
                setPreviewOpen(true);
              }}
            >
              <FiEye className="h-4 w-4" aria-hidden="true" />
              {t("common.preview")}
            </Button>
          </div>

          {/* Pinned zone */}
          <section className="anim-fade-up space-y-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-500/30 dark:bg-violet-500/5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {t("layout.shownOnAllTabs")}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {t("layout.pinnedHelp")}
              </p>
            </div>
            {isLayoutLoading ? (
              <EditorGridSkeleton
                cols={cols}
                viewport={viewport}
                spans={PINNED_SKELETON_SPANS(cols)}
                label={t("layout.loadingPinned")}
              />
            ) : (
              <EditorGrid
                blocks={pinned}
                cols={cols}
                viewport={viewport}
                onChange={(items) => persistPositions(items, "pinned")}
                renderCard={renderCard}
                emptyMessage={t("layout.noPinnedBlocks")}
              />
            )}
          </section>

          {/* Tab manager */}
          <section className="anim-fade-up space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            {/*
              The switch lives HERE, directly above the tab strip it governs,
              rather than with the other profile fields in the dashboard modal.
              This is the only screen where the tabs are visible, so it is the
              only place the switch is discoverable and its effect legible: flip
              it and the strip below disappears under your cursor.
            */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {/* A `p`, not an `h2`: this names the control, not the whole
                    section below it, and an `h2` here would mislabel the tab
                    manager in the document outline. */}
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {t("layout.tabsEnabled")}
                </p>
                <p
                  id={TABS_ENABLED_HINT_ID}
                  className="text-xs text-zinc-500 dark:text-zinc-400"
                >
                  {t("layout.tabsEnabledHelp")}
                </p>
              </div>
              <Switch.Root
                checked={tabsEnabled}
                // `updateProfile` requires the username, which arrives with
                // `meQuery`. Flipping before then would send an empty one.
                disabled={!meQuery.data}
                onCheckedChange={(checked) =>
                  setTabsEnabledMutation.mutate(checked)
                }
                aria-label={t("layout.toggleTabs")}
                aria-describedby={TABS_ENABLED_HINT_ID}
                className={[
                  "relative h-6 w-11 shrink-0 cursor-pointer rounded-full bg-zinc-300 transition disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-700",
                  "data-[state=checked]:bg-violet-600 dark:data-[state=checked]:bg-violet-500",
                  FOCUS_RING,
                ].join(" ")}
              >
                <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-5 dark:bg-zinc-100" />
              </Switch.Root>
            </div>

            {tabsEnabled ? null : (
              <div className={`${SURFACE_INSET} space-y-1.5 p-3`}>
                <p className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <FiInfo
                    className="mt-px h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500"
                    aria-hidden="true"
                  />
                  {t("layout.tabsOffNotice")}
                </p>
                {/*
                  The consequence, counted. Turning tabs off does not delete a
                  thing, but it does take every block on a later tab off the
                  public page, and "some of your blocks" is not something a user
                  can act on. i18next `count` picks the plural form — a ternary
                  between two strings would be wrong in languages with more
                  than two.
                */}
                {hiddenBlockCount > 0 ? (
                  <p className="flex items-start gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                    <FiAlertCircle
                      className="mt-px h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {t("layout.tabsHiddenBlocks", { count: hiddenBlockCount })}
                  </p>
                ) : null}
              </div>
            )}

            {tabsEnabled ? (
              <div className="flex flex-wrap items-center gap-2">
                {isLayoutLoading ? (
                  <>
                    <LoadingLabel>{t("layout.loadingTabs")}</LoadingLabel>
                    {TAB_PILL_SKELETON_WIDTHS.map((width) => (
                      <Skeleton
                        key={width}
                        shape="circle"
                        width={width}
                        height={34}
                      />
                    ))}
                  </>
                ) : null}

                {visibleTabs.map((tab, index) => {
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
                        aria-label={t("layout.moveTabLeft", {
                          tabTitle: tab.title,
                        })}
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
                        aria-label={t("layout.renameTabNamed", {
                          tabTitle: tab.title,
                        })}
                        onClick={() => {
                          setRenameTarget(tab);
                          setRenameValue(tab.title);
                        }}
                        className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      >
                        <FiEdit2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      {/*
                      Unguarded before, and it sits 3px from the rename pencil:
                      one mis-click destroyed a tab and dumped its blocks into
                      another one. Every other destructive action in the app
                      confirms first.
                    */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        fullWidth={false}
                        aria-label={t("layout.deleteTabNamed", {
                          tabTitle: tab.title,
                        })}
                        disabled={orderedTabs.length <= 1}
                        shouldHaveConfirmation
                        confirmationTitle={t("layout.deleteTabTitle", {
                          tabTitle: tab.title,
                        })}
                        confirmationDescription={t("layout.deleteTabBody")}
                        onClick={() => handleDeleteTab(tab.id)}
                        className="h-6 w-6 p-0 text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <FiTrash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <button
                        type="button"
                        aria-label={t("layout.moveTabRight", {
                          tabTitle: tab.title,
                        })}
                        disabled={index === orderedTabs.length - 1}
                        onClick={() => moveTab(tab.id, 1)}
                        className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200"
                      >
                        <FiChevronRight
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
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
                  // Until the layout lands, `activeTab` is a placeholder id from
                  // the default fallback — creating against it would fail.
                  disabled={isLayoutLoading}
                  onClick={handleAddTab}
                >
                  <FiPlus className="h-4 w-4" aria-hidden="true" />
                  {t("layout.addTab")}
                </Button>
              </div>
            ) : null}

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
                disabled={isLayoutLoading}
                onClick={() => setAddMenuOpen((open) => !open)}
              >
                <FiPlus className="h-4 w-4" aria-hidden="true" />
                {t("layout.addBlock")}
              </Button>

              {addMenuOpen ? (
                <div
                  role="menu"
                  aria-label={t("layout.addCustomBlock")}
                  className="absolute left-0 top-12 z-20 w-64 space-y-1 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {(Object.keys(customBlockMeta) as CustomBlockKind[]).map(
                    (kind) => {
                      const meta = customBlockMeta[kind];
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
              {t("layout.resizeTip")}
            </p>
            {isLayoutLoading ? (
              <EditorGridSkeleton
                cols={cols}
                viewport={viewport}
                spans={TAB_SKELETON_SPANS(cols)}
                label={t("layout.loadingBlocks")}
              />
            ) : (
              <EditorGrid
                blocks={tabBlocks}
                cols={cols}
                viewport={viewport}
                onChange={(items) =>
                  persistPositions(items, `tab:${activeTab?.id ?? "none"}`)
                }
                renderCard={renderCard}
                emptyMessage={t("layout.tabEmpty")}
              />
            )}
          </section>
        </div>
      )}

      {/* Live preview modal */}
      <Dialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={t("common.livePreview")}
        contentClassName="w-[96vw] max-w-6xl"
      >
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-800">
              {(
                [
                  {
                    value: "pc",
                    label: t("layout.viewport.desktop"),
                    Icon: FiMonitor,
                  },
                  {
                    value: "mobile",
                    label: t("layout.viewport.mobile"),
                    Icon: FiSmartphone,
                  },
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
              linksLoading={linksQuery.isLoading}
              tabsEnabled={tabsEnabled}
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
        title={t("layout.renameTab")}
      >
        {/*
          A `<form>`, not a `<div>`: the body used to be a plain div, so Enter
          in the title field did nothing. And `submitRename` early-returns on an
          empty title with no message, which made Save look broken — the button
          is disabled instead, so the dead state is visible rather than silent.
        */}
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submitRename();
          }}
        >
          <Input
            id="rename-tab"
            label={t("layout.tabTitle")}
            value={renameValue}
            maxLength={40}
            autoFocus
            onChange={(event) => setRenameValue(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              fullWidth={false}
              onClick={() => setRenameTarget(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              fullWidth={false}
              disabled={renameValue.trim().length === 0}
            >
              {t("common.save")}
            </Button>
          </div>
        </form>
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
