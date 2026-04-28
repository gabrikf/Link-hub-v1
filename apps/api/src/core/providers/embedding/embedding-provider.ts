export interface IEmbeddingProvider {
  createEmbedding(text: string): Promise<number[]>;
}
