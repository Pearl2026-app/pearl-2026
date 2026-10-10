import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@sahyadri/db';
import { createApp } from '../src/bootstrap';
import { outbox } from '../src/providers/messaging';
import { JobsService } from '../src/queue/jobs.service';

export const PASSWORD = 'Sahyadri@2026';
export const LOGINS = {
  superAdmin: 'admin@sahyadripearls.test',
  staff: 'staff@sahyadripearls.test',
  puneManager: 'pune.manager@sahyadripearls.test',
  mumbaiManager: 'mumbai.manager@sahyadripearls.test',
  vendor: 'vendor@sahyadripearls.test',
  vendor2: 'vendor2@sahyadripearls.test',
  franchisePune: 'franchise.pune@sahyadripearls.test',
  franchiseMumbai: 'franchise.mumbai@sahyadripearls.test',
  deliveryPune: '+919800000005',
  deliveryMumbai: '+919800000015',
  customerAsha: '+919800000007',
  customerKaran: '+919800000017',
} as const;

let app: INestApplication | null = null;
export const db: PrismaClient = new PrismaClient();

export async function getApp(): Promise<INestApplication> {
  if (!app) {
    app = await createApp({ logger: false });
    await app.init();
    // Listen once so concurrent supertest requests share one server.
    await app.listen(0, '127.0.0.1');
  }
  return app;
}

export function http() {
  if (!app) throw new Error('call getApp() first');
  return request(app.getHttpServer());
}

export const api = (path: string) => `/api/v1${path}`;

export function lastCode(to: string): string {
  const m = [...outbox].reverse().find((o) => o.to === to && /\b\d{6}\b/.test(o.body));
  if (!m) throw new Error(`No code sent to ${to}`);
  return m.body.match(/\b(\d{6})\b/)![1]!;
}

export async function drain() {
  await app!.get(JobsService).drain();
}

const tokenCache = new Map<string, string>();

export async function staffToken(email: string, password = PASSWORD): Promise<string> {
  const key = `staff:${email}`;
  if (tokenCache.has(key)) return tokenCache.get(key)!;
  const login = await http().post(api('/auth/staff/login')).send({ email, password }).expect(200);
  await drain();
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const code = lastCode(user.phone ?? email);
  const res = await http().post(api('/auth/staff/verify')).send({ challengeId: login.body.challengeId, code }).expect(200);
  tokenCache.set(key, res.body.accessToken);
  return res.body.accessToken;
}

export async function partnerToken(identifier: string): Promise<string> {
  const key = `partner:${identifier}`;
  if (tokenCache.has(key)) return tokenCache.get(key)!;
  const r = await http().post(api('/auth/partner/otp/request')).send({ identifier }).expect(200);
  await drain();
  const res = await http().post(api('/auth/partner/otp/verify')).send({ challengeId: r.body.challengeId, code: lastCode(identifier) }).expect(200);
  tokenCache.set(key, res.body.accessToken);
  return res.body.accessToken;
}

export async function customerToken(phone: string, extra: Record<string, string> = {}): Promise<string> {
  const key = `customer:${phone}`;
  if (tokenCache.has(key)) return tokenCache.get(key)!;
  const r = await http().post(api('/auth/otp/request')).send({ phone }).expect(200);
  await drain();
  const res = await http().post(api('/auth/otp/verify')).send({ challengeId: r.body.challengeId, code: lastCode(phone), ...extra }).expect(200);
  tokenCache.set(key, res.body.accessToken);
  return res.body.accessToken;
}

export function clearTokens() {
  tokenCache.clear();
}

export type Who = keyof typeof LOGINS;
export async function tokenFor(who: Who): Promise<string> {
  const id = LOGINS[who];
  if (who === 'superAdmin' || who === 'staff' || who === 'puneManager' || who === 'mumbaiManager') return staffToken(id);
  if (who === 'customerAsha' || who === 'customerKaran') return customerToken(id);
  return partnerToken(id);
}

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

/** A client that keeps cookies (guest cart). */
export function agent() {
  if (!app) throw new Error('call getApp() first');
  return request.agent(app.getHttpServer());
}

export const ADDRESS = {
  name: 'Asha Patil',
  phone: '9800000007',
  line1: '12 Prabhat Road',
  area: 'Erandwane',
  cityName: 'Pune',
  state: 'Maharashtra',
  pincode: '411004',
};
