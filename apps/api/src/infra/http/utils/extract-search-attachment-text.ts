const MAX_ATTACHMENT_TEXT_LENGTH = 80_000;

export interface SearchAttachmentFile {
  filename: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
}

/**
 * Tidies extracted document text WITHOUT destroying its line structure.
 *
 * This used to be `input.replace(/\s+/g, " ")`, which flattened every newline,
 * blank line and indent of an uploaded CV into single spaces. The whole resume
 * then reached the parser as one giant line, so the model was asked to
 * "preserve the resume's bullet structure" (see the system prompt in
 * `openai-resume-parsing-provider.ts`) from input that no longer had any — every
 * imported role came back as one glued paragraph.
 *
 * So: line breaks survive, and only the noise a PDF/DOCX extractor adds is
 * removed — column padding, tab runs, non-breaking spaces, trailing spaces, and
 * the long stretches of empty lines that page breaks leave behind. One blank
 * line still means a paragraph break; more than one never meant anything.
 *
 * Both callers want it this way. The resume import needs the bullets. The
 * recruiter-search attachment (`resume-controller.ts`) feeds a job description
 * into query conversion and then an embedding, and every step of that path
 * already joins its parts with `\n\n` and prints the attachment under a
 * `Job description context:\n` heading — newlines are the format there, not a
 * hazard. Nothing downstream needs a flattened form, so nothing flattens.
 */
function normalizeWhitespace(input: string): string {
  return (
    input
      // CRLF / lone CR — DOCX and Windows-authored TXT both produce these.
      .replace(/\r\n?/g, "\n")
      // Horizontal whitespace only: tabs, non-breaking spaces and the column
      // padding a PDF extractor emits between layout boxes. `\n` is excluded so
      // this can never eat a line break.
      .replace(/[^\S\n]+/g, " ")
      .replace(/ +$/gm, "")
      // A page break can leave a dozen empty lines. One blank line is a
      // paragraph break; the rest is just the PDF's pagination.
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Truncation runs AFTER normalization, never before: the cap has to be spent on
 * real content, not on the whitespace we were about to throw away.
 */
function normalizeAndLimit(input: string): string {
  return normalizeWhitespace(input).slice(0, MAX_ATTACHMENT_TEXT_LENGTH);
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const module = await import("pdf-parse");
  const parsePdf = module.default;
  const result = await parsePdf(buffer);
  return typeof result.text === "string" ? result.text : "";
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return typeof result.value === "string" ? result.value : "";
}

export async function extractSearchAttachmentText(
  file: SearchAttachmentFile,
): Promise<string> {
  const buffer = await file.toBuffer();

  if (file.mimetype === "text/plain") {
    return normalizeAndLimit(buffer.toString("utf-8"));
  }

  if (file.mimetype === "application/pdf") {
    return normalizeAndLimit(await extractPdfText(buffer));
  }

  if (
    file.mimetype ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return normalizeAndLimit(await extractDocxText(buffer));
  }

  throw new Error("Unsupported attachment type. Allowed: txt, pdf, docx.");
}
