import { describe, expect, it } from "vitest";

import {
  languageInstruction,
  resolveResponseLanguage,
} from "./resolve-response-language.js";

/** Long enough for `detectLanguage` to be confident — short text is by design undetectable. */
const PORTUGUESE_TEXT = `
Sou desenvolvedor back-end há oito anos e atuo principalmente com sistemas
distribuídos. Na última empresa fui responsável pela migração de um monólito
para serviços menores, o que reduziu o tempo de deploy de trinta minutos para
menos de cinco. Também liderei um time de quatro pessoas.
`;

const SPANISH_TEXT = `
Soy desarrollador de software con más de siete años de experiencia en empresas
de tecnología. En mi último trabajo fui responsable del diseño de una
plataforma de pagos que procesaba miles de operaciones cada día. También lideré
un equipo pequeño.
`;

/** Real text, but nowhere near enough of it to clear the confidence bar. */
const UNDETECTABLE_TEXT = "React, Node.js, PostgreSQL";

describe("resolveResponseLanguage — precedence", () => {
  it("prefers a confident detection over the stored preference", () => {
    expect(
      resolveResponseLanguage({
        userText: PORTUGUESE_TEXT,
        preference: "en-US",
        acceptLanguage: "en-US",
      }),
    ).toBe("pt-BR");
  });

  it("prefers a confident detection over Accept-Language", () => {
    expect(
      resolveResponseLanguage({
        userText: SPANISH_TEXT,
        acceptLanguage: "en-US,en;q=0.9",
      }),
    ).toBe("es-ES");
  });

  it("uses the stored preference when the request carries no text", () => {
    expect(
      resolveResponseLanguage({
        preference: "es-ES",
        acceptLanguage: "en-US",
      }),
    ).toBe("es-ES");
  });

  it("uses the stored preference when the text is present but undetectable", () => {
    expect(
      resolveResponseLanguage({
        userText: UNDETECTABLE_TEXT,
        preference: "es-ES",
        acceptLanguage: "en-US",
      }),
    ).toBe("es-ES");
  });

  it("uses Accept-Language when there is no text and no preference", () => {
    expect(
      resolveResponseLanguage({
        acceptLanguage: "pt-BR,pt;q=0.9,en;q=0.8",
      }),
    ).toBe("pt-BR");
  });

  it("treats a null preference as absent — it means follow the device", () => {
    expect(
      resolveResponseLanguage({
        preference: null,
        acceptLanguage: "es-ES,es;q=0.9",
      }),
    ).toBe("es-ES");
  });

  it("falls back to en-US when every source is absent", () => {
    expect(resolveResponseLanguage({})).toBe("en-US");
  });

  it("falls back to en-US when every source is explicitly null", () => {
    expect(
      resolveResponseLanguage({
        userText: null,
        preference: null,
        acceptLanguage: null,
      }),
    ).toBe("en-US");
  });
});

describe("resolveResponseLanguage — nothing here may fail a request", () => {
  it.each([
    ["an unshipped locale", "de-DE,de;q=0.9"],
    ["a nonsense tag", "xx-XX"],
    ["punctuation only", ";;;,,,"],
    ["an empty string", ""],
    ["a malformed q-value", "pt;q=banana;;"],
    ["only whitespace", "   "],
  ])("falls through to en-US for %s", (_label, header) => {
    expect(resolveResponseLanguage({ acceptLanguage: header })).toBe("en-US");
  });

  it("returns en-US, not a throw, for garbage in every field at once", () => {
    expect(
      resolveResponseLanguage({
        userText: "\u0000\u001b[31m 🎉🎉 ((((",
        preference: null,
        acceptLanguage: "☃☃☃;q=;;;",
      }),
    ).toBe("en-US");
  });

  it("never throws for any combination of sources", () => {
    const texts = [null, undefined, "", UNDETECTABLE_TEXT, PORTUGUESE_TEXT];
    const preferences = [null, undefined, "en-US", "pt-BR", "es-ES"] as const;
    const headers = [null, undefined, "", "xx-XX", "pt-BR,en;q=0.5"];

    for (const userText of texts) {
      for (const preference of preferences) {
        for (const acceptLanguage of headers) {
          expect(() =>
            resolveResponseLanguage({ userText, preference, acceptLanguage }),
          ).not.toThrow();

          expect(["en-US", "pt-BR", "es-ES"]).toContain(
            resolveResponseLanguage({ userText, preference, acceptLanguage }),
          );
        }
      }
    }
  });
});

describe("languageInstruction", () => {
  it("names the locale in English, with its region", () => {
    expect(languageInstruction("pt-BR")).toContain("Brazilian Portuguese");
    expect(languageInstruction("es-ES")).toContain("European Spanish");
    expect(languageInstruction("en-US")).toContain("English");
  });

  it("includes the tag, so a model that ignores the name still has the code", () => {
    expect(languageInstruction("pt-BR")).toContain("pt-BR");
    expect(languageInstruction("es-ES")).toContain("es-ES");
    expect(languageInstruction("en-US")).toContain("en-US");
  });

  it("is one appendable sentence, not a paragraph", () => {
    for (const language of ["en-US", "pt-BR", "es-ES"] as const) {
      const instruction = languageInstruction(language);

      expect(instruction).not.toContain("\n");
      expect(instruction.trim()).toBe(instruction);
      expect(instruction.endsWith(".")).toBe(true);
    }
  });

  it("tells the model to leave structured values alone (D6 and the enum contract)", () => {
    // The recruiter DSL labels and every schema enum value are wire values.
    // An instruction that says only "answer in Portuguese" invites the model to
    // translate `full-time`, which then fails the parse.
    const instruction = languageInstruction("pt-BR");

    expect(instruction).toContain("enum values");
    expect(instruction).toContain("identifiers");
  });

  it("produces a different sentence per locale", () => {
    const instructions = new Set(
      (["en-US", "pt-BR", "es-ES"] as const).map(languageInstruction),
    );

    expect(instructions.size).toBe(3);
  });
});
