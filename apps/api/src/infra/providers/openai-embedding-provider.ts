import OpenAI from "openai";
import { IEmbeddingProvider } from "../../core/providers/embedding/embedding-provider.js";
import {
  recordOpenAiRequest,
  recordOpenAiUsage,
} from "../observability/metrics.js";

/**
 * Telemetry must never be able to break the thing it is measuring: a broken
 * exporter turning every embedding into a 500 would be a far worse outage than
 * a gap in a spend dashboard. Everything metric-related goes through here.
 */
function recordCall(params: {
  model: string;
  outcome: "success" | "error";
  promptTokens?: number | null;
}): void {
  try {
    recordOpenAiUsage({
      model: params.model,
      operation: "embedding",
      promptTokens: params.promptTokens,
    });
    recordOpenAiRequest({
      model: params.model,
      operation: "embedding",
      outcome: params.outcome,
    });
  } catch {
    // Intentionally swallowed — see above.
  }
}

export class OpenAiEmbeddingProvider implements IEmbeddingProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      /**
       * The SDK default is 10 minutes. This provider runs inside the resume
       * embedding worker, which has only `RESUME_EMBEDDING_WORKER_CONCURRENCY`
       * (4) slots — one hung request would hold a quarter of the worker's
       * capacity for ten minutes. An embedding call that has not answered in
       * 15s is not going to.
       */
      timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? "15000"),
      maxRetries: Number(process.env.OPENAI_MAX_RETRIES ?? "2"),
    });
  }

  async createEmbedding(text: string): Promise<number[]> {
    // Read once and reuse, so the metric is labelled with the model that was
    // actually asked for rather than one a later env mutation would report.
    const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";

    let response;
    try {
      response = await this.client.embeddings.create({
        model,
        input: text,
      });
    } catch (error) {
      recordCall({ model, outcome: "error" });
      // Re-thrown unchanged: the queue's retry and Sentry both need the SDK's
      // own error (status code, request id), not a wrapper.
      throw error;
    }

    const embedding = response.data[0]?.embedding;

    // Returning `[]` here was worse than failing: an empty vector travels all
    // the way to `toPgVectorParam` or to a cosine comparison and blows up
    // somewhere with no connection to the actual cause — a provider that
    // answered without an embedding (defect F28). Failing at the source means
    // the queue's retry sees the real error and the resume keeps its previous,
    // valid vector.
    if (!embedding || embedding.length === 0) {
      // Tokens are still recorded: OpenAI billed us for this call even though
      // the answer was unusable, and that is precisely the spend worth seeing.
      // The request counts as an error, because from the caller's point of view
      // it failed.
      recordCall({
        model,
        outcome: "error",
        promptTokens: response.usage?.prompt_tokens,
      });
      throw new Error("Embedding provider returned no embedding");
    }

    recordCall({
      model,
      outcome: "success",
      promptTokens: response.usage?.prompt_tokens,
    });

    return embedding;
  }
}
