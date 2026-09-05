import { markdownToHtml } from "../lib/markdown";

type MarkdownProps = {
  children: string;
  className?: string;
};

/** Renders markdown as sanitized HTML (see `markdownToHtml`). */
export function Markdown({ children, className }: Readonly<MarkdownProps>) {
  return (
    <div
      className={[
        "space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300",
        className ?? "",
      ]
        .join(" ")
        .trim()}
      // Safe: input is fully HTML-escaped before any tag is introduced, and
      // link hrefs are http(s)-validated. See markdownToHtml.
      dangerouslySetInnerHTML={{ __html: markdownToHtml(children) }}
    />
  );
}
