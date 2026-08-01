import type { PostSource, PostStatus } from "@repo/schemas";
import { BADGE } from "../../../shared-components/surface";

// Tones come from the shared `BADGE` map rather than per-file literals. These
// used to be hand-rolled here, in `StatusBadge` (settings) and in
// `describeMatch` (search) with three different definitions of "success", so a
// "Current" work-history chip and an "Active" token chip rendered as visibly
// different greens in dark mode.
export const SOURCE_META: Record<
  PostSource,
  { label: string; className: string }
> = {
  manual: { label: "Manual", className: BADGE.neutral },
  mcp: { label: "MCP", className: BADGE.info },
  // Not `BADGE.accent`: violet is the default `--profile-accent`, so an
  // accent-coloured source badge collides with the user's profile theme.
  agent: { label: "Agent", className: BADGE.magenta },
  commit: { label: "Commit", className: BADGE.warning },
};

export const STATUS_META: Record<
  PostStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: BADGE.neutral },
  published: { label: "Published", className: BADGE.success },
};

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
