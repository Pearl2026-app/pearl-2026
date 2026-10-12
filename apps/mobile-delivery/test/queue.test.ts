import { describe, expect, it } from 'vitest';
import { createQueue, type QueuedStep, type StepFile } from '../src/queue';

class Offline extends Error {}
class Refused extends Error {}

function setup(opts: { online?: boolean } = {}) {
  let saved: QueuedStep[] = [];
  const kept: string[] = [];
  const dropped: string[] = [];
  const sent: QueuedStep[] = [];
  const state = { online: opts.online ?? true, failNetwork: false, refuse: new Set<string>() };
  let n = 0;
  let t = 1000;
  const q = createQueue({
    store: { load: async () => saved.map((s) => ({ ...s })), save: async (s) => void (saved = s.map((x) => ({ ...x }))) },
    files: {
      keep: async (f: StepFile) => (kept.push(f.uri), { ...f, uri: `kept/${f.name}` }),
      drop: async (f: StepFile) => void dropped.push(f.uri),
    },
    send: async (s) => {
      if (state.failNetwork) throw new Offline('no signal');
      if (state.refuse.has(s.action)) throw new Refused('Wrong delivery code');
      sent.push(s);
    },
    isNetworkError: (e) => e instanceof Offline,
    online: () => state.online,
    newId: () => `e${++n}`,
    now: () => t++,
  });
  return { q, state, sent, kept, dropped, saved: () => saved };
}

const photo = { photo: { uri: 'cache/p.jpg', name: 'p.jpg', type: 'image/jpeg' } };

describe('delivery step queue', () => {
  it('sends straight away when online', async () => {
    const { q, sent, saved } = setup();
    expect(await q.submit({ orderId: 'o1', action: 'picked-up', fields: {} })).toBe('sent');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.id).toBe('e1');
    expect(saved()).toHaveLength(0);
  });

  it('queues while offline, keeping photos, and sends in order when back online', async () => {
    const { q, state, sent, kept, dropped } = setup({ online: false });
    expect(await q.submit({ orderId: 'o1', action: 'out-for-delivery', fields: {} })).toBe('queued');
    expect(await q.submit({ orderId: 'o1', action: 'delivered', fields: { otp: '123456' }, files: photo })).toBe('queued');
    expect(kept).toEqual(['cache/p.jpg']);
    expect(sent).toHaveLength(0);
    state.online = true;
    expect(await q.flush()).toBe(2);
    expect(sent.map((s) => s.action)).toEqual(['out-for-delivery', 'delivered']);
    expect(sent[1]!.files!.photo!.uri).toBe('kept/p.jpg'); // the kept copy is what gets uploaded
    expect(dropped).toEqual(['kept/p.jpg']);
    expect(await q.list()).toHaveLength(0);
  });

  it('queues when the request fails on the network, keeping the same event id for the retry', async () => {
    const { q, state, sent } = setup();
    state.failNetwork = true;
    expect(await q.submit({ orderId: 'o1', action: 'picked-up', fields: {} })).toBe('queued');
    const [waiting] = await q.list();
    state.failNetwork = false;
    await q.flush();
    expect(sent[0]!.id).toBe(waiting!.id);
  });

  it('never queues a refusal: the rider sees it', async () => {
    const { q, state } = setup();
    state.refuse.add('delivered');
    await expect(q.submit({ orderId: 'o1', action: 'delivered', fields: { otp: '000000' } })).rejects.toThrow('Wrong delivery code');
    expect(await q.list()).toHaveLength(0);
  });

  it('keeps a refused queued step with its message, skips it, and lets the rider dismiss it', async () => {
    const { q, state, sent } = setup({ online: false });
    await q.submit({ orderId: 'o1', action: 'delivered', fields: { otp: '000000' }, files: photo });
    await q.submit({ orderId: 'o2', action: 'picked-up', fields: {} });
    state.online = true;
    state.refuse.add('delivered');
    expect(await q.flush()).toBe(1);
    expect(sent.map((s) => s.orderId)).toEqual(['o2']);
    const [refused] = await q.list();
    expect(refused!.error).toBe('Wrong delivery code');
    expect(await q.flush()).toBe(0); // not retried
    await q.discard(refused!.id);
    expect(await q.list()).toHaveLength(0);
  });

  it('stops at the first network failure and keeps the rest in order', async () => {
    const { q, state, sent } = setup({ online: false });
    await q.submit({ orderId: 'o1', action: 'picked-up', fields: {} });
    await q.submit({ orderId: 'o1', action: 'out-for-delivery', fields: {} });
    state.online = true;
    state.failNetwork = true;
    expect(await q.flush()).toBe(0);
    expect(await q.list()).toHaveLength(2);
    state.failNetwork = false;
    expect(await q.flush()).toBe(2);
    expect(sent.map((s) => s.action)).toEqual(['picked-up', 'out-for-delivery']);
  });

  it('puts a new step behind steps still waiting, so the server sees them in order', async () => {
    const { q, state, sent } = setup({ online: false });
    await q.submit({ orderId: 'o1', action: 'picked-up', fields: {} });
    state.online = true;
    state.failNetwork = true;
    expect(await q.submit({ orderId: 'o1', action: 'out-for-delivery', fields: {} })).toBe('queued');
    state.failNetwork = false;
    await q.flush();
    expect(sent.map((s) => s.action)).toEqual(['picked-up', 'out-for-delivery']);
  });

  it('runs one flush at a time', async () => {
    const { q, state, sent } = setup({ online: false });
    await q.submit({ orderId: 'o1', action: 'picked-up', fields: {} });
    state.online = true;
    const [a, b] = await Promise.all([q.flush(), q.flush()]);
    expect(a + b).toBeGreaterThanOrEqual(1);
    expect(sent).toHaveLength(1);
  });
});
