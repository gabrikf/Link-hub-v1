import "dotenv/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { setupContainer, TOKENS, resolve } from "../di/container.js";
import { ResumeEmbeddingJobPayload } from "../../core/providers/queue/resume-embedding-queue.js";
import { ProcessResumeEmbeddingJobUseCase } from "../../core/use-case/resumes/process-resume-embedding-job-use-case/process-resume-embedding-job.use-case.js";
import { RESUME_EMBEDDING_QUEUE_NAME } from "../providers/bullmq-resume-embedding-queue.js";

setupContainer();

const worker = new Worker<ResumeEmbeddingJobPayload>(
  RESUME_EMBEDDING_QUEUE_NAME,
  async (job) => {
    const processUseCase = resolve<ProcessResumeEmbeddingJobUseCase>(
      TOKENS.ProcessResumeEmbeddingJobUseCase,
    );

    await processUseCase.execute(job.data);
  },
  {
    connection: new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: null,
    }),
    concurrency: Number(process.env.RESUME_EMBEDDING_WORKER_CONCURRENCY ?? "4"),
  },
);

worker.on("completed", (job) => {
  console.log(`resume-embedding job completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`resume-embedding job failed: ${job?.id}`, err);
});

console.log("Resume embedding worker started");
