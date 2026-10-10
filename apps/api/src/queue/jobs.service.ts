import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { config } from '../config/config';

export type JobHandler = (data: any) => Promise<void>;

const QUEUE = 'sahyadri';

/**
 * Background jobs. In `redis` mode jobs go through BullMQ (retries with backoff, delays, repeats).
 * In `inline` mode (tests) jobs run in-process; delayed jobs are kept aside and run only on demand.
 */
@Injectable()
export class JobsService implements OnModuleDestroy {
  private readonly log = new Logger('Jobs');
  private readonly handlers = new Map<string, JobHandler>();
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private readonly pending = new Set<Promise<void>>();
  readonly delayed: Array<{ name: string; data: unknown; runAt: number }> = [];
  private readonly mode = config().QUEUE_MODE;
  private repeats: Array<{ name: string; everyMs: number }> = [];

  private connection(): ConnectionOptions {
    const u = new URL(config().REDIS_URL);
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      password: u.password || undefined,
      username: u.username || undefined,
      db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
      maxRetriesPerRequest: null,
    };
  }

  private getQueue(): Queue {
    if (!this.queue) this.queue = new Queue(QUEUE, { connection: this.connection() });
    return this.queue;
  }

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  /** Run a job every `everyMs` (redis mode only; workers must be running). */
  repeat(name: string, everyMs: number): void {
    this.repeats.push({ name, everyMs });
  }

  async add(name: string, data: unknown = {}, opts: { delayMs?: number; jobId?: string; attempts?: number } = {}): Promise<void> {
    // BullMQ rejects ':' in custom ids; check in every mode so tests catch it too.
    if (opts.jobId?.includes(':')) throw new Error(`Job id must not contain ':' (${opts.jobId})`);
    if (this.mode === 'inline') {
      if (opts.delayMs && opts.delayMs > 0) {
        this.delayed.push({ name, data, runAt: Date.now() + opts.delayMs });
        return;
      }
      const p = this.run(name, data).catch((e) => this.log.error(`Inline job ${name} failed: ${(e as Error).message}`));
      this.pending.add(p);
      void p.finally(() => this.pending.delete(p));
      return;
    }
    await this.getQueue().add(name, data, {
      delay: opts.delayMs,
      jobId: opts.jobId,
      attempts: opts.attempts ?? 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async run(name: string, data: unknown): Promise<void> {
    const h = this.handlers.get(name);
    if (!h) throw new Error(`No handler registered for job ${name}`);
    await h(data);
  }

  /** Inline mode: wait for queued jobs to finish (tests). */
  async drain(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  /** Inline mode: run delayed jobs that are due (or all with `force`). */
  async runDelayed(force = false): Promise<void> {
    const due = this.delayed.filter((d) => force || d.runAt <= Date.now());
    for (const d of due) this.delayed.splice(this.delayed.indexOf(d), 1);
    for (const d of due) await this.run(d.name, d.data);
  }

  async startWorker(): Promise<void> {
    if (this.mode === 'inline' || this.worker) return;
    const q = this.getQueue();
    for (const r of this.repeats) {
      await q.upsertJobScheduler(`repeat:${r.name}`, { every: r.everyMs }, { name: r.name, data: {} });
    }
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        await this.run(job.name, job.data);
      },
      { connection: this.connection(), concurrency: 5 },
    );
    this.worker.on('failed', (job, err) => this.log.warn(`Job ${job?.name} failed (attempt ${job?.attemptsMade}): ${err.message}`));
    this.log.log(`Worker started with ${this.handlers.size} job types`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
