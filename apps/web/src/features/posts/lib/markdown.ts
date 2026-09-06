/**
 * Minimal, XSS-safe markdown → HTML renderer.
 *
 * The codebase has no markdown dependency and is careful about stored XSS on the
 * PUBLIC profile, so instead of pulling in `react-markdown` + `rehype-sanitize`
 * we take the strictest possible approach:
 *
 *   1. HTML-escape the ENTIRE input first. After this step the string can no
 *      longer contain a live tag, so any raw `<script>`/`<img onerror>` a user
 *      (or an MCP/agent post source) pastes is inert.
 *   2. Only THEN introduce our own small whitelist of tags from markdown syntax.
 *   3. Links are the one place a URL reaches an `href` sink — every link URL is
 *      validated with `isSafeHttpUrl` (http/https only), mirroring the
 *      `httpUrlSchema` / `safeHttpUrl` guards used elsewhere. Anything else is
 *      rendered as inert text.
 *
 * The output therefore only ever contains tags we emit, so it is safe to feed to
 * `dangerouslySetInnerHTML`. The React component that does so lives beside it in
 * `../components/markdown.tsx`.
 */

const SAFE_URL_RE = /^https?:\/\//i;

/**
 * List markers. Beyond Markdown's own `-`/`*`, resumes arrive full of the
 * glyphs a PDF or Word bullet list leaves behind, and people paste those
 * straight into the work-history description box.
 *
 * The two halves are deliberately different: a glyph that only ever means
 * "bullet" is accepted with or without a following space, while `-`, `*` and
 * the dashes — all of which start ordinary sentences — need a space after them
 * so "—she said" stays prose instead of turning into a list.
 *
 * The `(?!\s)` before the content group is a no-op on the language matched: a
 * greedy `\s+`/`\s*` already stops at the first non-space, and giving one back
 * can never help `(.*)$` succeed (`.` does not match a line terminator, and if
 * the remainder held no line terminator the maximal run would have matched
 * already). It is there to make that determinism explicit, so the engine cannot
 * retry the whitespace run against the content run — the backtracking that made
 * these patterns super-linear.
 */
const UNORDERED_RE = /^(?:[-*]\s+|[•‣▪●◦∙]\s*|[·–—]\s+)(?!\s)(.*)$/;
const ORDERED_RE = /^\d+\.\s+(?!\s)(.*)$/;
const HEADING_RE = /^(#{1,3})\s+(?!\s)(.*)$/;
const THEMATIC_BREAK_RE = /^(-{3,}|\*{3,})$/;
const BLOCKQUOTE_RE = /^&gt;\s?(.*)$/;

/**
 * `[label](url)`.
 *
 * The label excludes `[` as well as `]`. With `[^\]]+` the scan from every `[`
 * ran to the end of the paragraph before failing, so a body of `[[[[[…` — and a
 * post body may be 20 000 characters — cost quadratic time to render (≈250 ms
 * for one such paragraph, on the public profile). Stopping the label at the next
 * `[` makes each scan bounded by the distance to it, and the whole pass linear.
 *
 * It also matches CommonMark more closely: in `[a[b](url)` the outer `[a` is
 * literal text and `[b](url)` is the link, where the old pattern produced one
 * link labelled `a[b`. A label with BALANCED brackets — `[a[b]c](url)` — was
 * never matched by either pattern.
 */
const LINK_RE = /\[([^[\]]+)\]\(([^)\s]+)\)/g;
const LINK_TEXT_RE = /\[([^[\]]+)\]\([^)]*\)/g;

const CODE_SPAN_RE = /`([^`]+)`/g;

/**
 * Placeholder for a code span, parked in the text while the inline passes run.
 *
 * It cannot be forged from user input: `escapeHtml` runs first and rewrites
 * every `&` to `&amp;`, so the only `&` left in the text is the head of one of
 * five known entities — `&C` is unreachable. (The previous sentinel used NUL
 * bytes, which a pasted resume genuinely can contain, and which no regex may
 * name without tripping `no-control-regex`.)
 */
const codeSpanPlaceholder = (index: number) => `&CODE${index};`;
const CODE_PLACEHOLDER_RE = /&CODE(\d+);/g;

const CODE_SPAN_CLASS =
  "rounded bg-zinc-100 px-1 py-0.5 text-[0.85em] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100";
const CODE_BLOCK_CLASS =
  "overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100 dark:bg-black";

export function isSafeHttpUrl(url: string): boolean {
  return SAFE_URL_RE.test(url.trim());
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline formatting on already-escaped text. Code spans are protected first. */
function renderInline(escaped: string): string {
  const codeSpans: string[] = [];
  let text = escaped.replace(CODE_SPAN_RE, (_m, code: string) => {
    codeSpans.push(code);
    return codeSpanPlaceholder(codeSpans.length - 1);
  });

  // Links: [label](url) — url is already HTML-escaped, so &amp; etc. are valid
  // inside the href attribute. Reject non-http(s) schemes (javascript:, data:).
  text = text.replace(LINK_RE, (match, label: string, url: string) => {
    // Unescape only for the scheme check; keep the escaped form for the href.
    const probe = url.replace(/&amp;/g, "&");
    if (!isSafeHttpUrl(probe)) {
      return match;
    }
    return `<a href="${url}" target="_blank" rel="noreferrer" class="profile-md-link">${label}</a>`;
  });

  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  return text.replace(
    CODE_PLACEHOLDER_RE,
    (_m, i: string) =>
      `<code class="${CODE_SPAN_CLASS}">${codeSpans[Number(i)]}</code>`,
  );
}

type ListType = "ul" | "ol";

type ListItem = { type: ListType; content: string };

/**
 * What the line loop is in the middle of. `codeBuffer` is non-null exactly
 * while a fenced block is open, which is the old `inCode` flag and its buffer
 * collapsed into one value that cannot disagree with itself.
 */
type RenderState = {
  html: string[];
  codeBuffer: string[] | null;
  listType: ListType | null;
  paragraph: string[];
};

/**
 * A single newline inside a paragraph becomes a hard line break, the way a
 * GitHub comment behaves — NOT a space.
 *
 * People type a work-history description as one thought per line and expect
 * to get one line per thought back; joining with a space glued the whole
 * entry into a wall of text. Only a blank line starts a new `<p>`.
 *
 * `<br />` is safe to inject here even though the join happens before
 * `renderInline`: the source was HTML-escaped up front, so a literal `<`
 * cannot exist in it any more. Every `<br />` in the output is one this line
 * put there, never one a user wrote. The trailing space matters too — it is
 * what stops the link regex (whose URL group is `[^)\s]+`) from swallowing a
 * `<br` into an href.
 */
function flushParagraph(state: RenderState): void {
  if (state.paragraph.length > 0) {
    state.html.push(`<p>${renderInline(state.paragraph.join("<br />"))}</p>`);
    state.paragraph = [];
  }
}

function closeList(state: RenderState): void {
  if (state.listType) {
    state.html.push(`</${state.listType}>`);
    state.listType = null;
  }
}

function flushCodeBlock(state: RenderState, buffer: string[]): void {
  state.html.push(
    `<pre class="${CODE_BLOCK_CLASS}"><code>${buffer.join("\n")}</code></pre>`,
  );
  state.codeBuffer = null;
}

function renderHeading(level: number, content: string): string {
  const size =
    level === 1
      ? "text-xl font-bold"
      : level === 2
        ? "text-lg font-semibold"
        : "text-base font-semibold";
  return `<h${level} class="${size} text-zinc-900 dark:text-zinc-100">${renderInline(content)}</h${level}>`;
}

/**
 * The one-line blocks: heading, thematic break, blockquote. Each one closes an
 * open paragraph and an open list, so they are recognised together.
 */
function renderStandaloneBlock(trimmed: string): string | null {
  const heading = HEADING_RE.exec(trimmed);
  const headingHashes = heading?.[1];
  const headingContent = heading?.[2];
  if (headingHashes !== undefined && headingContent !== undefined) {
    return renderHeading(headingHashes.length, headingContent);
  }
  if (THEMATIC_BREAK_RE.test(trimmed)) {
    return `<hr class="my-2 border-zinc-200 dark:border-zinc-700" />`;
  }
  const quoteContent = BLOCKQUOTE_RE.exec(trimmed)?.[1];
  if (quoteContent !== undefined) {
    return `<blockquote class="border-l-2 pl-3 italic text-zinc-600 dark:text-zinc-300" style="border-color: var(--profile-accent-border, #c4b5fd)">${renderInline(quoteContent)}</blockquote>`;
  }
  return null;
}

function matchListItem(trimmed: string): ListItem | null {
  const unorderedContent = UNORDERED_RE.exec(trimmed)?.[1];
  if (unorderedContent !== undefined) {
    return { type: "ul", content: unorderedContent };
  }
  const orderedContent = ORDERED_RE.exec(trimmed)?.[1];
  if (orderedContent !== undefined) {
    return { type: "ol", content: orderedContent };
  }
  return null;
}

function appendListItem(state: RenderState, item: ListItem): void {
  flushParagraph(state);
  if (state.listType && state.listType !== item.type) {
    closeList(state);
  }
  if (!state.listType) {
    state.listType = item.type;
    const marker = item.type === "ul" ? "disc" : "decimal";
    state.html.push(`<${item.type} class="ml-5 list-${marker} space-y-0.5">`);
  }
  state.html.push(`<li>${renderInline(item.content)}</li>`);
}

/** A line outside a fenced code block, already trimmed. */
function consumeTextLine(state: RenderState, trimmed: string): void {
  if (trimmed.length === 0) {
    flushParagraph(state);
    closeList(state);
    return;
  }

  const block = renderStandaloneBlock(trimmed);
  if (block) {
    flushParagraph(state);
    closeList(state);
    state.html.push(block);
    return;
  }

  const item = matchListItem(trimmed);
  if (item) {
    appendListItem(state, item);
    return;
  }

  closeList(state);
  state.paragraph.push(trimmed);
}

function consumeLine(state: RenderState, line: string): void {
  const fence = line.trim().startsWith("```");

  if (state.codeBuffer) {
    if (fence) {
      flushCodeBlock(state, state.codeBuffer);
    } else {
      state.codeBuffer.push(line);
    }
    return;
  }

  if (fence) {
    flushParagraph(state);
    closeList(state);
    state.codeBuffer = [];
    return;
  }

  consumeTextLine(state, line.trim());
}

/** Convert markdown to a safe HTML string. */
export function markdownToHtml(markdown: string): string {
  const state: RenderState = {
    html: [],
    codeBuffer: null,
    listType: null,
    paragraph: [],
  };

  for (const line of escapeHtml(markdown.replace(/\r\n/g, "\n")).split("\n")) {
    consumeLine(state, line);
  }

  // An unterminated fence still renders as a code block, the way a half-typed
  // post should preview.
  if (state.codeBuffer) {
    flushCodeBlock(state, state.codeBuffer);
  }
  flushParagraph(state);
  closeList(state);

  return state.html.join("\n");
}

const HORIZONTAL_RULE_RE = /^(-{3,}|\*{3,}|_{3,})$/;

/**
 * Drops the block markers that only mean something at the start of a line —
 * heading hashes, blockquote arrows, list bullets. A `-` or `#` anywhere else
 * on the line is prose and is left alone.
 */
function stripBlockMarkers(line: string): string {
  let text = line;
  while (text.startsWith(">")) {
    text = text.slice(1).trimStart();
  }
  text = text.replace(/^#{1,6}(\s+|$)/, "");
  // Same marker set the renderer accepts, so an excerpt of a pasted resume
  // bullet does not open with a stray `•`.
  return text.replace(/^(?:[-*+]\s+|[•‣▪●◦∙]\s*|[·–—]\s+|\d+\.\s+)/, "");
}

/**
 * Unwraps paired inline markup, keeping the text between the delimiters.
 * Underscores only count as emphasis at a word boundary, so `snake_case`
 * identifiers survive.
 */
function stripInlineMarkup(text: string): string {
  return text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/(^|\W)__([^_]+)__(?!\w)/g, "$1$2")
    .replace(/(^|\W)_([^_\n]+)_(?!\w)/g, "$1$2");
}

function excerptLine(line: string): string {
  const trimmed = line.trim();
  if (HORIZONTAL_RULE_RE.test(trimmed)) {
    return "";
  }
  const withoutMarkers = stripBlockMarkers(trimmed);
  // Links first, so a hyphen or underscore inside the URL never reaches the
  // inline pass.
  return stripInlineMarkup(withoutMarkers.replace(LINK_TEXT_RE, "$1"));
}

/** Plain-text excerpt of a markdown body for cards/previews. */
export function markdownExcerpt(markdown: string, maxLength = 180): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .map(excerptLine)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > maxLength
    ? `${plain.slice(0, maxLength).trimEnd()}…`
    : plain;
}
