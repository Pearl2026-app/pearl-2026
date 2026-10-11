'use client';
import { adminPath, currentAdminPath } from './base-path';
// Thin client for the API (proxied at /api/v1 by next.config). Cookies carry the session.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'X-SP-Client': 'admin', 'Content-Type': 'application/json' }, body: '{}' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<T> {
  const { json, headers, ...rest } = init;
  const isForm = typeof FormData !== 'undefined' && rest.body instanceof FormData;
  const res = await fetch(`/api/v1${path}`, {
    ...rest,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    headers: { 'X-SP-Client': 'admin', ...(json !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}), ...headers },
    credentials: 'include',
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    // sp_s is a script-readable hint (no secret) that a session may exist; without it there is nothing to refresh.
    const mayHaveSession = typeof document !== 'undefined' && /(?:^|; )sp_s=1/.test(document.cookie);
    if (mayHaveSession && (await refresh())) return api<T>(path, init, false);
    if (typeof window !== 'undefined' && !currentAdminPath().startsWith('/login')) {
      window.location.href = adminPath(`/login?next=${encodeURIComponent(currentAdminPath())}`);
    }
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string; fields?: Record<string, string> };
    throw new ApiError(res.status, body.code ?? 'ERROR', body.message ?? `Request failed (${res.status})`, body.fields);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? res.json() : res.text()) as Promise<T>;
}

export const qs = (params: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong');
