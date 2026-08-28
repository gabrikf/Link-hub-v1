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

type CapturedMessage = { role: string; content: string };

/**
 * Like `fakeCompletion`, but keeps the request so a test can assert on the
 * prompt that was actually sent rather than on the module's prompt constant.
 */
function recordingCompletion(content: string) {
  const calls: { messages: CapturedMessage[] }[] = [];

  /**
   * Index access rather than `Array.prototype.at`: apps/api compiles to es2020
   * and does not have it.
   */
  const lastSystemPrompt = (): string => {
    const call = calls[calls.length - 1];
    if (!call) {
      throw new Error("the model was never called");
    }
    const system = call.messages.find(
      (message: CapturedMessage) => message.role === "system",
    );
    if (!system) {
      throw new Error("no system message was sent");
    }
    return system.content;
  };

  return {
    calls,
    lastSystemPrompt,
    client: {
      chat: {
        completions: {
          create: async (params: { messages: CapturedMessage[] }) => {
            calls.push(params);
            return { choices: [{ message: { content } }], usage: undefined };
          },
        },
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
      language: "en-US",
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
      provider.buildSemanticQuery({ chatPrompt: "react engineer", language: "en-US" }),
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

    await provider.buildSemanticQuery({ chatPrompt: "sre", language: "en-US" });

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
      provider.buildSemanticQuery({ chatPrompt: "sre", language: "en-US" }),
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
      provider.buildSemanticQuery({ chatPrompt: "sre", language: "en-US" }),
    ).rejects.toBe(sdkError);
    expect(recordOpenAiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "error" }),
    );
  });

  /**
   * D6 — the deliberate exclusion from "all LLM responses in the user's
   * language".
   *
   * This output is not prose. It is a retrieval DSL that gets embedded and
   * matched against a pgvector index built from English-labelled text, so a
   * translated label moves every query away from the index and degrades search
   * for the recruiter who set their language — silently, with no error
   * anywhere. These two tests are the regression guard for that, and they are
   * the reason the language is threaded here at all.
   */
  describe("D6 — English retrieval labels, whatever the recruiter's language", () => {
    it("pins the labels to English when the resolved language is pt-BR", async () => {
      const { lastSystemPrompt, client } = recordingCompletion(
        JSON.stringify({ semanticQuery: "Role: Engenheiro de Dados" }),
      );
      const provider = withFakeClient(
        new OpenAiRecruiterQueryConversionProvider("test-key"),
        client,
      );

      await provider.buildSemanticQuery({
        chatPrompt: "preciso de uma pessoa engenheira de dados sênior",
        language: "pt-BR",
      });

      const system = lastSystemPrompt();

      // Every label the prompt can emit, still spelled in English.
      for (const label of [
        "Role",
        "Seniority",
        "Core Skills",
        "Secondary Skills",
        "Titles",
        "Domain",
        "Responsibilities",
        "Constraints",
        "Work Model",
      ]) {
        expect(system).toContain(label);
      }

      // And an explicit instruction not to translate them, so the model is not
      // left to infer it from an otherwise entirely Portuguese exchange.
      expect(system).toContain("pt-BR");
      expect(system).toMatch(/label[^]*?English/i);
      expect(system).toMatch(/(do not|never) translate/i);
    });

    it("does not carry the generic write-your-prose-in-X instruction", async () => {
      const { lastSystemPrompt, client } = recordingCompletion(
        JSON.stringify({ semanticQuery: "Role: Data Engineer" }),
      );
      const provider = withFakeClient(
        new OpenAiRecruiterQueryConversionProvider("test-key"),
        client,
      );

      await provider.buildSemanticQuery({
        chatPrompt: "preciso de uma pessoa engenheira de dados sênior",
        language: "pt-BR",
      });

      const system = lastSystemPrompt();

      // `languageInstruction` is the right tool for a prose prompt and the
      // wrong one here: it would tell the model to write in Brazilian
      // Portuguese, and the labels are the first thing it would rewrite.
      expect(system).not.toContain(
        "Write all natural-language prose in your response",
      );
      expect(system).not.toContain("Brazilian Portuguese");
    });
  });
});