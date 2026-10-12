// Delivery steps survive a dropped signal: a step that cannot be sent is kept on the phone and sent,
// in order, when the network returns. Every step carries a client event id, so a step that did reach
// the server is applied once even if it is sent again. A refusal from the server (wrong code, missing
// photo…) is never retried: it is shown to the rider, who can correct it or dismiss it.
// This file has no React Native imports so it can be unit-tested.

export type StepAction = 'picked-up' | 'out-for-delivery' | 'delivered' | 'failed' | 'returned';

export interface StepFile {
  uri: string;
  name: string;
  type: string;
}

export interface QueuedStep {
  id: string;
  orderId: string;
  action: StepAction;
  fields: Record<string, string>;
  files?: Record<string, StepFile>;
  queuedAt: number;
  /** Set when the server refused the step; it is then kept for the rider and not retried. */
  error?: string;
}

export interface QueueStore {
  load(): Promise<QueuedStep[]>;
  save(steps: QueuedStep[]): Promise<void>;
}

/** Photos taken for a queued step are copied somewhere that survives the app restarting. */
export interface FileKeeper {
  keep(file: StepFile): Promise<StepFile>;
  drop(file: StepFile): Promise<void>;
}

export interface QueueDeps {
  store: QueueStore;
  files: FileKeeper;
  send: (step: QueuedStep) => Promise<unknown>;
  /** True when the failure means the request never reached the server. */
  isNetworkError: (e: unknown) => boolean;
  /** Best guess at connectivity; when false, steps are queued without trying. */
  online: () => boolean;
  newId: () => string;
  now?: () => number;
}

export type SubmitResult = 'sent' | 'queued';

export function createQueue(d: QueueDeps) {
  const now = d.now ?? Date.now;
  let flushing: Promise<number> | null = null;
  // One write at a time, so two quick steps cannot overwrite each other's save.
  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };

  const list = () => d.store.load().then((s) => [...s].sort((a, b) => a.queuedAt - b.queuedAt));

  async function keepFiles(step: QueuedStep): Promise<QueuedStep> {
    if (!step.files) return step;
    const files: Record<string, StepFile> = {};
    for (const [k, f] of Object.entries(step.files)) files[k] = await d.files.keep(f);
    return { ...step, files };
  }

  const enqueue = (step: QueuedStep) =>
    exclusive(async () => {
      const kept = await keepFiles(step);
      const all = await d.store.load();
      await d.store.save([...all.filter((s) => s.id !== kept.id), kept]);
    });

  const remove = (id: string) =>
    exclusive(async () => {
      const all = await d.store.load();
      const gone = all.find((s) => s.id === id);
      await d.store.save(all.filter((s) => s.id !== id));
      for (const f of Object.values(gone?.files ?? {})) await d.files.drop(f).catch(() => undefined);
    });

  const markRefused = (id: string, error: string) =>
    exclusive(async () => {
      const all = await d.store.load();
      await d.store.save(all.map((s) => (s.id === id ? { ...s, error } : s)));
    });

  /**
   * Send now if possible. Queued instead when offline, when the request fails on the network, or when
   * earlier steps are still waiting (steps for an order must reach the server in order).
   * A server refusal is thrown to the caller so the rider can fix it; it is never queued.
   */
  async function submit(input: Omit<QueuedStep, 'id' | 'queuedAt'>): Promise<SubmitResult> {
    const step: QueuedStep = { ...input, id: d.newId(), queuedAt: now() };
    const waiting = (await d.store.load()).some((s) => !s.error);
    if (!d.online() || waiting) {
      await enqueue(step);
      if (d.online()) void flush();
      return 'queued';
    }
    try {
      await d.send(step);
      return 'sent';
    } catch (e) {
      if (!d.isNetworkError(e)) throw e;
      await enqueue(step);
      return 'queued';
    }
  }

  /** Send waiting steps oldest first. Stops at the first network failure. Returns how many were sent. */
  function flush(): Promise<number> {
    flushing ??= (async () => {
      let sent = 0;
      for (const step of await list()) {
        if (step.error) continue;
        try {
          await d.send(step);
          await remove(step.id);
          sent++;
        } catch (e) {
          if (d.isNetworkError(e)) break;
          await markRefused(step.id, e instanceof Error ? e.message : 'Not accepted');
        }
      }
      return sent;
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  return { submit, flush, list, discard: remove };
}

export type DeliveryQueue = ReturnType<typeof createQueue>;
