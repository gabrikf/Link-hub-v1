import OpenAI from "openai";
import { IEmbeddingProvider } from "../../core/providers/embedding/embedding-provider.js";

export class OpenAiEmbeddingProvider implements IEmbeddingProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async createEmbedding(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
      input: text,
    });

    return response.data[0]?.embedding ?? [];
  }
}
