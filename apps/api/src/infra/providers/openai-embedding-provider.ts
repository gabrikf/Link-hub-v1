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

    return response.data[0]?.embedding ?? [];
  }
}
