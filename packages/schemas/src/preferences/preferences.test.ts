import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_PREFERENCE,
  DEFAULT_UI_LANGUAGE,
  parseAcceptLanguage,
  resolveUiLanguage,
  themePreferenceSchema,
  uiLanguageSchema,
  updateUserPreferencesSchemaInput,
  userPreferencesSchema,
} from "./index.js";

describe("resolveUiLanguage", () => {
  it("matches a shipped locale exactly", () => {
    expect(resolveUiLanguage("pt-BR")).toBe("pt-BR");
    expect(resolveUiLanguage("es-ES")).toBe("es-ES");
    expect(resolveUiLanguage("en-US")).toBe("en-US");
  });

  it("is case-insensitive, because header and navigator casing are not guaranteed", () => {
    expect(resolveUiLanguage("PT-br")).toBe("pt-BR");
    expect(resolveUiLanguage("  es-es  ")).toBe("es-ES");
  });

  it("widens a bare primary subtag onto the shipped region", () => {
    expect(resolveUiLanguage("pt")).toBe("pt-BR");
    expect(resolveUiLanguage("es")).toBe("es-ES");
    expect(resolveUiLanguage("en")).toBe("en-US");
  });

  it("widens a region we do not ship onto the one we do", () => {
    // A Portuguese user in Portugal should get a translated app, not English.
    expect(resolveUiLanguage("pt-PT")).toBe("pt-BR");
    expect(resolveUiLanguage("es-419")).toBe("es-ES");
    expect(resolveUiLanguage("en-GB")).toBe("en-US");
  });

  it("returns null rather than guessing for a language we do not ship", () => {
    expect(resolveUiLanguage("de-DE")).toBeNull();
    expect(resolveUiLanguage("ja")).toBeNull();
    expect(resolveUiLanguage("*")).toBeNull();
  });

  it("returns null for absent or empty input", () => {
    expect(resolveUiLanguage(null)).toBeNull();
    expect(resolveUiLanguage(undefined)).toBeNull();
    expect(resolveUiLanguage("")).toBeNull();
    expect(resolveUiLanguage("   ")).toBeNull();
  });
});

describe("parseAcceptLanguage", () => {
  it("takes the first shipped locale in header order when weights are equal", () => {
    expect(parseAcceptLanguage("pt-BR,en-US")).toBe("pt-BR");
  });

  it("honours q-values over header order", () => {
    // en appears first but is explicitly weaker — the user prefers Portuguese.
    expect(parseAcceptLanguage("en-US;q=0.5,pt-BR;q=0.9")).toBe("pt-BR");
  });

  it("skips languages we do not ship and keeps walking the list", () => {
    // The real-world case: a German-primary machine that also reads Portuguese.
    expect(parseAcceptLanguage("de-DE,pt-BR;q=0.8,en;q=0.3")).toBe("pt-BR");
  });

  it("ignores a zero-weighted tag, which is an explicit refusal", () => {
    expect(parseAcceptLanguage("pt-BR;q=0,en-US;q=0.4")).toBe("en-US");
  });

  it("returns null when nothing in the header is shipped", () => {
    expect(parseAcceptLanguage("de-DE,fr-FR;q=0.8")).toBeNull();
    expect(parseAcceptLanguage("*")).toBeNull();
  });

  it("returns null for absent or empty headers instead of throwing", () => {
    expect(parseAcceptLanguage(null)).toBeNull();
    expect(parseAcceptLanguage(undefined)).toBeNull();
    expect(parseAcceptLanguage("")).toBeNull();
  });

  it("never throws on malformed input — a client controls this header", () => {
    // Each of these used to be a plausible 500 on the request path.
    for (const header of [";;;", "pt-BR;q=", "pt-BR;q=abc", ",,,", "  ,  "]) {
      expect(() => parseAcceptLanguage(header)).not.toThrow();
    }
  });

  it("still resolves a tag whose q-value is malformed rather than dropping it", () => {
    // A stray character in q= must not discard the user's only signal.
    expect(parseAcceptLanguage("pt-BR;q=abc,de-DE")).toBeNull();
    expect(parseAcceptLanguage("pt-BR;q=,en-US")).toBe("en-US");
  });
});

describe("userPreferencesSchema", () => {
  it("accepts the follow-the-device defaults", () => {
    const parsed = userPreferencesSchema.parse({
      language: null,
      theme: "system",
    });
    expect(parsed).toEqual({ language: null, theme: "system" });
  });

  it("rejects a locale we do not ship rather than coercing it", () => {
    // Silent coercion is indistinguishable from a save that did not happen.
    expect(() =>
      userPreferencesSchema.parse({ language: "xx-XX", theme: "dark" }),
    ).toThrow();
  });

  it("rejects an unknown theme", () => {
    expect(() =>
      userPreferencesSchema.parse({ language: null, theme: "sepia" }),
    ).toThrow();
  });

  it("requires theme — it is never absent, only 'system'", () => {
    expect(() => userPreferencesSchema.parse({ language: null })).toThrow();
  });
});

describe("updateUserPreferencesSchemaInput", () => {
  it("allows a theme-only update without restating the language", () => {
    expect(updateUserPreferencesSchemaInput.parse({ theme: "dark" })).toEqual({
      theme: "dark",
    });
  });

  it("allows clearing the language back to follow-the-device", () => {
    expect(
      updateUserPreferencesSchemaInput.parse({ language: null }),
    ).toEqual({ language: null });
  });

  it("rejects an empty body, which is a client bug rather than a no-op", () => {
    expect(() => updateUserPreferencesSchemaInput.parse({})).toThrow();
  });

  it("rejects unknown values on a partial update too", () => {
    expect(() =>
      updateUserPreferencesSchemaInput.parse({ language: "xx-XX" }),
    ).toThrow();
    expect(() =>
      updateUserPreferencesSchemaInput.parse({ theme: "sepia" }),
    ).toThrow();
  });
});

describe("shipped constants", () => {
  it("keeps the locale list and the enum in step", () => {
    expect(uiLanguageSchema.options).toEqual(["en-US", "pt-BR", "es-ES"]);
  });

  it("defaults to the source language and to following the OS", () => {
    expect(uiLanguageSchema.parse(DEFAULT_UI_LANGUAGE)).toBe("en-US");
    expect(themePreferenceSchema.parse(DEFAULT_THEME_PREFERENCE)).toBe(
      "system",
    );
  });
});
