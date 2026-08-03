import OpenAI from "openai";
import { IEmbeddingProvider } from "../../core/providers/embedding/embedding-provider.js";

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
    const response = await this.client.embeddings.create({
      model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
      input: text,
    });

    const embedding = response.data[0]?.embedding;

    // Returning `[]` here was worse than failing: an empty vector travels all
    // the way to `toPgVectorParam` or to a cosine comparison and blows up
    // somewhere with no connection to the actual cause — a provider that
    // answered without an embedding (defect F28). Failing at the source means
    // the queue's retry sees the real error and the resume keeps its previous,
    // valid vector.
    if (!embedding || embedding.length === 0) {
      throw new Error("Embedding provider returned no embedding");
    }

    return embedding;
  }
}
