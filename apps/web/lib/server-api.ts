import 'server-only';
import { cookies } from 'next/headers';

/**
 * Where server components reach the API. On Vercel, API_INTERNAL_URL is injected by the `api` service binding
 * (root vercel.json) and is only available at request time, so it is read per call, never at module load.
 */
const apiBase = () => (process.env.API_INTERNAL_URL ?? process.env.API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

/**
 * Pages render per request (so builds never need a running API), and public API responses are cached in
 * memory for `revalidate` seconds with stale-while-revalidate, so pages stay fast.
 */
type Entry = { value: unknown; exp: number; refreshing?: Promise<unknown> };
const cache = new Map<string, Entry>();
const MAX = 500;

async function fetchJson<T>(path: string, headers: Record<string, string> = {}): Promise<T | null> {
  const res = await fetch(`${apiBase()}/api/v1${path}`, { headers, cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function get<T>(path: string, opts: { revalidate?: number; auth?: boolean } = {}): Promise<T | null> {
  if (opts.auth) {
    const at = (await cookies()).get('sp_at')?.value;
    return fetchJson<T>(path, at ? { Authorization: `Bearer ${at}` } : {});
  }
  const ttl = (opts.revalidate ?? 60) * 1000;
  const hit = cache.get(path);
  const now = Date.now();
  if (hit && hit.exp > now) return hit.value as T;
  if (hit) {
    // Stale: answer at once and refresh in the background.
    hit.refreshing ??= fetchJson<T>(path)
      .then((v) => cache.set(path, { value: v, exp: Date.now() + ttl }))
      .catch(() => (hit.refreshing = undefined));
    return hit.value as T;
  }
  const value = await fetchJson<T>(path);
  if (cache.size >= MAX) cache.delete(cache.keys().next().value!);
  cache.set(path, { value, exp: now + ttl });
  return value;
}

export async function cityFromCookie(): Promise<string | undefined> {
  return (await cookies()).get('sp_city')?.value || undefined;
}
