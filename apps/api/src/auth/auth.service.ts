import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { verifyPassword } from '@sahyadri/db';
import { PASSWORD_ROLES, permissionSet, type Role } from '@sahyadri/shared';
import { pointsBalancePaise } from '../modules/orders/loyalty';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { badRequest, forbidden } from '../common/errors';
import { requestContext } from '../common/context';
import { maskDestination, OtpService } from './otp.service';
import { TokensService } from './tokens.service';
import { toAuthUser } from './user-loader.service';

const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newReferralCode(name?: string | null): string {
  const prefix = (name ?? '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);
  let s = prefix;
  while (s.length < 8) s += REFERRAL_ALPHABET[randomInt(REFERRAL_ALPHABET.length)];
  return s;
}

const PARTNER_ROLES: Role[] = ['VENDOR', 'FRANCHISE', 'DELIVERY_PARTNER'];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
  ) {}

  private meta() {
    const s = requestContext.getStore();
    return { ip: s?.ip ?? null, userAgent: s?.userAgent ?? null };
  }

  // ── Customers: phone + OTP (sign up and log in are one flow) ──
  async requestCustomerOtp(phone: string) {
    // The answer is the same for every number (new, existing or a team member's), so it reveals nothing.
    // A team or partner number gets a real but unsent challenge; they sign in through the partner login.
    const existing = await this.prisma.user.findUnique({ where: { phone }, select: { role: true } });
    const isCustomerOrNew = !existing || existing.role === 'CUSTOMER';
    const { challengeId, expiresAt } = await this.otp.issue({ destination: phone, channel: 'SMS', purpose: 'CUSTOMER_LOGIN', send: isCustomerOrNew });
    return { challengeId, expiresAt, sentTo: maskDestination(phone) };
  }

  async verifyCustomerOtp(input: { challengeId: string; code: string; name?: string; email?: string; referralCode?: string }) {
    const { destination: phone } = await this.otp.verify(input.challengeId, input.code, 'CUSTOMER_LOGIN');
    let user = await this.prisma.user.findUnique({ where: { phone }, include: { customer: true, permissions: true } });
    if (user && user.role !== 'CUSTOMER') throw badRequest('USE_PARTNER_LOGIN', 'Please use the partner login.');
    if (user?.customer?.isBlocked || (user && !user.isActive)) throw forbidden('This account is blocked. Please contact us.');

    if (!user) {
      const referrer = input.referralCode
        ? await this.prisma.customer.findUnique({ where: { referralCode: input.referralCode.trim().toUpperCase() } })
        : null;
      const emailTaken = input.email ? await this.prisma.user.findUnique({ where: { email: input.email } }) : null;
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            role: 'CUSTOMER',
            name: input.name?.trim() || 'Customer',
            phone,
            email: emailTaken ? null : (input.email ?? null),
            customer: { create: { referralCode: await this.uniqueReferralCode(input.name), referredById: referrer?.id ?? null } },
          },
          include: { customer: true, permissions: true },
        });
        if (referrer && created.customer) {
          await tx.referral.create({ data: { referrerId: referrer.id, refereeId: created.customer.id } });
        }
        return created;
      });
    } else if (!user.customer) {
      // A guest checkout created the user without a customer record, or data was imported.
      await this.prisma.customer.create({ data: { userId: user.id, referralCode: await this.uniqueReferralCode(user.name) } });
      user = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { customer: true, permissions: true } });
    } else if (input.name && user.name === 'Customer') {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { name: input.name.trim() }, include: { customer: true, permissions: true } });
    }
    return this.issue(user);
  }

  async uniqueReferralCode(name?: string | null): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = newReferralCode(name);
      if (!(await this.prisma.customer.findUnique({ where: { referralCode: code } }))) return code;
    }
    return newReferralCode(null) + String(randomInt(10, 99));
  }

  // ── Partners: email or phone + OTP ──
  async requestPartnerOtp(identifier: string) {
    const isEmail = identifier.includes('@');
    const user = await this.prisma.user.findFirst({
      where: { ...(isEmail ? { email: identifier.toLowerCase() } : { phone: identifier }), role: { in: PARTNER_ROLES }, isActive: true },
    });
    if (!user) {
      // Unknown account: a real challenge that is never sent and cannot unlock anything (no user behind
      // it), with the same rate limit, so the response looks exactly like a real one.
      const decoy = await this.otp.issue({ destination: isEmail ? identifier.toLowerCase() : identifier, channel: isEmail ? 'EMAIL' : 'SMS', purpose: 'PARTNER_LOGIN', subjectKey: 'none', send: false });
      return { challengeId: decoy.challengeId, expiresAt: decoy.expiresAt, sentTo: maskDestination(identifier) };
    }
    const { challengeId, expiresAt } = await this.otp.issue({
      destination: identifier,
      channel: isEmail ? 'EMAIL' : 'SMS',
      purpose: 'PARTNER_LOGIN',
      subjectKey: user.id,
    });
    return { challengeId, expiresAt, sentTo: maskDestination(identifier) };
  }

  async verifyPartnerOtp(challengeId: string, code: string) {
    const { subjectKey } = await this.otp.verify(challengeId, code, 'PARTNER_LOGIN');
    const user = await this.prisma.user.findUnique({ where: { id: subjectKey ?? '' }, include: { permissions: true, customer: true } });
    if (!user || !user.isActive || !PARTNER_ROLES.includes(user.role)) throw badRequest('OTP_INVALID', 'Sign-in failed.');
    return this.issue(user);
  }

  // ── Staff: email + password, then OTP ──
  async staffLogin(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Always run the hash check so timing does not reveal whether the email exists.
    const ok = await verifyPassword(password, user?.passwordHash ?? 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
    if (!user || !ok || !user.isActive || !PASSWORD_ROLES.includes(user.role)) {
      await this.audit.record('User', user?.id ?? null, 'LOGIN_FAILED', undefined, { email });
      throw badRequest('LOGIN_FAILED', 'Email or password is incorrect.');
    }
    // OTP by SMS when a phone is on file, otherwise by email (the SPEC fallback for staff).
    const destination = user.phone ?? user.email!;
    const { challengeId, expiresAt } = await this.otp.issue({
      destination,
      channel: user.phone ? 'SMS' : 'EMAIL',
      purpose: 'STAFF_LOGIN',
      subjectKey: user.id,
    });
    return { challengeId, expiresAt, sentTo: maskDestination(destination), channel: user.phone ? 'SMS' : 'EMAIL' };
  }

  /** Staff can ask for the code by email instead (when SMS is not available). */
  async staffOtpByEmail(challengeId: string) {
    const ch = await this.prisma.otpChallenge.findUnique({ where: { id: challengeId } });
    if (!ch || !ch.purpose.startsWith('STAFF_LOGIN:') || ch.consumedAt) throw badRequest('OTP_INVALID', 'Start sign-in again.');
    const userId = ch.purpose.slice('STAFF_LOGIN:'.length);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) throw badRequest('NO_EMAIL', 'No email address on this account.');
    await this.prisma.otpChallenge.update({ where: { id: ch.id }, data: { consumedAt: new Date() } });
    const r = await this.otp.issue({ destination: user.email, channel: 'EMAIL', purpose: 'STAFF_LOGIN', subjectKey: user.id });
    return { challengeId: r.challengeId, expiresAt: r.expiresAt, sentTo: maskDestination(user.email), channel: 'EMAIL' };
  }

  async staffVerify(challengeId: string, code: string) {
    const { subjectKey } = await this.otp.verify(challengeId, code, 'STAFF_LOGIN');
    const user = await this.prisma.user.findUnique({ where: { id: subjectKey ?? '' }, include: { permissions: true, customer: true } });
    if (!user || !user.isActive || !PASSWORD_ROLES.includes(user.role)) throw badRequest('OTP_INVALID', 'Sign-in failed.');
    return this.issue(user);
  }

  private async issue(user: Parameters<typeof toAuthUser>[0] & { id: string; role: Role }) {
    const tokens = await this.tokens.createSession(user, this.meta());
    const authUser = toAuthUser(user, tokens.sessionId);
    const store = requestContext.getStore();
    if (store) store.user = authUser;
    if (user.role !== 'CUSTOMER') await this.audit.record('User', user.id, 'LOGIN');
    return { ...tokens, user: await this.me(authUser.id) };
  }

  async refresh(refreshToken: string) {
    const t = await this.tokens.rotate(refreshToken, this.meta());
    return { accessToken: t.accessToken, refreshToken: t.refreshToken, sessionId: t.sessionId, user: await this.me(t.user.id) };
  }

  async me(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        permissions: true,
        city: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
        franchise: { select: { id: true, name: true, area: true } },
        deliveryPartner: { select: { id: true, name: true } },
        manufacturer: { select: { id: true, name: true } },
        farm: { select: { id: true, name: true } },
        customer: { select: { id: true, referralCode: true, cityId: true, preferredPaymentMethod: true, b2bStatus: true, businessName: true } },
      },
    });
    const au = toAuthUser(u, null);
    const pointsPaise = u.customer ? await pointsBalancePaise(this.prisma, u.customer.id) : 0;
    return {
      id: u.id,
      role: u.role,
      name: u.name,
      email: u.email,
      phone: u.phone,
      state: u.state,
      city: u.city,
      vendor: u.vendor,
      franchise: u.franchise,
      deliveryPartner: u.deliveryPartner,
      customer: u.customer ? { ...u.customer, pointsPaise } : null,
      permissions: permissionSet({ role: au.role, staffGrants: au.grants }),
    };
  }
}
