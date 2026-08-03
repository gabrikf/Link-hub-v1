import { describe, expect, it, vi } from "vitest";
import { OpenAiRecruiterQueryConversionProvider } from "./openai-recruiter-query-conversion-provider.js";

function fakeCompletion(content: string) {
  return {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content } }] }),
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
});
