'use client';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { api, qs, type Page } from './api';

/** List state lives in the URL, so filters survive reloads and can be shared. */
export function useListParams(defaults: Record<string, string> = {}) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const params = useMemo(() => {
    const p: Record<string, string> = { page: '1', pageSize: '25', ...defaults };
    sp.forEach((v, k) => (p[k] = v));
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);
  const set = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = { ...params, ...patch };
      if (!('page' in patch)) next.page = '1';
      router.replace(`${pathname}${qs(next)}`, { scroll: false });
    },
    [params, pathname, router],
  );
  return { params, set };
}

export function useList<T>(path: string, params: Record<string, string>) {
  return useQuery({
    queryKey: [path, params],
    queryFn: () => api<Page<T>>(`${path}${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}
