// Typed API client for the mobile apps. The apps hold tokens (not cookies): an access token on every
// request, and a rotating refresh token used once when the access token expires.

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** Where the app keeps its tokens (SecureStore on the phone, memory in tests). */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string | null): Promise<void>;
}

export interface ClientOptions {
  /** e.g. https://api.example.in/api/v1 */
  baseUrl: string;
  store: KeyValueStore;
  /** Called when the session cannot be refreshed (the app shows its login screen). */
  onSignedOut?: () => void;
  fetch?: typeof fetch;
  /** Sent as X-SP-Client, e.g. "app-customer/1.0.0". Never "web" or "admin" (those use cookies). */
  client: string;
  timeoutMs?: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/** The request never reached the server (no signal, DNS, timeout). Offline queues retry these. */
export class NetworkError extends Error {}

export const isNetworkError = (e: unknown): e is NetworkError => e instanceof NetworkError;
export const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof NetworkError ? 'No connection. Please check your signal and try again.' : 'Something went wrong. Please try again.';

const TOKENS = 'sp.tokens';
const CART = 'sp.cart';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  json?: unknown;
  form?: FormData;
  /** Send without the access token (public endpoints). Default: send it when signed in. */
  anonymous?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
}

export interface Me {
  id: string;
  role: string;
  name: string;
  phone: string | null;
  email: string | null;
  customer?: { id: string; referralCode: string } | null;
  deliveryPartner?: { id: string; name: string } | null;
}

export interface JobStep {
  action: 'picked-up' | 'out-for-delivery' | 'delivered' | 'failed' | 'returned';
  orderId: string;
  clientEventId: string;
  fields: Record<string, string>;
  /** React Native file objects: { uri, name, type } */
  files?: Record<string, { uri: string; name: string; type: string }>;
}

export function createClient(o: ClientOptions) {
  const doFetch = o.fetch ?? fetch;
  let refreshing: Promise<boolean> | null = null;

  const tokens = async (): Promise<Tokens | null> => {
    const raw = await o.store.get(TOKENS);
    try {
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  };
  const saveTokens = (t: Tokens | null) => o.store.set(TOKENS, t ? JSON.stringify({ accessToken: t.accessToken, refreshToken: t.refreshToken }) : null);

  async function raw(path: string, opts: RequestOptions, accessToken?: string | null): Promise<Response> {
    const qs = opts.query
      ? '?' +
        Object.entries(opts.query)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    const headers: Record<string, string> = { 'X-SP-Client': o.client, Accept: 'application/json' };
    if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const cart = await o.store.get(CART);
    if (cart) headers['X-Cart-Token'] = cart;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 20_000);
    try {
      return await doFetch(`${o.baseUrl}${path}${qs === '?' ? '' : qs}`, {
        method: opts.method ?? (opts.json !== undefined || opts.form ? 'POST' : 'GET'),
        headers,
        body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new NetworkError((e as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }

  /** One refresh at a time; a failed refresh signs the app out. */
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      const t = await tokens();
      if (!t) return false;
      const res = await raw('/auth/refresh', { json: { refreshToken: t.refreshToken }, anonymous: true });
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          await saveTokens(null);
          o.onSignedOut?.();
        }
        return false;
      }
      await saveTokens((await res.json()) as Tokens);
      return true;
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    const t = opts.anonymous ? null : await tokens();
    let res = await raw(path, opts, t?.accessToken);
    if (res.status === 401 && t && !path.startsWith('/auth/') && (await refresh())) {
      res = await raw(path, opts, (await tokens())?.accessToken);
    }
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { code?: string; message?: string; fields?: Record<string, string> };
      throw new ApiError(res.status, b.code ?? 'ERROR', b.message ?? `Request failed (${res.status})`, b.fields);
    }
    if (res.status === 204) return undefined as T;
    const type = res.headers.get('content-type') ?? '';
    const body = (type.includes('application/json') ? await res.json() : await res.text()) as T;
    // Cart responses carry the guest cart token; keep it so the cart survives app restarts.
    const cartToken = path.startsWith('/cart') && body && typeof body === 'object' ? (body as { token?: unknown }).token : undefined;
    if (typeof cartToken === 'string') await o.store.set(CART, cartToken);
    return body;
  }

  const signIn = async (issued: Tokens & { user: unknown }) => {
    await saveTokens(issued);
    return issued.user as Me;
  };

  return {
    request,
    get: <T = unknown>(path: string, query?: RequestOptions['query']) => request<T>(path, { query }),
    post: <T = unknown>(path: string, json: unknown = {}) => request<T>(path, { method: 'POST', json }),
    patch: <T = unknown>(path: string, json: unknown) => request<T>(path, { method: 'PATCH', json }),
    del: <T = unknown>(path: string) => request<T>(path, { method: 'DELETE' }),
    upload: <T = unknown>(path: string, form: FormData) => request<T>(path, { method: 'POST', form }),
    isSignedIn: async () => !!(await tokens()),

    auth: {
      requestCustomerOtp: (phone: string) => request<{ challengeId: string; expiresAt: string }>('/auth/otp/request', { json: { phone }, anonymous: true }),
      verifyCustomerOtp: async (challengeId: string, code: string, extra: { name?: string; referralCode?: string } = {}) =>
        signIn(await request<Tokens & { user: Me }>('/auth/otp/verify', { json: { challengeId, code, ...extra }, anonymous: true })),
      requestPartnerOtp: (identifier: string) => request<{ challengeId: string; expiresAt: string }>('/auth/partner/otp/request', { json: { identifier }, anonymous: true }),
      verifyPartnerOtp: async (challengeId: string, code: string) => signIn(await request<Tokens & { user: Me }>('/auth/partner/otp/verify', { json: { challengeId, code }, anonymous: true })),
      me: () => request<Me>('/me'),
      registerDevice: (token: string, platform: 'ANDROID' | 'IOS', appKind: 'customer' | 'delivery') => request('/auth/device-token', { json: { token, platform, appKind } }),
      signOut: async () => {
        await request('/auth/logout', { json: {} }).catch(() => undefined);
        await saveTokens(null);
      },
    },

    delivery: {
      jobs: <T = unknown>(view: 'active' | 'done' = 'active') => request<T>('/delivery/jobs', { query: { view } }),
      job: <T = unknown>(orderId: string) => request<T>(`/delivery/jobs/${orderId}`),
      resendCode: (orderId: string) => request(`/delivery/jobs/${orderId}/otp`, { json: {} }),
      /** Every step carries its client event id, so a replay from the offline queue is applied once. */
      step: <T = unknown>(s: JobStep) => {
        if (s.files && Object.keys(s.files).length) {
          const fd = new FormData();
          for (const [k, v] of Object.entries(s.fields)) fd.append(k, v);
          fd.append('clientEventId', s.clientEventId);
          // React Native accepts { uri, name, type } in place of a Blob.
          for (const [k, f] of Object.entries(s.files)) fd.append(k, f as unknown as Blob);
          return request<T>(`/delivery/jobs/${s.orderId}/${s.action}`, { method: 'POST', form: fd });
        }
        return request<T>(`/delivery/jobs/${s.orderId}/${s.action}`, { json: { ...s.fields, clientEventId: s.clientEventId } });
      },
    },
  };
}

export type ApiClient = ReturnType<typeof createClient>;

/** In-memory store for tests and previews. */
export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => {
      if (v === null) m.delete(k);
      else m.set(k, v);
    },
  };
}
