import type { Post, PostSource, PostStatus } from "@repo/schemas";
import i18n from "../../../i18n";
import { BADGE } from "../../../shared-components/surface";

// Tones come from the shared `BADGE` map rather than per-file literals. These
// used to be hand-rolled here, in `StatusBadge` (settings) and in
// `describeMatch` (search) with three different definitions of "success", so a
// "Current" work-history chip and an "Active" token chip rendered as visibly
// different greens in dark mode.
//
// `label` is a GETTER, not a value. This map is imported directly by
// features/search/components/search-results.tsx and
// features/profile/components/profile-blocks.tsx, which index it as a plain
// `Record<..., { label: string }>`, so it cannot become a function of `t`
// without changing both call sites. A getter keeps the exact same type and
// still resolves on every read, so a language switch relabels these badges
// instead of leaving them frozen in whatever language the tab started in.
export const SOURCE_META: Record<
  PostSource,
  { label: string; className: string }
> = {
  manual: {
    get label() {
      return i18n.t("posts.origin.manual");
    },
    className: BADGE.neutral,
  },
  mcp: {
    get label() {
      return i18n.t("posts.origin.mcp");
    },
    className: BADGE.info,
  },
  // Not `BADGE.accent`: violet is the default `--profile-accent`, so an
  // accent-coloured source badge collides with the user's profile theme.
  agent: {
    get label() {
      return i18n.t("posts.origin.agent");
    },
    className: BADGE.magenta,
  },
  commit: {
    get label() {
      return i18n.t("posts.origin.commit");
    },
    className: BADGE.warning,
  },
};

export const STATUS_META: Record<
  PostStatus,
  { label: string; className: string }
> = {
  draft: {
    get label() {
      return i18n.t("posts.status.draft");
    },
    className: BADGE.neutral,
  },
  // Amber, not neutral: a post waiting on the author is an action item, and it
  // has to read differently from a draft they chose to park.
  pending_review: {
    get label() {
      return i18n.t("posts.status.pendingReview");
    },
    className: BADGE.warning,
  },
  published: {
    get label() {
      return i18n.t("posts.status.published");
    },
    className: BADGE.success,
  },
};

/**
 * The review queue's contents: posts waiting on the author, newest first.
 *
 * Lives here rather than in the page so the posts page can count the same set
 * it links to — a badge that disagrees with the queue is worse than no badge.
 * `createdAt` is a `Date` off the schema, but is re-wrapped defensively because
 * a cached/serialised list can hand back the ISO string.
 */
export function selectPendingReview(posts: readonly Post[]): Post[] {
  return posts
    .filter((post) => post.status === "pending_review")
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

/**
 * A post the user did not type themselves.
 *
 * Mirrors the server rule in `assertMachineAuthoredPostIsImmutable`: anything
 * that isn't `manual` has immutable content, so the UI must not offer an edit
 * affordance for it. This is a mirror, never the enforcement — the API rejects
 * the PATCH regardless of what the UI shows.
 */
export function isMachineAuthored(source: PostSource): boolean {
  return source !== "manual";
}

/**
 * Where a post came from, in the author's own terms.
 *
 * `metadata.repo` sharpens the sentence when the commit flow supplied it
 * ("from your commits in crafthub-v.1"), because "some automated tool wrote
 * this" is not enough for someone deciding whether to make it public.
 */
export function describePostProvenance(
  post: Pick<Post, "source" | "metadata">,
): string {
  const repo = readMetadataString(post.metadata, "repo");

  switch (post.source) {
    case "commit":
      return repo
        ? i18n.t("posts.fromCommitsIn", { repo })
        : i18n.t("posts.fromCommits");
    case "mcp":
      return repo
        ? i18n.t("posts.fromToolIn", { repo })
        : i18n.t("posts.fromTool");
    case "agent":
      return i18n.t("posts.fromAgent");
    case "manual":
      return i18n.t("posts.writtenByYou");
  }
}

function readMetadataString(
  metadata: Post["metadata"],
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export type PostMetadataFact = { key: string; label: string; value: string };

/**
 * Labels for the keys the MCP commit flow actually writes. Anything else a
 * source stuffs into `metadata` is still shown — with its raw key as the label
 * — because hiding a fact the post is claiming to be based on is worse than an
 * ugly label.
 *
 * Built inside `postMetadataFacts` (called fresh on every render) rather than
 * as a module-level constant, so — unlike `SOURCE_META`/`STATUS_META` above —
 * this one *does* pick up a language switch immediately.
 */
function getMetadataLabels(): Record<string, string> {
  return {
    repo: i18n.t("posts.repository"),
    commitCount: i18n.t("posts.commits"),
    period: i18n.t("posts.period"),
  };
}

/** Ordered so the commit flow's three keys read the same way every time. */
const METADATA_ORDER = ["repo", "commitCount", "period"];

export function postMetadataFacts(
  metadata: Post["metadata"],
): PostMetadataFact[] {
  if (!metadata) {
    return [];
  }

  const metadataLabels = getMetadataLabels();

  const keys = Object.keys(metadata).sort((a, b) => {
    const rankA = METADATA_ORDER.indexOf(a);
    const rankB = METADATA_ORDER.indexOf(b);
    if (rankA === -1 && rankB === -1) {
      return a.localeCompare(b);
    }
    return (
      (rankA === -1 ? Number.MAX_SAFE_INTEGER : rankA) -
      (rankB === -1 ? Number.MAX_SAFE_INTEGER : rankB)
    );
  });

  return keys.flatMap((key) => {
    const value = metadata[key];
    // `metadata` is typed `Record<string, unknown>` on the wire; the schema
    // caps it at string | number | boolean. Skip anything else rather than
    // rendering "[object Object]".
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      return [];
    }
    const text = String(value).trim();
    if (text.length === 0) {
      return [];
    }
    return [{ key, label: metadataLabels[key] ?? key, value: text }];
  });
}

export function formatPostDate(date: Date | string | null): string {
  if (!date) {
    return "";
  }
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  return value.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
