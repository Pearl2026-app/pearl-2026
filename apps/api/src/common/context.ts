import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@sahyadri/shared';
import type { StaffGrant } from '@sahyadri/shared';

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  email: string | null;
  phone: string | null;
  cityId: string | null;
  vendorId: string | null;
  franchiseId: string | null;
  deliveryPartnerId: string | null;
  customerId: string | null;
  sessionId: string | null;
  grants: StaffGrant[];
}

export interface RequestContext {
  user: AuthUser | null;
  ip: string | null;
  userAgent: string | null;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const currentContext = (): RequestContext => requestContext.getStore() ?? { user: null, ip: null, userAgent: null };
