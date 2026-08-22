import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordOpenAiRequest,
  recordOpenAiUsage,
} from "../observability/metrics.js";
import { OpenAiRecruiterQueryConversionProvider } from "./openai-recruiter-query-conversion-provider.js";

vi.mock("../observability/metrics.js", () => ({
  recordOpenAiUsage: vi.fn(),
  recordOpenAiRequest: vi.fn(),
}));

function fakeCompletion(content: string, usage?: unknown) {
  return {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content } }], usage }),
      },
    },
  };
}

function withFakeClient(
  provider: OpenAiRecruiterQueryConversionProvider,
  client: unknown,
): OpenAiRecruiterQueryConversionProvider {
  (provider as unknown as { client: unknown }).client = client;
  return provider;
}

describe("OpenAiRecruiterQueryConversionProvider", () => {
  beforeEach(() => {
    vi.mocked(recordOpenAiUsage).mockReset();
    vi.mocked(recordOpenAiRequest).mockReset();
  });

  it("bounds timeout and retries so a hung call cannot hold a request for 30 minutes", () => {
    const provider = new OpenAiRecruiterQueryConversionProvider("test-key");
    const client = (
      provider as unknown as { client: { timeout: number; maxRetries: number } }
    ).client;

    // This call runs inline in the recruiter's HTTP request. The SDK default
    // (600s x 3) would hold a connection and a pool slot for half an hour
    // after the browser gave up (defect F22).
    expect(client.timeout).toBeLessThanOrEqual(60_000);
    expect(client.maxRetries).toBeLessThanOrEqual(3);
  });

  it("does not log the generated query", async () => {
    const provider = withFakeClient(
      new OpenAiRecruiterQueryConversionProvider("test-key"),
      fakeCompletion(
        JSON.stringify({ semanticQuery: "Role: Staff Security Engineer" }),
      ),
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await provider.buildSemanticQuery({
      chatPrompt: "confidential internal role description",
    });

    // The query is derived from whatever the recruiter typed or uploaded, so
    // it belongs in neither stdout nor a log aggregator (defect F22).
    expect(log).not.toHaveBeenCalled();
    expect(result.semanticQuery).toBe("Role: Staff Security Engineer");

    log.mockRestore();
  });

  it("rejects an unparseable response instead of returning a broken query", async () => {
    const provider = withFakeClient(
      new OpenAiRecruiterQueryConversionProvider("test-key"),
      fakeCompletion("not json"),
    );

    await expect(
      provider.buildSemanticQuery({ chatPrompt: "react engineer" }),
    ).rejects.toThrow(/invalid semantic query/i);
  });

  it("records both directions of token spend", async () => {
    const provider = withFakeClient(
      new OpenAiRecruiterQueryConversionProvider("test-key"),
      fakeCompletion(JSON.stringify({ semanticQuery: "Role: SRE" }), {
        prompt_tokens: 900,
        completion_tokens: 120,
      }),
    );

    await provider.buildSemanticQuery({ chatPrompt: "sre" });

    // Input and output tokens are priced differently, so a single "tokens"
    // number cannot be turned back into money.
    expect(recordOpenAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "query_conversion",
        promptTokens: 900,
        completionTokens: 120,
      }),
    );
    expect(recordOpenAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "success" }),
    );
  });

  it("counts a paid-for but unusable answer as an error, with its tokens", async () => {
    const provider = withFakeClient(
      new OpenAiRecruiterQueryConversionProvider("test-key"),
      fakeCompletion("not json", { prompt_tokens: 700, completion_tokens: 5 }),
    );

    await expect(
      provider.buildSemanticQuery({ chatPrompt: "sre" }),
    ).rejects.toThrow(/invalid semantic query/i);

    // We were billed for it even though the caller has to fall back — spend
    // with nothing to show for it is exactly what the dashboard is for.
    expect(recordOpenAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ promptTokens: 700 }),
    );
    expect(recordOpenAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "error" }),
    );
  });

  it("re-throws the SDK's own error unchanged", async () => {
    const sdkError = new Error("500 upstream");
    const provider = withFakeClient(
      new OpenAiRecruiterQueryConversionProvider("test-key"),
      {
        chat: {
          completions: {
            create: async () => {
              throw sdkError;
            },
          },
        },
      },
    );

    await expect(
      provider.buildSemanticQuery({ chatPrompt: "sre" }),
    ).rejects.toBe(sdkError);
    expect(recordOpenAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "error" }),
    );
  });
});
