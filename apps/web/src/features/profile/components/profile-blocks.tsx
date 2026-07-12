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
  getButtonIcon,
  resolveAccentColor,
} from "../../profile-layout/button-icons";
import { Markdown, markdownExcerpt } from "../../posts/lib/markdown";
import {
  formatPostDate,
  SOURCE_META,
} from "../../posts/lib/post-format";
import { ResumeReadOnlyCard } from "../../resume/components/resume-read-only-card";
import { WorkHistoryReadOnly } from "../../work-history/components/work-history-read-only";

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
  variant = "full",
}: ProfileBlocksProps) {
  const isPreview = variant === "preview";
  const cols = GRID_COLUMNS[viewport];

  const orderedTabs = [...layout.tabs].sort((a, b) => a.order - b.order);
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

  const pinned = layout.blocks.filter(
    (block) => block.pinnedAllTabs && block.isVisible,
  );
  const tabBlocks = activeTab
    ? layout.blocks.filter(
        (block) =>
          !block.pinnedAllTabs &&
          block.tabId === activeTab.id &&
          block.isVisible,
      )
    : [];

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

            <div className="anim-fade-up anim-delay-1 min-w-0 text-center">
              <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
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
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
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
            {links.length > 0 ? (
              links.map((link, index) => {
                const selectedIcon = getLinkIconOption(link.icon);

                return (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ animationDelay: `${0.15 + index * 0.07}s` }}
                    className="anim-fade-up accent-card group block rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition duration-300 hover:-translate-y-0.5 dark:border-zinc-700 dark:bg-zinc-900/70"
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
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
                No public links yet.
              </div>
            )}
          </div>
        );
      case "resume":
        return (
          <ResumeReadOnlyCard
            resume={resume}
            isLoading={resumeLoading}
            title="Resume"
            subtitle="Professional summary"
            emptyMessage="This user has not published resume details yet."
          />
        );
      case "work_experiences":
        return (
          <WorkHistoryReadOnly
            workExperiences={workExperiences}
            isLoading={workLoading}
            subtitle="Professional experience"
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

  // Row unit + gap mirror the editor grid (react-grid-layout rowHeight 40,
  // margin 12) so gridH maps to a real minimum height and the public output
  // matches what the user arranged. `minmax(unit, auto)` lets a block grow past
  // its span when content is taller — no clipping, no overlap.
  const rowUnit = isPreview ? 28 : 40;
  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridAutoRows: `minmax(${rowUnit}px, auto)`,
    gap: "12px",
  };

  const blockStyle = (block: ProfileBlock): CSSProperties => ({
    gridColumn: `${block.gridX + 1} / span ${block.gridW}`,
    gridRow: `${block.gridY + 1} / span ${block.gridH}`,
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
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
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
    <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      {config.title ? (
        <h3 className="mb-2 px-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
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
        <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
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
    <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      {config.title ? (
        <h3 className="mb-2 px-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
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
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70">
      {config?.title ? (
        <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {config.title}
        </h3>
      ) : null}

      {postsQuery.isLoading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Loading posts...
        </p>
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
