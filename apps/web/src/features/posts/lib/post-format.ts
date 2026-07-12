import type { PostSource, PostStatus } from "@repo/schemas";

export const SOURCE_META: Record<
  PostSource,
  { label: string; className: string }
> = {
  manual: {
    label: "Manual",
    className:
      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  },
  mcp: {
    label: "MCP",
    className:
      "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200",
  },
  agent: {
    label: "Agent",
    className:
      "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200",
  },
  commit: {
    label: "Commit",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
  },
};

export const STATUS_META: Record<
  PostStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className:
      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  },
  published: {
    label: "Published",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
  },
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
