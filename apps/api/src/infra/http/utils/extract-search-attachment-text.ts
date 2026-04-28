const MAX_ATTACHMENT_TEXT_LENGTH = 80_000;

export interface SearchAttachmentFile {
  filename: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function limitText(input: string): string {
  return input.slice(0, MAX_ATTACHMENT_TEXT_LENGTH);
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
    return limitText(normalizeWhitespace(buffer.toString("utf-8")));
  }

  if (file.mimetype === "application/pdf") {
    const text = await extractPdfText(buffer);
    return limitText(normalizeWhitespace(text));
  }

  if (
    file.mimetype ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const text = await extractDocxText(buffer);
    return limitText(normalizeWhitespace(text));
  }

  throw new Error("Unsupported attachment type. Allowed: txt, pdf, docx.");
}
