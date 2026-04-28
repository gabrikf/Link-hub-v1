let workerInstance: Worker | null = null;

export function getRerankerWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL("../workers/reranker.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
  }

  return workerInstance;
}

export function terminateRerankerWorker() {
  if (!workerInstance) {
    return;
  }

  workerInstance.terminate();
  workerInstance = null;
}
