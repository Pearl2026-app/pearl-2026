import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, db, drain, getApp, http, lastCode, LOGINS, PASSWORD, staffToken } from './helpers';

beforeAll(async () => {
  await getApp();
});
afterAll(async () => {
  await db.$disconnect();
});

describe('staff login (email + password + OTP)', () => {
  it('rejects a wrong password with a generic message', async () => {
    const r = await http().post(api('/auth/staff/login')).send({ email: LOGINS.superAdmin, password: 'wrong-password' }).expect(400);
    expect(r.body.code).toBe('LOGIN_FAILED');
  });

  it('does not let partner roles use the password login', async () => {
    await http().post(api('/auth/staff/login')).send({ email: LOGINS.vendor, password: PASSWORD }).expect(400);
  });

  it('signs in with password then OTP, and /me returns permissions', async () => {
    const t = await staffToken(LOGINS.superAdmin);
    const me = await http().get(api('/me')).set(bearer(t)).expect(200);
    expect(me.body.role).toBe('SUPER_ADMIN');
    expect(me.body.permissions.SETTINGS).toContain('edit');
  });

  it('limits how many codes one number may request in the window', async () => {
    const phone = '+919844400001';
    const limit = Number(process.env.OTP_MAX_PER_WINDOW);
    for (let i = 0; i < limit; i++) await http().post(api('/auth/otp/request')).send({ phone }).expect(200);
    const r = await http().post(api('/auth/otp/request')).send({ phone }).expect(429);
    expect(r.body.code).toBe('OTP_RATE_LIMIT');
  });

  it('locks a code after too many wrong attempts and never accepts it twice', async () => {
    const login = await http().post(api('/auth/staff/login')).send({ email: LOGINS.staff, password: PASSWORD }).expect(200);
    await drain();
    const code = lastCode('+919800000002');
    for (let i = 0; i < 5; i++) await http().post(api('/auth/staff/verify')).send({ challengeId: login.body.challengeId, code: code === '000000' ? '111111' : '000000' }).expect(400);
    const r = await http().post(api('/auth/staff/verify')).send({ challengeId: login.body.challengeId, code }).expect(400);
    expect(r.body.code).toBe('OTP_LOCKED');
  });

  it('can switch the staff code to email', async () => {
    const login = await http().post(api('/auth/staff/login')).send({ email: LOGINS.puneManager, password: PASSWORD }).expect(200);
    const sw = await http().post(api('/auth/staff/otp/email')).send({ challengeId: login.body.challengeId }).expect(200);
    expect(sw.body.channel).toBe('EMAIL');
    await drain();
    const ok = await http().post(api('/auth/staff/verify')).send({ challengeId: sw.body.challengeId, code: lastCode(LOGINS.puneManager) }).expect(200);
    expect(ok.body.user.role).toBe('CITY_MANAGER');
  });
});

describe('customer login (phone + OTP)', () => {
  it('creates a new customer with a referral link on first login', async () => {
    const phone = '+919811111111';
    const r = await http().post(api('/auth/otp/request')).send({ phone: '98111 11111' }).expect(200);
    expect(r.body.isNewCustomer).toBe(true);
    await drain();
    const v = await http()
      .post(api('/auth/otp/verify'))
      .send({ challengeId: r.body.challengeId, code: lastCode(phone), name: 'New Buyer', referralCode: 'ASHA7K2P' })
      .expect(200);
    expect(v.body.user.customer.referralCode).toMatch(/^[A-Z0-9]{8,10}$/);
    const ref = await db.referral.findFirst({ where: { referee: { user: { phone } } }, include: { referrer: true } });
    expect(ref?.referrer.referralCode).toBe('ASHA7K2P');
  });

  it('refuses staff phone numbers on the customer login', async () => {
    const r = await http().post(api('/auth/otp/request')).send({ phone: '+919800000001' }).expect(400);
    expect(r.body.code).toBe('USE_PARTNER_LOGIN');
  });

  it('does not reveal whether a partner account exists', async () => {
    const r = await http().post(api('/auth/partner/otp/request')).send({ identifier: 'nobody@example.com' }).expect(200);
    expect(r.body.challengeId).toBeTruthy();
    await http().post(api('/auth/partner/otp/verify')).send({ challengeId: r.body.challengeId, code: '123456' }).expect(400);
  });
});

describe('sessions', () => {
  it('rotates refresh tokens and revokes everything on reuse', async () => {
    const r = await http().post(api('/auth/otp/request')).send({ phone: '+919822222222' }).expect(200);
    await drain();
    const v = await http().post(api('/auth/otp/verify')).send({ challengeId: r.body.challengeId, code: lastCode('+919822222222') }).expect(200);
    const first = v.body.refreshToken;
    const r2 = await http().post(api('/auth/refresh')).send({ refreshToken: first }).expect(200);
    await http().post(api('/auth/refresh')).send({ refreshToken: first }).expect(400); // reuse
    await http().post(api('/auth/refresh')).send({ refreshToken: r2.body.refreshToken }).expect(400); // family revoked
    await http().get(api('/me')).set(bearer(r2.body.accessToken)).expect(401);
  });

  it('sets httpOnly cookies for the web client and requires the client header on cookie writes', async () => {
    const r = await http().post(api('/auth/otp/request')).send({ phone: '+919833333333' }).expect(200);
    await drain();
    const v = await http()
      .post(api('/auth/otp/verify'))
      .set('X-SP-Client', 'web')
      .send({ challengeId: r.body.challengeId, code: lastCode('+919833333333') })
      .expect(200);
    expect(v.body.accessToken).toBeUndefined();
    const cookies = ([] as string[]).concat(v.headers['set-cookie'] ?? []);
    expect(cookies.join(';')).toMatch(/sp_at=.*HttpOnly/i);
    const at = cookies.find((c) => c.startsWith('sp_at='))!.split(';')[0];
    await http().get(api('/me')).set('Cookie', at!).expect(200);
    await http().post(api('/auth/device-token')).set('Cookie', at!).send({ token: 'x'.repeat(20), platform: 'WEB', appKind: 'customer' }).expect(403);
    await http().post(api('/auth/device-token')).set('Cookie', at!).set('X-SP-Client', 'web').send({ token: 'x'.repeat(20), platform: 'WEB', appKind: 'customer' }).expect(200);
    // The script-readable hint holds no token, and a dead refresh clears every session cookie.
    const hint = cookies.find((c) => c.startsWith('sp_s='))!;
    expect(hint).toMatch(/^sp_s=1;/);
    expect(hint).not.toMatch(/HttpOnly/i);
    const dead = await http().post(api('/auth/refresh')).set('X-SP-Client', 'web').set('Cookie', 'sp_rt=not-a-token').send({}).expect(400);
    const cleared = ([] as string[]).concat(dead.headers['set-cookie'] ?? []).join(';');
    expect(cleared).toMatch(/sp_s=;/);
    expect(cleared).toMatch(/sp_rt=;/);
  });
});
