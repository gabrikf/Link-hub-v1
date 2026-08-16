import {
  ActivityDigestJobPayload,
  IActivityDigestQueue,
} from "./activity-digest-queue.js";

export class InMemoryActivityDigestQueue implements IActivityDigestQueue {
  public readonly jobs: ActivityDigestJobPayload[] = [];
  public sweepScheduledCount = 0;

  async enqueue(payload: ActivityDigestJobPayload): Promise<void> {
    this.jobs.push(payload);
  }

  /**
   * Counts calls rather than flipping a boolean, so a test can assert the
   * BullMQ contract this stands in for: registering the sweep repeatedly is
   * allowed and must stay a no-op.
   */
  async ensureSweepScheduled(): Promise<void> {
    this.sweepScheduledCount += 1;
  }

  clear() {
    this.jobs.length = 0;
    this.sweepScheduledCount = 0;
  }
}
