import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_VERSION,
  readNumericEnv,
  resolveEmbeddingModel,
  resolveEmbeddingVersion,
  resolveEmbeddingVersionText,
} from "./embedding-config.js";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("embedding configuration", () => {
  it("falls back to the default model when unset or blank", () => {
    delete process.env.EMBEDDING_MODEL;
    expect(resolveEmbeddingModel()).toBe(DEFAULT_EMBEDDING_MODEL);

    process.env.EMBEDDING_MODEL = "   ";
    expect(resolveEmbeddingModel()).toBe(DEFAULT_EMBEDDING_MODEL);

    process.env.EMBEDDING_MODEL = "text-embedding-3-large";
    expect(resolveEmbeddingModel()).toBe("text-embedding-3-large");
  });

  it("never yields NaN for the embedding version", () => {
    // `Number(process.env.EMBEDDING_VERSION ?? "1")` returned NaN for a typo
    // like `v2`. `NaN === NaN` is false, so the content-hash cache could never
    // hit and every job re-embedded every resume — at cost, forever — before
    // writing NaN into an integer column (defect F13).
    for (const value of ["v2", "abc", "", "   ", "1.5", "Infinity"]) {
      process.env.EMBEDDING_VERSION = value;
      const version = resolveEmbeddingVersion();

      expect(Number.isInteger(version), `EMBEDDING_VERSION=${value}`).toBe(
        true,
      );
      expect(Number.isNaN(version)).toBe(false);
    }

    delete process.env.EMBEDDING_VERSION;
    expect(resolveEmbeddingVersion()).toBe(DEFAULT_EMBEDDING_VERSION);

    process.env.EMBEDDING_VERSION = "3";
    expect(resolveEmbeddingVersion()).toBe(3);
    // The section table stores the version as text; both must agree.
    expect(resolveEmbeddingVersionText()).toBe("3");
  });

  it("a valid version compares equal to itself across calls", () => {
    process.env.EMBEDDING_VERSION = "7";
    expect(resolveEmbeddingVersion()).toBe(resolveEmbeddingVersion());

    // The NaN case is what broke the cache, so pin the property directly.
    process.env.EMBEDDING_VERSION = "not-a-number";
    expect(resolveEmbeddingVersion()).toBe(resolveEmbeddingVersion());
  });

  it("never yields NaN for a numeric tunable", () => {
    // `SET LOCAL ivfflat.probes = NaN` aborts the transaction, so every single
    // search 500s until someone notices the typo (defect F20).
    process.env.IVFFLAT_PROBES = "abc";
    expect(readNumericEnv("IVFFLAT_PROBES", 10)).toBe(10);

    process.env.IVFFLAT_PROBES = "";
    expect(readNumericEnv("IVFFLAT_PROBES", 10)).toBe(10);

    delete process.env.IVFFLAT_PROBES;
    expect(readNumericEnv("IVFFLAT_PROBES", 10)).toBe(10);

    process.env.IVFFLAT_PROBES = "40";
    expect(readNumericEnv("IVFFLAT_PROBES", 10)).toBe(40);
  });
});
