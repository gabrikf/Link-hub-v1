import {
  IResumeEmbeddingQueue,
  ResumeEmbeddingJobPayload,
} from "./resume-embedding-queue.js";

export class InMemoryResumeEmbeddingQueue implements IResumeEmbeddingQueue {
  public readonly jobs: ResumeEmbeddingJobPayload[] = [];

  async enqueue(payload: ResumeEmbeddingJobPayload): Promise<void> {
    this.jobs.push(payload);
  }
}
