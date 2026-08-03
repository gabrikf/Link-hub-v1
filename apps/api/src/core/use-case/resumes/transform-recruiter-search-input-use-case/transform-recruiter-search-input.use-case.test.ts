import { RECRUITER_QUERY_FALLBACK_LIMITS } from "@repo/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { IEmbeddingProvider } from "../../../providers/embedding/embedding-provider.js";
import {
  BuildRecruiterSemanticQueryInput,
  IRecruiterQueryConversionProvider,
  RecruiterQueryConversionOutput,
} from "../../../providers/query-conversion/recruiter-query-conversion-provider.js";
import { InMemoryResumeSearchRepository } from "../../../repositories/resume-search/in-memory-resume-search-repository.js";
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

  return {
    embedding,
    sut: new TransformRecruiterSearchInputUseCase(conversion, search),
  };
}

describe("TransformRecruiterSearchInputUseCase", () => {
  let conversion: EchoConversionProvider;

  beforeEach(() => {
    conversion = new EchoConversionProvider();
  });

  it("passes sources through to the search", async () => {
    const { sut } = build(conversion);

    const result = await sut.execute({
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
      chatPrompt: "senior react engineer",
      attachmentText: "x".repeat(50_000),
    });

    // Truncation must not cost the most informative part of the query.
    expect(result.input.semanticQuery.startsWith("senior react engineer")).toBe(
      true,
    );
  });
});
