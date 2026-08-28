import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractSearchAttachmentText,
  type SearchAttachmentFile,
} from "./extract-search-attachment-text.js";

const pdfText = vi.hoisted(() => ({ value: "" }));
const docxText = vi.hoisted(() => ({ value: "" }));

vi.mock("pdf-parse", () => ({
  default: vi.fn(async () => ({ text: pdfText.value })),
}));

vi.mock("mammoth", () => ({
  extractRawText: vi.fn(async () => ({ value: docxText.value })),
}));

const TXT = "text/plain";
const PDF = "application/pdf";
const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function fileOf(content: string, mimetype: string): SearchAttachmentFile {
  return {
    filename: "cv",
    mimetype,
    toBuffer: async () => Buffer.from(content, "utf-8"),
  };
}

/** The txt path is the one that reads the buffer directly. */
function extractTxt(content: string): Promise<string> {
  return extractSearchAttachmentText(fileOf(content, TXT));
}

beforeEach(() => {
  pdfText.value = "";
  docxText.value = "";
});

describe("extractSearchAttachmentText — line structure survives", () => {
  it("keeps one bullet per line instead of gluing the resume into one string", async () => {
    const resume = [
      "Staff Engineer — Acme",
      "- Led the payments team",
      "- Shipped the new checkout",
    ].join("\n");

    const result = await extractTxt(resume);

    expect(result).toBe(resume);
    expect(result.split("\n")).toHaveLength(3);
  });

  it("keeps a single blank line as a paragraph break", async () => {
    const result = await extractTxt("Experience\n\nStaff Engineer");

    expect(result).toBe("Experience\n\nStaff Engineer");
  });

  it("preserves unicode bullet characters as their own lines", async () => {
    const result = await extractTxt("• Built the API\n▪ Owned the queue");

    expect(result).toBe("• Built the API\n▪ Owned the queue");
  });

  it("normalizes CRLF and lone CR to \\n", async () => {
    const result = await extractTxt("First\r\nSecond\rThird");

    expect(result).toBe("First\nSecond\nThird");
  });

  it("collapses a run of spaces and tabs inside a line to one space", async () => {
    const result = await extractTxt("Acme \t   Corp");

    expect(result).toBe("Acme Corp");
  });

  it("collapses a leading indent to a single space without eating the newline", async () => {
    const result = await extractTxt("Role\n\t    - Indented bullet");

    expect(result).toBe("Role\n - Indented bullet");
  });

  it("collapses a non-breaking space, which PDF extractors emit as padding", async () => {
    const result = await extractTxt("Senior\u00a0\u00a0Engineer");

    expect(result).toBe("Senior Engineer");
  });

  it("strips trailing spaces from every line", async () => {
    const result = await extractTxt("First   \nSecond\t\nThird");

    expect(result).toBe("First\nSecond\nThird");
  });

  it("collapses three or more blank lines down to one blank line", async () => {
    const result = await extractTxt("Page one\n\n\n\n\n\nPage two");

    expect(result).toBe("Page one\n\nPage two");
  });

  it("trims leading and trailing whitespace from the whole document", async () => {
    const result = await extractTxt("\n\n  Resume  \n\n\n");

    expect(result).toBe("Resume");
  });
});

describe("extractSearchAttachmentText — per-format extraction", () => {
  it("reads a txt attachment straight from the buffer", async () => {
    expect(await extractTxt("Plain resume")).toBe("Plain resume");
  });

  it("reads a pdf attachment through pdf-parse, keeping its bullets", async () => {
    pdfText.value = "Acme\r\n\r\n•  Shipped checkout   \n•  Cut p99 latency";

    const result = await extractSearchAttachmentText(fileOf("", PDF));

    expect(result).toBe("Acme\n\n• Shipped checkout\n• Cut p99 latency");
  });

  it("reads a docx attachment through mammoth, keeping its bullets", async () => {
    docxText.value = "Acme\r\n\r\n- Led the team\r\n- Owned the roadmap";

    const result = await extractSearchAttachmentText(fileOf("", DOCX));

    expect(result).toBe("Acme\n\n- Led the team\n- Owned the roadmap");
  });

  it("returns an empty string when pdf-parse yields no text", async () => {
    pdfText.value = "";

    expect(await extractSearchAttachmentText(fileOf("", PDF))).toBe("");
  });

  it("rejects an unsupported mimetype", async () => {
    await expect(
      extractSearchAttachmentText(fileOf("x", "image/png")),
    ).rejects.toThrow(/Unsupported attachment type/);
  });
});

describe("extractSearchAttachmentText — length cap", () => {
  it("caps the text at 80 000 characters", async () => {
    const result = await extractTxt("a".repeat(90_000));

    expect(result).toHaveLength(80_000);
  });

  it("spends the cap on content, truncating only after whitespace collapses", async () => {
    // 79 999 real characters wrapped in whitespace that used to be counted:
    // before normalization this document is well over the cap, after it is not.
    const padded = `${"\n".repeat(5_000)}${"a".repeat(79_999)}${" ".repeat(5_000)}`;

    const result = await extractTxt(padded);

    expect(result).toHaveLength(79_999);
    expect(result.startsWith("a")).toBe(true);
  });
});
