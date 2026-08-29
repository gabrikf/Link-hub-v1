import { describe, expect, it } from "vitest";
import { createLinkSchemaInput, updateLinkSchemaInput } from "./index.js";

/**
 * A profile link ends up as `href={link.url}` on the PUBLIC profile
 * (apps/web/src/features/profile/components/profile-blocks.tsx). A bare
 * `z.string().url()` accepts `javascript:`, `data:` and `vbscript:`, so the
 * only thing standing between a stored URL and a stored XSS is the renderer.
 * The link INPUT schemas are the gate for every new row — the browser form
 * resolver derives from them too — so they must accept http(s) and nothing else.
 */
const DANGEROUS_URLS = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  "vbscript:msgbox(1)",
];

const NON_WEB_URLS = ["ftp://files.example.com/a", "file:///etc/passwd"];

describe("createLinkSchemaInput.url", () => {
  it.each(DANGEROUS_URLS)("rejects the script-bearing scheme %s", (url) => {
    const result = createLinkSchemaInput.safeParse({
      title: "My link",
      url,
      isPublic: true,
    });

    expect(result.success).toBe(false);
  });

  it.each(NON_WEB_URLS)("rejects the non-http(s) scheme %s", (url) => {
    const result = createLinkSchemaInput.safeParse({
      title: "My link",
      url,
      isPublic: true,
    });

    expect(result.success).toBe(false);
  });

  it("still accepts the http(s) URLs a real user types", () => {
    for (const url of [
      "https://github.com/gabrielk",
      "http://example.com/path?q=1",
    ]) {
      const result = createLinkSchemaInput.safeParse({
        title: "My link",
        url,
        isPublic: true,
      });

      expect(result.success).toBe(true);
    }
  });
});

describe("updateLinkSchemaInput.url", () => {
  it.each([...DANGEROUS_URLS, ...NON_WEB_URLS])(
    "rejects %s, so an existing link cannot be edited into one",
    (url) => {
      const result = updateLinkSchemaInput.safeParse({
        title: "My link",
        url,
        isPublic: true,
      });

      expect(result.success).toBe(false);
    },
  );

  it("still accepts an https URL", () => {
    const result = updateLinkSchemaInput.safeParse({
      title: "My link",
      url: "https://example.com",
      isPublic: true,
    });

    expect(result.success).toBe(true);
  });
});
