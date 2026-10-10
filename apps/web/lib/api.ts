'use client';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
const refresh = () =>
  (refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'X-SP-Client': 'web', 'Content-Type': 'application/json' }, body: '{}' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0)));

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown; timeoutMs?: number } = {}, retry = true): Promise<T> {
  const { json, headers, timeoutMs, ...rest } = init;
  const ctrl = timeoutMs ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`/api/v1${path}`, {
      ...rest,
      signal: ctrl?.signal ?? rest.signal,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      headers: { 'X-SP-Client': 'web', ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      credentials: 'include',
    });
    if (res.status === 401 && retry && !path.startsWith('/auth/')) {
      if (await refresh()) return api<T>(path, init, false);
    }
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { code?: string; message?: string; fields?: Record<string, string> };
      throw new ApiError(res.status, b.code ?? 'ERROR', b.message ?? 'Something went wrong. Please try again.', b.fields);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please check your connection and try again.');
