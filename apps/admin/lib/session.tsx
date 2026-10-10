'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { can, type Action, type Module, type Role } from '@sahyadri/shared';
import { api } from './api';

export interface Me {
  id: string;
  role: Role;
  name: string;
  email: string | null;
  phone: string | null;
  city: { id: string; name: string } | null;
  vendor: { id: string; name: string } | null;
  franchise: { id: string; name: string; area: string } | null;
  deliveryPartner: { id: string; name: string } | null;
  permissions: Partial<Record<Module, Action[]>>;
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me'), staleTime: 60_000, retry: false });
}

export function useCan() {
  const { data } = useMe();
  return (module: Module, action: Action = 'view') => !!data?.permissions?.[module]?.includes(action);
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    qc.clear();
    window.location.href = '/login';
  };
}

export { can };
