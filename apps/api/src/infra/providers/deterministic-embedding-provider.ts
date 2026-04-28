import { IEmbeddingProvider } from "../../core/providers/embedding/embedding-provider.js";

const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

/**
 * Local/dev fallback embedding provider used when OpenAI is not configured.
 * It produces deterministic vectors from text so semantic search keeps working.
 */
export class DeterministicEmbeddingProvider implements IEmbeddingProvider {
  async createEmbedding(text: string): Promise<number[]> {
    const normalized = text.trim().toLowerCase();
    const vector = new Array<number>(DEFAULT_EMBEDDING_DIMENSIONS).fill(0);

    for (let index = 0; index < normalized.length; index += 1) {
      const charCode = normalized.charCodeAt(index);
      const bucket = index % DEFAULT_EMBEDDING_DIMENSIONS;
      vector[bucket] += (charCode % 89) / 89;
    }

    let magnitudeSquared = 0;
    for (const value of vector) {
      magnitudeSquared += value * value;
    }

    const magnitude = Math.sqrt(magnitudeSquared) || 1;
    return vector.map((value) => value / magnitude);
  }
}
