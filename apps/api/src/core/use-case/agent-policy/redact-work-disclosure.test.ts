import { describe, expect, it } from "vitest";
import {
  DISCLOSURE_PLACEHOLDER,
  buildBlockedTerms,
  findDisclosureViolations,
  redactText,
  resolveDisclosureCompanies,
  resolveEffectiveLevel,
} from "./redact-work-disclosure.js";

/** Every employer on one level — the shape the old scalar-level API implied. */
function companiesAt(
  level: "summary" | "detailed" | "full",
  names: string[],
): { name: string; level: "summary" | "detailed" | "full" }[] {
  return names.map((name) => ({ name, level }));
}

describe("buildBlockedTerms", () => {
  it("blocks every employer name plus the user's terms at summary level", () => {
    const terms = buildBlockedTerms({
      companies: companiesAt("summary", ["Acme Corp", "Nubank"]),
      userBlockedTerms: ["Project Falcon"],
    });

    expect(terms).toEqual(["Acme Corp", "Nubank", "Project Falcon"]);
  });

  it("drops employer names at detailed level — naming the employer IS the level", () => {
    const terms = buildBlockedTerms({
      companies: companiesAt("detailed", ["Acme Corp", "Nubank"]),
      userBlockedTerms: ["Project Falcon"],
    });

    expect(terms).toEqual(["Project Falcon"]);
  });

  it("blocks nothing but the user's own terms at full level", () => {
    expect(
      buildBlockedTerms({
        companies: companiesAt("full", ["Acme Corp"]),
        userBlockedTerms: ["Project Falcon"],
      }),
    ).toEqual(["Project Falcon"]);

    expect(
      buildBlockedTerms({
        companies: companiesAt("full", ["Acme Corp"]),
        userBlockedTerms: [],
      }),
    ).toEqual([]);
  });

  it("keeps a summary employer blocked while a full one beside it is not", () => {
    const terms = buildBlockedTerms({
      companies: [
        { name: "VTEX", level: "full" },
        { name: "PagBank", level: "summary" },
      ],
      userBlockedTerms: [],
    });

    expect(terms).toEqual(["PagBank"]);
  });

  it("ignores empty, whitespace-only and single-character terms", () => {
    const terms = buildBlockedTerms({
      companies: companiesAt("summary", ["", "   ", "X"]),
      userBlockedTerms: ["A", "ok"],
    });

    expect(terms).toEqual(["ok"]);
  });

  it("de-duplicates case-insensitively, keeping the first spelling", () => {
    const terms = buildBlockedTerms({
      companies: companiesAt("summary", ["Acme", "ACME", "acme"]),
      userBlockedTerms: ["AcMe"],
    });

    expect(terms).toEqual(["Acme"]);
  });

  it("trims surrounding whitespace so ' Acme ' and 'Acme' are one rule", () => {
    expect(
      buildBlockedTerms({
        companies: companiesAt("summary", [" Acme "]),
        userBlockedTerms: ["Acme"],
      }),
    ).toEqual(["Acme"]);
  });
});

describe("resolveDisclosureCompanies", () => {
  it("gives each employer the level of its OWN role, not one shared level", () => {
    expect(
      resolveDisclosureCompanies("summary", [
        { companyName: "VTEX", disclosureLevel: "full" },
        { companyName: "PagBank", disclosureLevel: null },
      ]),
    ).toEqual([
      { name: "VTEX", level: "full" },
      { name: "PagBank", level: "summary" },
    ]);
  });

  it("falls back to the strictest level when nothing is set at all", () => {
    expect(
      resolveDisclosureCompanies(null, [{ companyName: "Acme Corp" }]),
    ).toEqual([{ name: "Acme Corp", level: "summary" }]);
  });
});

describe("findDisclosureViolations", () => {
  it("matches on word boundaries, not substrings", () => {
    expect(findDisclosureViolations("A beautiful sunset", ["sun"])).toEqual([]);
    expect(findDisclosureViolations("The sun is out", ["sun"])).toEqual(["sun"]);
  });

  it("does not match a term glued to another word by a digit, but does match one separated by an underscore", () => {
    // A digit is part of a word token, so "sun" is genuinely absent from
    // "sun4life". An underscore is punctuation between tokens — it is how a URL
    // spells a space — so `my_sun_service` discloses "sun" exactly as
    // `my-sun-service` does. This assertion used to expect [] on both, which is
    // the leak in BUG-20260827-disclosure-underscore-slug written down as a test.
    expect(findDisclosureViolations("sun4life", ["sun"])).toEqual([]);
    expect(findDisclosureViolations("my_sun_service", ["sun"])).toEqual(["sun"]);
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

  /**
   * A URL cannot contain a space, so an agent that wants to link its work
   * writes the employer as a slug: `acme-corp`, `acme_corp`, `Acme%20Corp` or
   * just `acmecorp`. Every one of those reaches the same anonymous reader as
   * the prose does — `externalUrl` is the post's `<a href>`.
   *
   * The paired negatives are the real risk of matching these: a term that
   * matches too widely turns a legitimate post into a 400.
   */
  describe("a multi-word employer written as a URL slug", () => {
    it("matches the hyphenated slug inside a link", () => {
      expect(
        findDisclosureViolations(
          "https://github.com/acme-corp-internal/ledger/pull/42",
          ["Acme Corp"],
        ),
      ).toEqual(["Acme Corp"]);
    });

    it("matches the percent-encoded space", () => {
      expect(
        findDisclosureViolations("https://example.com/Acme%20Corp/report", [
          "Acme Corp",
        ]),
      ).toEqual(["Acme Corp"]);
    });

    it("matches the underscored slug", () => {
      expect(
        findDisclosureViolations("https://git.example.com/acme_corp/ledger", [
          "Acme Corp",
        ]),
      ).toEqual(["Acme Corp"]);
    });

    it("matches a domain that drops the separator entirely", () => {
      expect(
        findDisclosureViolations("https://acmecorp.com/blog/ledger", [
          "Acme Corp",
        ]),
      ).toEqual(["Acme Corp"]);
    });

    it("matches a three-word employer slug", () => {
      expect(
        findDisclosureViolations(
          "https://git.example.com/banco-do-brasil/repo",
          ["Banco do Brasil"],
        ),
      ).toEqual(["Banco do Brasil"]);
    });

    it("matches a name whose own punctuation is flattened into the slug", () => {
      expect(
        findDisclosureViolations("https://vale-s-a.example.com/x", [
          "Vale S.A.",
        ]),
      ).toEqual(["Vale S.A."]);
    });

    it("still reports the canonical settings spelling, not the slug", () => {
      expect(
        findDisclosureViolations("https://github.com/wildlife-studios/engine", [
          "Wildlife Studios",
        ]),
      ).toEqual(["Wildlife Studios"]);
    });

    it("still matches a name whose own punctuation is not a slug separator", () => {
      // "CI&T" is a real seeded employer. Tolerating slug separators must not
      // cost the spelling the user actually typed.
      expect(
        findDisclosureViolations("Worked as Elixir Developer at CI&T.", [
          "CI&T",
        ]),
      ).toEqual(["CI&T"]);
      expect(
        findDisclosureViolations("https://github.com/ci-t/ledger", ["CI&T"]),
      ).toEqual(["CI&T"]);
    });

    it("matches a single-word employer glued to the next slug word by an underscore", () => {
      expect(
        findDisclosureViolations(
          "https://github.com/nubank_core/ledger/pull/42",
          ["Nubank"],
        ),
      ).toEqual(["Nubank"]);
      expect(
        findDisclosureViolations(
          "https://jira.nubank_internal.com/browse/LED-1",
          ["Nubank"],
        ),
      ).toEqual(["Nubank"]);
    });

    it("matches a multi-word employer slug trailed by an underscored word", () => {
      expect(
        findDisclosureViolations(
          "https://github.com/acme_corp_internal/ledger",
          ["Acme Corp"],
        ),
      ).toEqual(["Acme Corp"]);
    });

    it("does not match a URL that merely contains one of the words", () => {
      expect(
        findDisclosureViolations(
          "https://github.com/corporate-ledger/pull/42",
          ["Acme Corp"],
        ),
      ).toEqual([]);
    });

    it("does not match the words separated by other words", () => {
      expect(
        findDisclosureViolations("mercado for livre software", [
          "Mercado Livre",
        ]),
      ).toEqual([]);
    });

    it("does not match a slug glued to a longer word", () => {
      expect(
        findDisclosureViolations("https://example.com/acmecorporate/ledger", [
          "Acme Corp",
        ]),
      ).toEqual([]);
    });
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

  it("redacts the employer written as a URL slug on the read side", () => {
    // GET /me/work-context hands the agent back prose it may reuse; leaving the
    // slug in there is handing it the leak ready-made.
    expect(
      redactText("Notes: https://github.com/acme-corp-internal/ledger", [
        "Acme Corp",
      ]),
    ).toBe(`Notes: https://github.com/${DISCLOSURE_PLACEHOLDER}-internal/ledger`);
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
