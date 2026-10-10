'use client';
// Delivery steps are queued on the device when the network drops, then sent in order when it returns.
// Each step carries a client event id, so a step that did reach the server is never applied twice.
import { ApiError, api } from './api';

export interface QueuedStep {
  id: string; // client event id
  orderId: string;
  action: 'picked-up' | 'out-for-delivery' | 'delivered' | 'failed' | 'returned';
  fields: Record<string, string>;
  files?: Record<string, Blob>;
  queuedAt: number;
  error?: string;
}

const DB = 'sp-delivery';
const STORE = 'queue';
let memory: QueuedStep[] = []; // used when IndexedDB is unavailable (private mode)

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const r = fn(db.transaction(STORE, mode).objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null); // e.g. a value the browser cannot store
    }
  });
}

export async function listQueued(): Promise<QueuedStep[]> {
  const all = await tx<Stored[]>('readonly', (s) => s.getAll() as IDBRequest<Stored[]>);
  return [...(all ?? []).map(fromStored), ...memory].sort((a, b) => a.queuedAt - b.queuedAt);
}

// Files are kept as ArrayBuffers: some browsers (private windows) refuse to store Blobs in IndexedDB.
type Stored = Omit<QueuedStep, 'files'> & { files?: Record<string, { type: string; data: ArrayBuffer }> };

async function toStored(step: QueuedStep): Promise<Stored> {
  if (!step.files) return step as Stored;
  const files: Stored['files'] = {};
  for (const [k, v] of Object.entries(step.files)) files[k] = { type: v.type, data: await v.arrayBuffer() };
  return { ...step, files };
}

const fromStored = (s: Stored): QueuedStep => ({
  ...s,
  files: s.files ? Object.fromEntries(Object.entries(s.files).map(([k, v]) => [k, new Blob([v.data], { type: v.type })])) : undefined,
});

async function put(step: QueuedStep) {
  const stored = await toStored(step);
  if ((await tx('readwrite', (s) => s.put(stored))) === null) memory = [...memory.filter((m) => m.id !== step.id), step];
}

async function remove(id: string) {
  await tx('readwrite', (s) => s.delete(id));
  memory = memory.filter((m) => m.id !== id);
}

export const newEventId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9-]/g, '');

function send(step: QueuedStep) {
  const path = `/delivery/jobs/${step.orderId}/${step.action}`;
  if (step.files && Object.keys(step.files).length) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(step.fields)) fd.append(k, v);
    fd.append('clientEventId', step.id);
    for (const [k, v] of Object.entries(step.files)) fd.append(k, v, `${k}.${v.type.includes('png') ? 'png' : 'jpg'}`);
    return api(path, { method: 'POST', body: fd });
  }
  return api(path, { method: 'POST', json: { ...step.fields, clientEventId: step.id } });
}

/**
 * Try to send now. Network failure → queued (returns 'queued'). A refusal from the server (wrong code,
 * missing photo…) is thrown so the rider can correct it; it is never queued.
 */
export async function submitStep(step: Omit<QueuedStep, 'id' | 'queuedAt'>): Promise<'sent' | 'queued'> {
  const full: QueuedStep = { ...step, id: newEventId(), queuedAt: Date.now() };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await put(full);
    return 'queued';
  }
  try {
    await send(full);
    return 'sent';
  } catch (e) {
    if (e instanceof ApiError) throw e;
    await put(full);
    return 'queued';
  }
}

let flushing: Promise<number> | null = null;
/** Send queued steps in order. Stops at the first network failure; server refusals are kept with their message. */
export function flushQueue(): Promise<number> {
  flushing ??= (async () => {
    let sent = 0;
    for (const step of await listQueued()) {
      if (step.error) continue;
      try {
        await send(step);
        await remove(step.id);
        sent++;
      } catch (e) {
        if (!(e instanceof ApiError)) break;
        await put({ ...step, error: e.message });
      }
    }
    return sent;
  })().finally(() => (flushing = null));
  return flushing;
}

export const discardQueued = remove;
