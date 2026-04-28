import { IEmbeddingProvider } from "../../core/providers/embedding/embedding-provider.js";

export class NoopEmbeddingProvider implements IEmbeddingProvider {
  async createEmbedding(): Promise<number[]> {
    throw new Error(
      "Embedding provider is not configured. Set OPENAI_API_KEY.",
    );
  }
}
