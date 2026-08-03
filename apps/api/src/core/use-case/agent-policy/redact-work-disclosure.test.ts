import { describe, expect, it } from "vitest";
import {
  DISCLOSURE_PLACEHOLDER,
  buildBlockedTerms,
  findDisclosureViolations,
  redactText,
  resolveEffectiveLevel,
} from "./redact-work-disclosure.js";

describe("buildBlockedTerms", () => {
  it("blocks every employer name plus the user's terms at summary level", () => {
    const terms = buildBlockedTerms({
      level: "summary",
      companyNames: ["Acme Corp", "Nubank"],
      userBlockedTerms: ["Project Falcon"],
    });

    expect(terms).toEqual(["Acme Corp", "Nubank", "Project Falcon"]);
  });

  it("drops employer names at detailed level — naming the employer IS the level", () => {
    const terms = buildBlockedTerms({
      level: "detailed",
      companyNames: ["Acme Corp", "Nubank"],
      userBlockedTerms: ["Project Falcon"],
    });

    expect(terms).toEqual(["Project Falcon"]);
  });

  it("blocks nothing but the user's own terms at full level", () => {
    expect(
      buildBlockedTerms({
        level: "full",
        companyNames: ["Acme Corp"],
        userBlockedTerms: ["Project Falcon"],
      }),
    ).toEqual(["Project Falcon"]);

    expect(
      buildBlockedTerms({
        level: "full",
        companyNames: ["Acme Corp"],
        userBlockedTerms: [],
      }),
    ).toEqual([]);
  });

  it("ignores empty, whitespace-only and single-character terms", () => {
    const terms = buildBlockedTerms({
      level: "summary",
      companyNames: ["", "   ", "X"],
      userBlockedTerms: ["A", "ok"],
    });

    expect(terms).toEqual(["ok"]);
  });

  it("de-duplicates case-insensitively, keeping the first spelling", () => {
    const terms = buildBlockedTerms({
      level: "summary",
      companyNames: ["Acme", "ACME", "acme"],
      userBlockedTerms: ["AcMe"],
    });

    expect(terms).toEqual(["Acme"]);
  });

  it("trims surrounding whitespace so ' Acme ' and 'Acme' are one rule", () => {
    expect(
      buildBlockedTerms({
        level: "summary",
        companyNames: [" Acme "],
        userBlockedTerms: ["Acme"],
      }),
    ).toEqual(["Acme"]);
  });
});

describe("findDisclosureViolations", () => {
  it("matches on word boundaries, not substrings", () => {
    expect(findDisclosureViolations("A beautiful sunset", ["sun"])).toEqual([]);
    expect(findDisclosureViolations("The sun is out", ["sun"])).toEqual(["sun"]);
  });

  it("does not match a term glued to another word by a digit or underscore", () => {
    expect(findDisclosureViolations("sun4life", ["sun"])).toEqual([]);
    expect(findDisclosureViolations("my_sun_service", ["sun"])).toEqual([]);
  });

  it("matches case-insensitively but reports the canonical spelling", () => {
    expect(
      findDisclosureViolations("shipped it at NUBANK last week", ["Nubank"]),
    ).toEqual(["Nubank"]);
  });

  it("matches at the very start and very end of the text", () => {
    expect(findDisclosureViolations("Nubank ships fast", ["Nubank"])).toEqual([
      "Nubank",
    ]);
    expect(findDisclosureViolations("I work at Nubank", ["Nubank"])).toEqual([
      "Nubank",
    ]);
  });

  it("matches multi-word employer names", () => {
    expect(
      findDisclosureViolations("Rebuilt checkout for Acme Corp.", [
        "Acme Corp",
      ]),
    ).toEqual(["Acme Corp"]);

    // The words individually are fine — only the full name is the identifier.
    expect(
      findDisclosureViolations("An acme of engineering", ["Acme Corp"]),
    ).toEqual([]);
  });

  it("treats regex metacharacters in a term as literal text", () => {
    expect(findDisclosureViolations("built in C++ Corp", ["C++ Corp"])).toEqual(
      ["C++ Corp"],
    );
    // Without escaping, "A.B" would match "AxB".
    expect(findDisclosureViolations("AxB systems", ["A.B"])).toEqual([]);
    expect(findDisclosureViolations("A.B systems", ["A.B"])).toEqual(["A.B"]);
  });

  it("handles accented and non-ASCII employer names", () => {
    expect(
      findDisclosureViolations("Contract work for Fábrica de Software", [
        "Fábrica de Software",
      ]),
    ).toEqual(["Fábrica de Software"]);

    // Unicode boundaries: the accented letter must not be treated as a break.
    expect(findDisclosureViolations("Fábricas plural", ["Fábrica"])).toEqual(
      [],
    );
  });

  it("reports every overlapping term that matches, in denylist order", () => {
    expect(
      findDisclosureViolations("Worked at Acme Corp on payments", [
        "Acme Corp",
        "Acme",
      ]),
    ).toEqual(["Acme Corp", "Acme"]);
  });

  it("skips terms shorter than 2 characters even if handed one directly", () => {
    expect(findDisclosureViolations("a b c", ["a", "b"])).toEqual([]);
  });

  it("returns nothing for empty text, null, undefined or an empty denylist", () => {
    expect(findDisclosureViolations("", ["Acme"])).toEqual([]);
    expect(findDisclosureViolations(null, ["Acme"])).toEqual([]);
    expect(findDisclosureViolations(undefined, ["Acme"])).toEqual([]);
    expect(findDisclosureViolations("Acme everywhere", [])).toEqual([]);
  });
});

describe("redactText", () => {
  it("replaces every occurrence with the neutral placeholder", () => {
    expect(
      redactText("Acme wanted it fast, so Acme got it fast.", ["Acme"]),
    ).toBe(
      `${DISCLOSURE_PLACEHOLDER} wanted it fast, so ${DISCLOSURE_PLACEHOLDER} got it fast.`,
    );
  });

  it("preserves surrounding punctuation and sentence shape", () => {
    expect(redactText("Rebuilt checkout for Acme Corp.", ["Acme Corp"])).toBe(
      `Rebuilt checkout for ${DISCLOSURE_PLACEHOLDER}.`,
    );
  });

  it("leaves substring lookalikes untouched", () => {
    expect(redactText("A beautiful sunset over Sun Corp", ["Sun Corp"])).toBe(
      `A beautiful sunset over ${DISCLOSURE_PLACEHOLDER}`,
    );
  });

  it("redacts case-insensitively", () => {
    expect(redactText("nubank and NuBank", ["Nubank"])).toBe(
      `${DISCLOSURE_PLACEHOLDER} and ${DISCLOSURE_PLACEHOLDER}`,
    );
  });

  it("applies overlapping terms without corrupting the output", () => {
    // The longer term runs first, so the shorter one finds nothing left to hit.
    expect(redactText("Acme Corp shipped", ["Acme Corp", "Acme"])).toBe(
      `${DISCLOSURE_PLACEHOLDER} shipped`,
    );
  });

  it("returns an empty string for empty, null or undefined input", () => {
    expect(redactText("", ["Acme"])).toBe("");
    expect(redactText(null, ["Acme"])).toBe("");
    expect(redactText(undefined, ["Acme"])).toBe("");
  });

  it("is a no-op when the denylist is empty — the 'full' level case", () => {
    const text = "Shipped payments at Acme Corp with Jane.";
    expect(redactText(text, [])).toBe(text);
  });
});

describe("resolveEffectiveLevel", () => {
  it("prefers the per-role override over the account default", () => {
    expect(resolveEffectiveLevel("full", "summary")).toBe("summary");
    expect(resolveEffectiveLevel("summary", "detailed")).toBe("detailed");
  });

  it("falls back to the account default when the role does not override", () => {
    expect(resolveEffectiveLevel("detailed", null)).toBe("detailed");
    expect(resolveEffectiveLevel("detailed", undefined)).toBe("detailed");
  });

  it("falls back to the strictest level when nothing is set at all", () => {
    expect(resolveEffectiveLevel(null, null)).toBe("summary");
    expect(resolveEffectiveLevel(undefined, undefined)).toBe("summary");
  });
});
