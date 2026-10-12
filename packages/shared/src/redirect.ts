/**
 * Where to send someone after sign-in. Only paths on the same site are allowed; tricks such as "//evil.com",
 * "/\\evil.com" or "https://evil.com" fall back to `fallback`.
 */
export function safeNextPath(next: string | null | undefined, origin: string, fallback = '/account'): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what we refuse
  if (!next || !/^\/(?![\\/])/.test(next) || /[\u0000-\u001f\\]/.test(next)) return fallback;
  try {
    const u = new URL(next, origin);
    return u.origin === new URL(origin).origin ? u.pathname + u.search + u.hash : fallback;
  } catch {
    return fallback;
  }
}
