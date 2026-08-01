import {
  GRID_COLUMNS,
  type ButtonBlockConfig,
  type ImageBlockConfig,
  type LinkResponse,
  type PostsBlockConfig,
  type ProfileBlock,
  type ProfileLayout,
  type ProfileViewport,
  type PublicWorkExperienceResponse,
  type ResumeResponse,
  type TextBlockConfig,
  type VideoBlockConfig,
  type WorkExperienceResponse,
} from "@repo/schemas";
import {
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { FiExternalLink, FiLink2, FiUser } from "react-icons/fi";
import type { PublicResumeResponse } from "../../../lib/auth-api";
import { getLinkIconOption } from "../../../lib/link-icons";
import { usePublicPosts } from "../../../lib/post-queries";
import { Avatar } from "../../../shared-components/avatar";
import {
  SURFACE_EMPTY,
  SURFACE_PROFILE,
} from "../../../shared-components/surface";
import {
  LoadingLabel,
  Skeleton,
  SkeletonChips,
  SkeletonText,
} from "../../../shared-components/skeleton";
import {
  getButtonIcon,
  resolveAccentColor,
} from "../../profile-layout/button-icons";
import {
  compactBlocks,
  GRID_GAP,
  GRID_ROW_HEIGHT,
  PROFILE_CANVAS_WIDTH,
} from "../../profile-layout/grid-utils";
import { Markdown, markdownExcerpt } from "../../posts/lib/markdown";
import {
  formatPostDate,
  SOURCE_META,
} from "../../posts/lib/post-format";
import { ResumeReadOnlyCard } from "../../resume/components/resume-read-only-card";
import { WorkHistoryReadOnly } from "../../work-history/components/work-history-read-only";
import { ProfileLinksSkeleton } from "./public-profile-skeleton";

type ProfileHeaderView = {
  name: string;
  username: string;
  description: string | null;
  userPhoto: string | null;
};

type ProfileBlocksProps = {
  layout: ProfileLayout;
  viewport: ProfileViewport;
  profile: ProfileHeaderView;
  links: LinkResponse[];
  resume: ResumeResponse | PublicResumeResponse | null;
  workExperiences: Array<WorkExperienceResponse | PublicWorkExperienceResponse>;
  resumeLoading?: boolean;
  workLoading?: boolean;
  linksLoading?: boolean;
  variant?: "full" | "preview";
};

/** Extract a YouTube video id from common URL shapes. */
function parseYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/,
  );
  return match ? match[1] : null;
}

/** Extract a Vimeo video id from a Vimeo URL. */
function parseVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return match ? match[1] : null;
}

export function ProfileBlocks({
  layout,
  viewport,
  profile,
  links,
  resume,
  workExperiences,
  resumeLoading = false,
  workLoading = false,
  linksLoading = false,
  variant = "full",
}: ProfileBlocksProps) {
  const isPreview = variant === "preview";
  const cols = GRID_COLUMNS[viewport];

  // Memoized so the sorted array has a stable identity across renders — the
  // compaction memos below are keyed off values derived from it.
  const orderedTabs = useMemo(
    () => [...layout.tabs].sort((a, b) => a.order - b.order),
    [layout.tabs],
  );
  const [activeTabId, setActiveTabId] = useState<string | null>(
    orderedTabs[0]?.id ?? null,
  );

  const activeTab =
    orderedTabs.find((tab) => tab.id === activeTabId) ?? orderedTabs[0] ?? null;

  // Roving arrow-key navigation for the tablist (ArrowLeft/Right + Home/End).
  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key) || orderedTabs.length === 0) {
      return;
    }
    event.preventDefault();
    const currentIndex = orderedTabs.findIndex((tab) => tab.id === activeTab?.id);
    let nextIndex = currentIndex < 0 ? 0 : currentIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % orderedTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + orderedTabs.length) % orderedTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = orderedTabs.length - 1;
    }
    const nextTab = orderedTabs[nextIndex];
    if (nextTab) {
      setActiveTabId(nextTab.id);
      const el = document.getElementById(`profile-tab-${nextTab.id}`);
      el?.focus();
    }
  };

  // Pack each zone to the top before rendering. Visibility is filtered here,
  // AFTER coordinates were assigned in the editor (the API does the same in
  // `assemble-layout.ts`), so hiding a block that sat at rows 0-3 would
  // otherwise leave a four-row hole on the live profile that no amount of
  // editor-side compaction can remove — the editor still sees that block.
  // Pinned blocks and the active tab's blocks are separate grids, so they are
  // compacted separately (y-coordinates are per-zone).
  const pinned = useMemo(
    () =>
      compactBlocks(
        layout.blocks.filter(
          (block) => block.pinnedAllTabs && block.isVisible,
        ),
        cols,
      ),
    [layout.blocks, cols],
  );

  // Keyed on the tab ID (a primitive) rather than the tab object, so the memo
  // only recomputes when the selected tab actually changes.
  const activeTabKey = activeTab?.id ?? null;
  const tabBlocks = useMemo(
    () =>
      activeTabKey === null
        ? []
        : compactBlocks(
            layout.blocks.filter(
              (block) =>
                !block.pinnedAllTabs &&
                block.tabId === activeTabKey &&
                block.isVisible,
            ),
            cols,
          ),
    [layout.blocks, activeTabKey, cols],
  );

  const renderBlock = (block: ProfileBlock): ReactNode => {
    switch (block.kind) {
      case "header":
        return (
          <header className="flex flex-col items-center gap-4 text-center">
            <div className="anim-glow-pulse anim-scale-in rounded-full">
              <Avatar
                name={profile.name}
                imageUrl={profile.userPhoto}
                size={isPreview ? 64 : 92}
                className="shadow-lg ring-2 ring-[var(--profile-accent-ring)]"
              />
            </div>

            {/*
              `w-full` + `max-w-full` are load-bearing, not decoration.
              This div is a BLOCK child of a `flex flex-col items-center`
              header, so `align-items: center` sized it to fit-content — 419px
              inside a 293px header at 375px, clipped ~63px off BOTH ends with
              no scrollbar. And because the `h1` is `inline-flex` at max-content,
              `scrollWidth > clientWidth` was false, so `truncate` never fired.
              `min-w-0` is inert here: this is max-content cross-axis sizing,
              not flex shrink.
            */}
            <div
              className="anim-fade-up w-full min-w-0 text-center"
              style={{ animationDelay: "0.06s" }}
            >
              <h1 className="inline-flex max-w-full items-center gap-2 text-2xl font-bold tracking-tight">
                <FiUser
                  className="h-5 w-5"
                  style={{ color: "var(--profile-accent-fg)" }}
                />
                <span className="truncate">{profile.name}</span>
              </h1>
              <p className="text-zinc-600 dark:text-zinc-400">
                @{profile.username}
              </p>
              {profile.description ? (
                <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {profile.description}
                </p>
              ) : (
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  No profile description yet.
                </p>
              )}
            </div>
          </header>
        );
      case "links":
        return (
          <div className="space-y-3">
            {linksLoading ? (
              <>
                <LoadingLabel>Loading links</LoadingLabel>
                <ProfileLinksSkeleton />
              </>
            ) : links.length > 0 ? (
              links.map((link, index) => {
                const selectedIcon = getLinkIconOption(link.icon);

                return (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ animationDelay: `${0.15 + index * 0.07}s` }}
                    className={`anim-fade-up accent-card group block p-4 text-left transition duration-300 hover:-translate-y-0.5 ${SURFACE_PROFILE}`}
                  >
                    <p className="inline-flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100">
                      <span
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full shadow-sm"
                        style={{
                          color: selectedIcon?.color,
                          background:
                            selectedIcon?.backgroundColor ??
                            "linear-gradient(135deg, #0EA5E9, #14B8A6)",
                        }}
                      >
                        {selectedIcon ? (
                          <selectedIcon.Icon
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        ) : (
                          <FiLink2
                            className="h-3.5 w-3.5 text-white"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      <span className="truncate">{link.title}</span>
                      <FiExternalLink className="h-4 w-4 text-zinc-400 transition group-hover:text-zinc-700 dark:group-hover:text-zinc-200" />
                    </p>
                    <p className="mt-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
                      {link.url}
                    </p>
                  </a>
                );
              })
            ) : (
              <div
                className={`px-4 py-6 text-center text-sm text-zinc-600 dark:text-zinc-400 ${SURFACE_EMPTY}`}
              >
                No public links yet.
              </div>
            )}
          </div>
        );
      // Both of these are shared with the dashboard, so they default to the
      // dashboard material. Passing `SURFACE_PROFILE` keeps them from reading as
      // a different material than their sibling blocks in this grid.
      case "resume":
        return (
          <ResumeReadOnlyCard
            resume={resume}
            isLoading={resumeLoading}
            title="Resume"
            subtitle="Professional summary"
            emptyMessage="This user has not published resume details yet."
            surfaceClassName={SURFACE_PROFILE}
          />
        );
      case "work_experiences":
        return (
          <WorkHistoryReadOnly
            workExperiences={workExperiences}
            isLoading={workLoading}
            subtitle="Professional experience"
            surfaceClassName={SURFACE_PROFILE}
          />
        );
      case "text":
        return <TextBlock config={block.config as TextBlockConfig} />;
      case "video":
        return <VideoBlock config={block.config as VideoBlockConfig} />;
      case "image":
        return <ImageBlock config={block.config as ImageBlockConfig} />;
      case "button":
        return <ButtonBlock config={block.config as ButtonBlockConfig} />;
      case "posts":
        return (
          <PostsBlock
            username={profile.username}
            config={block.config as PostsBlockConfig | null}
          />
        );
      default:
        return null;
    }
  };

  // Row unit + gap mirror the editor grid exactly (react-grid-layout rowHeight
  // 40, margin 12) so `gridH` maps to the same pixel height the user dragged.
  // The preview used to shrink the unit to 28px, which gave the in-studio
  // preview a different cell aspect ratio from the real page and quietly lied
  // about how the layout would look — both variants use the same unit now.
  const rowUnit = GRID_ROW_HEIGHT;

  // `minmax(rowUnit, auto)`, NOT a fixed row height.
  //
  // A fixed `40px` row plus `overflow: hidden` on the block was tried to force
  // editor/public pixel parity and was catastrophic: it clipped content
  // silently, with no scrollbar — measured at 85% of the work-history block and
  // 59% of the resume block lost at 1280px, and 92%/77% at 375px.
  //
  // The parity it chased was never achievable anyway. The editor renders only
  // block METADATA (icon + label, see `grid-block-card.tsx`), never the real
  // content, so it cannot preview content height and `gridH` cannot be a
  // ceiling. `gridH` is a MINIMUM: the user reserves at least that much room and
  // a block that needs more grows, pushing later rows down.
  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridAutoRows: `minmax(${rowUnit}px, auto)`,
    gap: `${GRID_GAP}px`,
    // Clamp to the SAME canvas width the editor grid clamps to, so a column is
    // the same number of pixels wide in both. Fluid below the cap.
    maxWidth: PROFILE_CANVAS_WIDTH[viewport],
    marginInline: "auto",
  };

  const blockStyle = (block: ProfileBlock): CSSProperties => ({
    gridColumn: `${block.gridX + 1} / span ${block.gridW}`,
    gridRow: `${block.gridY + 1} / span ${block.gridH}`,
    // `minWidth: 0` still matters — it is what lets `truncate` engage on long
    // link titles inside a narrow column. There is deliberately no `minHeight`
    // or `overflow` here: the row track sizes to content.
    minWidth: 0,
  });

  return (
    <div className="space-y-6">
      {pinned.length > 0 ? (
        <div style={gridStyle}>
          {pinned.map((block, index) => (
            <section
              key={block.id}
              style={{
                ...blockStyle(block),
                animationDelay: `${0.1 + index * 0.09}s`,
              }}
              className="anim-fade-up"
            >
              {renderBlock(block)}
            </section>
          ))}
        </div>
      ) : null}

      {orderedTabs.length > 1 ? (
        <div
          role="tablist"
          aria-label="Profile sections"
          className="flex flex-wrap justify-center gap-2"
          onKeyDown={handleTabKeyDown}
        >
          {orderedTabs.map((tab) => {
            const isActive = activeTab?.id === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`profile-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`profile-tabpanel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTabId(tab.id)}
                style={
                  isActive
                    ? {
                        backgroundColor: "var(--profile-accent-solid)",
                        color: "var(--profile-accent-contrast)",
                      }
                    : undefined
                }
                className={[
                  "rounded-full px-4 py-1.5 text-sm font-medium transition",
                  isActive
                    ? "shadow-sm"
                    : "accent-tab border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100",
                ].join(" ")}
              >
                {tab.title}
              </button>
            );
          })}
        </div>
      ) : null}

      {tabBlocks.length > 0 && activeTab ? (
        <div
          // Only expose tab semantics when a tablist is actually rendered
          // (more than one tab); a lone panel would dangle its aria reference.
          {...(orderedTabs.length > 1
            ? {
                role: "tabpanel",
                id: `profile-tabpanel-${activeTab.id}`,
                "aria-labelledby": `profile-tab-${activeTab.id}`,
              }
            : {})}
          style={gridStyle}
        >
          {tabBlocks.map((block, index) => (
            <section
              key={block.id}
              style={{
                ...blockStyle(block),
                animationDelay: `${0.1 + index * 0.09}s`,
              }}
              className="anim-fade-up"
            >
              {renderBlock(block)}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TextBlock({ config }: { config: TextBlockConfig | null }) {
  if (!config) {
    return null;
  }

  return (
    <div className={`accent-card p-4 transition duration-300 ${SURFACE_PROFILE}`}>
      {config.title ? (
        <h3 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {config.title}
        </h3>
      ) : null}
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        {config.body}
      </p>
    </div>
  );
}

function VideoBlock({ config }: { config: VideoBlockConfig | null }) {
  if (!config) {
    return null;
  }

  const embedUrl =
    config.provider === "youtube"
      ? (() => {
          const id = parseYouTubeId(config.url);
          return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
        })()
      : (() => {
          const id = parseVimeoId(config.url);
          return id ? `https://player.vimeo.com/video/${id}` : null;
        })();

  return (
    // `p-3`, not `p-4`: the iframe bleeds to the card edge, and a 4-unit ring
    // around a 16:9 video reads as a frame. The title compensates with `px-1`
    // so its baseline lines up optically with the `p-4` blocks beside it.
    <div className={`accent-card p-3 transition duration-300 ${SURFACE_PROFILE}`}>
      {config.title ? (
        <h3 className="mb-2 px-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {config.title}
        </h3>
      ) : null}
      {embedUrl ? (
        <div
          className="relative w-full overflow-hidden rounded-xl"
          style={{ aspectRatio: "16 / 9" }}
        >
          <iframe
            src={embedUrl}
            title={config.title ?? "Embedded video"}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      ) : (
        <div
          className={`px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400 ${SURFACE_EMPTY}`}
        >
          Unable to embed this video URL.
        </div>
      )}
    </div>
  );
}

function ImageBlock({ config }: { config: ImageBlockConfig | null }) {
  if (!config || config.images.length === 0) {
    return null;
  }

  const isGallery = config.layout === "gallery" && config.images.length > 1;

  return (
    // `p-3` for the same media-bleed reason as the video block; `px-1` title.
    <div className={`accent-card p-3 transition duration-300 ${SURFACE_PROFILE}`}>
      {config.title ? (
        <h3 className="mb-2 px-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {config.title}
        </h3>
      ) : null}
      {isGallery ? (
        <div className="grid grid-cols-2 gap-2">
          {config.images.map((image, index) => (
            <img
              key={`${image.url}-${index}`}
              src={image.url}
              alt={image.alt ?? ""}
              loading="lazy"
              className="h-full w-full rounded-xl object-cover"
            />
          ))}
        </div>
      ) : (
        <img
          src={config.images[0].url}
          alt={config.images[0].alt ?? ""}
          loading="lazy"
          className="w-full rounded-xl object-cover"
        />
      )}
    </div>
  );
}

/** Defense-in-depth: only ever emit http(s) into an href/src sink. */
function safeHttpUrl(url: string): string | undefined {
  return /^https?:\/\//i.test(url.trim()) ? url : undefined;
}

function ButtonBlock({ config }: { config: ButtonBlockConfig | null }) {
  if (!config) {
    return null;
  }

  const accent = resolveAccentColor(config.accent);
  const Icon = getButtonIcon(config.icon);
  const href = safeHttpUrl(config.url);

  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{ backgroundColor: accent }}
      className="anim-fade-up accent-glow flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-center text-sm font-semibold text-white shadow-sm transition duration-300 hover:-translate-y-0.5"
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      <span className="truncate">{config.label}</span>
    </a>
  );
}

/**
 * Card placeholders shaped like the real post articles above: same container
 * (list column or 2-up grid), same card box, same inner `space-y-2 p-4` stack
 * of source badge + date, title, body and tags.
 *
 * The cover image is deliberately left out — whether a post has one is unknown
 * until it arrives, and reserving 160px for a cover that never comes would
 * shift more than it saves.
 */
function PostsBlockSkeleton({
  layout,
  count,
}: {
  layout: "list" | "grid";
  count: number;
}) {
  return (
    <div
      className={
        layout === "grid" ? "grid gap-4 sm:grid-cols-2" : "flex flex-col gap-4"
      }
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60"
        >
          <div className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <Skeleton shape="circle" width={64} height={18} />
              <Skeleton shape="text" width={88} />
            </div>
            <Skeleton shape="text" height={20} width="55%" />
            <SkeletonText lines={layout === "grid" ? 3 : 4} />
            <SkeletonChips count={3} className="pt-1" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PostsBlock({
  username,
  config,
}: {
  username: string;
  config: PostsBlockConfig | null;
}) {
  const limit = config?.limit ?? 5;
  const layout = config?.layout ?? "list";
  const tagFilter = config?.tag?.trim().toLowerCase();

  // When a tag filter is active, fetch a larger window so matches beyond the
  // first page are found before the client-side filter + final slice.
  const fetchLimit = tagFilter ? 50 : limit;
  const postsQuery = usePublicPosts(username, { limit: fetchLimit });

  const posts = (postsQuery.data ?? [])
    .filter((post) =>
      tagFilter
        ? (post.tags ?? []).some((tag) => tag.toLowerCase() === tagFilter)
        : true,
    )
    .slice(0, limit);

  return (
    <div className={`accent-card p-4 transition duration-300 ${SURFACE_PROFILE}`}>
      {config?.title ? (
        <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {config.title}
        </h3>
      ) : null}

      {postsQuery.isLoading ? (
        <>
          <LoadingLabel>Loading posts</LoadingLabel>
          <PostsBlockSkeleton layout={layout} count={Math.min(limit, 3)} />
        </>
      ) : postsQuery.isError ? (
        <p className="text-sm text-red-600">
          Could not load posts. Please try again.
        </p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No posts published yet.
        </p>
      ) : (
        <div
          className={
            layout === "grid"
              ? "grid gap-4 sm:grid-cols-2"
              : "flex flex-col gap-4"
          }
        >
          {posts.map((post) => {
            const source = SOURCE_META[post.source];
            const href = post.externalUrl
              ? safeHttpUrl(post.externalUrl)
              : undefined;
            const cover = post.coverImageUrl
              ? safeHttpUrl(post.coverImageUrl)
              : undefined;

            return (
              <article
                key={post.id}
                className="anim-fade-up accent-card overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 dark:border-zinc-700 dark:bg-zinc-900/60"
              >
                {cover ? (
                  <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    className="h-40 w-full object-cover"
                  />
                ) : null}
                <div className="space-y-2 p-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${source.className}`}
                    >
                      {source.label}
                    </span>
                    <span>
                      {formatPostDate(post.publishedAt ?? post.createdAt)}
                    </span>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open external link"
                        className="accent-text-hover -my-2 -mr-2 ml-auto inline-flex min-h-[40px] min-w-[40px] items-center justify-center p-2 text-zinc-400 transition"
                      >
                        <FiExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>

                  {post.title ? (
                    <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {post.title}
                    </h4>
                  ) : null}

                  {layout === "grid" ? (
                    <p className="line-clamp-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {markdownExcerpt(post.body, 160)}
                    </p>
                  ) : (
                    <Markdown className="line-clamp-6">{post.body}</Markdown>
                  )}

                  {post.tags && post.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {post.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full px-2 py-0.5 text-xs"
                          style={{
                            backgroundColor: "var(--profile-accent-weak)",
                            color: "var(--profile-accent-fg)",
                          }}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
