/**
 * In-process FIFO for slow AI jobs, one at a time so a burst of submissions does not hit LLM rate limits.
 * Jobs are lost on restart; callers mark unfinished work as failed at startup instead.
 */
export class BackgroundQueue {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;

  add(name: string, job: () => Promise<void>): void {
    this.pending++;
    this.tail = this.tail.then(async () => {
      try {
        await job();
      } catch (e) {
        console.error(`Background job ${name} failed:`, e);
      } finally {
        this.pending--;
      }
    });
  }

  /** Resolves once every job queued so far has finished (used by tests and graceful shutdown). */
  idle(): Promise<void> {
    return this.tail;
  }

  get size(): number {
    return this.pending;
  }
}
