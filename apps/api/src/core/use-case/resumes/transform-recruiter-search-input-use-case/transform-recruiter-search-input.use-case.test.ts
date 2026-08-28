import { RECRUITER_QUERY_FALLBACK_LIMITS } from "@repo/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { IEmbeddingProvider } from "../../../providers/embedding/embedding-provider.js";
import {
  BuildRecruiterSemanticQueryInput,
  IRecruiterQueryConversionProvider,
  RecruiterQueryConversionOutput,
} from "../../../providers/query-conversion/recruiter-query-conversion-provider.js";
import { InMemoryResumeSearchRepository } from "../../../repositories/resume-search/in-memory-resume-search-repository.js";
import { InMemoryUserPreferencesRepository } from "../../../repositories/user-preferences/in-memory-user-preferences-repository.js";
import { searchTestEmbedder, seedCorpus } from "../search-testing/search-corpus.js";
import { SearchResumesByRecruiterQueryUseCase } from "../search-resumes-by-recruiter-query-use-case/search-resumes-by-recruiter-query.use-case.js";
import { TransformRecruiterSearchInputUseCase } from "./transform-recruiter-search-input.use-case.js";

class FailingConversionProvider implements IRecruiterQueryConversionProvider {
  async buildSemanticQuery(): Promise<RecruiterQueryConversionOutput> {
    throw new Error("LLM unavailable");
  }
}

class EchoConversionProvider implements IRecruiterQueryConversionProvider {
  public lastInput?: BuildRecruiterSemanticQueryInput;

  async buildSemanticQuery(
    input: BuildRecruiterSemanticQueryInput,
  ): Promise<RecruiterQueryConversionOutput> {
    this.lastInput = input;
    return { semanticQuery: "Role: Full Stack Engineer" };
  }
}

/** Records what the embedder was actually asked to embed. */
class RecordingEmbeddingProvider implements IEmbeddingProvider {
  public lastText = "";

  async createEmbedding(text: string): Promise<number[]> {
    this.lastText = text;
    return searchTestEmbedder.embed(text);
  }
}

function build(conversion: IRecruiterQueryConversionProvider) {
  const repository = new InMemoryResumeSearchRepository();
  seedCorpus(repository);
  const embedding = new RecordingEmbeddingProvider();
  const search = new SearchResumesByRecruiterQueryUseCase(
    embedding,
    repository,
  );

  const preferences = new InMemoryUserPreferencesRepository();

  return {
    embedding,
    preferences,
    sut: new TransformRecruiterSearchInputUseCase(
      conversion,
      search,
      preferences,
    ),
  };
}

const RECRUITER_ID = "recruiter-1";

describe("TransformRecruiterSearchInputUseCase", () => {
  let conversion: EchoConversionProvider;

  beforeEach(() => {
    conversion = new EchoConversionProvider();
  });

  it("passes sources through to the search", async () => {
    const { sut } = build(conversion);

    const result = await sut.execute({
      userId: RECRUITER_ID,
      chatPrompt: "react node.js engineer",
      sources: ["posts"],
    });

    // Only candidates with a posts vector are comparable, so scoping must
    // actually reach the repository rather than being dropped in the middle.
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(
      result.candidates.every((item) => item.sourceSimilarity?.posts !== undefined),
    ).toBe(true);
  });

  it("truncates the degraded query so a huge attachment cannot 400 the model", async () => {
    const { sut, embedding } = build(new FailingConversionProvider());

    // `attachmentText` accepts 100 000 characters. Concatenating that into an
    // embedding request is a hard 400 that reaches the recruiter as an
    // uncaught 500 (defect F21).
    const hugeAttachment = "job description ".repeat(10_000);

    const result = await sut.execute({
      userId: RECRUITER_ID,
      chatPrompt: "senior react engineer",
      attachmentText: hugeAttachment,
    });

    expect(hugeAttachment.length).toBeGreaterThan(100_000);
    expect(embedding.lastText.length).toBeLessThanOrEqual(
      RECRUITER_QUERY_FALLBACK_LIMITS.totalChars,
    );
    expect(result.input.semanticQuery.length).toBeLessThanOrEqual(
      RECRUITER_QUERY_FALLBACK_LIMITS.totalChars,
    );
    // Degraded, not broken: the recruiter still gets results.
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("keeps the recruiter's own words at the front of the degraded query", async () => {
    const { sut } = build(new FailingConversionProvider());

    const result = await sut.execute({
      userId: RECRUITER_ID,
      chatPrompt: "senior react engineer",
      attachmentText: "x".repeat(50_000),
    });

    // Truncation must not cost the most informative part of the query.
    expect(result.input.semanticQuery.startsWith("senior react engineer")).toBe(
      true,
    );
  });

  /**
   * The recruiter half of the language plumbing. What matters here is only
   * that a language reaches the provider — what the provider then does with it
   * is D6, asserted in
   * `apps/api/src/infra/providers/openai-recruiter-query-conversion-provider.test.ts`.
   */
  describe("response language", () => {
    it("resolves from the recruiter's own prompt when detection is confident", async () => {
      const { sut } = build(conversion);

      await sut.execute({
        userId: RECRUITER_ID,
        chatPrompt: `
          Preciso contratar uma pessoa desenvolvedora back-end com bastante
          experiência em sistemas distribuídos e em bancos de dados relacionais.
          O time trabalha de forma remota e a vaga é para atuar junto com o
          time de produto na construção de uma plataforma de pagamentos.
        `,
      });

      expect(conversion.lastInput?.language).toBe("pt-BR");
    });

    it("falls back to the recruiter's stored preference, then to Accept-Language, then to en-US", async () => {
      const { sut, preferences } = build(conversion);

      // Nothing to detect ("sre" is three characters), no preference row, no
      // header: the product's source language.
      await sut.execute({ userId: RECRUITER_ID, chatPrompt: "sre" });
      expect(conversion.lastInput?.language).toBe("en-US");

      // Still nothing to detect, but the device said Spanish.
      await sut.execute({
        userId: RECRUITER_ID,
        chatPrompt: "sre",
        acceptLanguage: "es-ES,es;q=0.9",
      });
      expect(conversion.lastInput?.language).toBe("es-ES");

      // An explicit preference beats the device.
      const stored = await preferences.provisionDefaults(RECRUITER_ID);
      stored.applyUpdate({ language: "pt-BR" });
      await preferences.save(stored);

      await sut.execute({
        userId: RECRUITER_ID,
        chatPrompt: "sre",
        acceptLanguage: "es-ES,es;q=0.9",
      });
      expect(conversion.lastInput?.language).toBe("pt-BR");
    });

    it("does not let an uploaded job description decide the recruiter's language", async () => {
      const { sut, preferences } = build(conversion);

      const stored = await preferences.provisionDefaults(RECRUITER_ID);
      stored.applyUpdate({ language: "pt-BR" });
      await preferences.save(stored);

      await sut.execute({
        userId: RECRUITER_ID,
        // A JD is somebody else's prose. A Brazilian recruiter pasting an
        // English job spec has not switched languages.
        attachmentText: `
          We are looking for a senior backend engineer with experience in
          distributed systems and relational databases. You will work closely
          with the product team on a payments platform used by thousands of
          customers every day.
        `,
      });

      expect(conversion.lastInput?.language).toBe("pt-BR");
    });

    it("never throws on a malformed Accept-Language", async () => {
      const { sut } = build(conversion);

      await expect(
        sut.execute({
          userId: RECRUITER_ID,
          chatPrompt: "sre",
          acceptLanguage: "!!!;;;q=;;;",
        }),
      ).resolves.toBeDefined();

      expect(conversion.lastInput?.language).toBe("en-US");
    });

    it("does not write a preferences row as a side effect of searching", async () => {
      const { sut, preferences } = build(conversion);

      await sut.execute({ userId: RECRUITER_ID, chatPrompt: "sre" });

      expect(preferences.count()).toBe(0);
    });
  });
});