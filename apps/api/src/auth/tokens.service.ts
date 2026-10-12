import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { config } from '../config/config';
import { PrismaService } from '../prisma/prisma.service';
import { badRequest } from '../common/errors';
import type { Prisma } from '@sahyadri/db';

export interface AccessClaims {
  sub: string;
  sid: string;
  role: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export const ACCESS_COOKIE = 'sp_at';
export const REFRESH_COOKIE = 'sp_rt';
/** Readable by scripts and holds no secret: only tells the browser a session may exist, so guests skip /me and refresh calls. */
export const SESSION_HINT_COOKIE = 'sp_s';

@Injectable()
export class TokensService {
  constructor(private readonly prisma: PrismaService) {}

  signAccess(claims: AccessClaims): string {
    return jwt.sign(claims, config().JWT_ACCESS_SECRET, {
      expiresIn: config().JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
      issuer: 'sahyadri-api',
    });
  }

  verifyAccess(token: string): AccessClaims | null {
    try {
      return jwt.verify(token, config().JWT_ACCESS_SECRET, { issuer: 'sahyadri-api' }) as AccessClaims;
    } catch {
      return null;
    }
  }

  async createSession(user: { id: string; role: string }, meta: { ip?: string | null; userAgent?: string | null }, db: Prisma.TransactionClient = this.prisma) {
    const refreshToken = randomBytes(32).toString('base64url');
    const session = await db.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: sha256(refreshToken),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        expiresAt: new Date(Date.now() + config().JWT_REFRESH_TTL_DAYS * 86400_000),
      },
    });
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { accessToken: this.signAccess({ sub: user.id, sid: session.id, role: user.role }), refreshToken, sessionId: session.id };
  }

  /** Rotate a refresh token. Re-use of an already-rotated token revokes every session of that user. */
  async rotate(refreshToken: string, meta: { ip?: string | null; userAgent?: string | null }) {
    const s = await this.prisma.authSession.findUnique({ where: { refreshTokenHash: sha256(refreshToken) }, include: { user: true } });
    const invalid = () => badRequest('REFRESH_INVALID', 'Your session has ended. Please sign in again.');
    if (!s) throw invalid();
    if (s.revokedAt) {
      await this.revokeAll(s.userId);
      throw invalid();
    }
    if (s.expiresAt < new Date() || !s.user.isActive) throw invalid();
    // Rotation and reuse-revocation hold the same per-user lock, so a racing request that loses always
    // runs after the winner's new session is saved, and its "revoke everything" catches that session too.
    const next = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, s.userId);
      const rotated = await tx.authSession.updateMany({ where: { id: s.id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (rotated.count !== 1) {
        await tx.authSession.updateMany({ where: { userId: s.userId, revokedAt: null }, data: { revokedAt: new Date() } });
        return null;
      }
      return this.createSession(s.user, meta, tx);
    });
    if (!next) throw invalid();
    return { ...next, user: s.user };
  }

  private lockUser(tx: Prisma.TransactionClient, userId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'session:' + userId}))`;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
  }

  setCookies(res: Response, tokens: { accessToken: string; refreshToken: string }): void {
    const c = config();
    const base = { httpOnly: true, secure: c.cookieSecure, sameSite: 'lax' as const, domain: c.COOKIE_DOMAIN };
    res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base, path: '/', maxAge: 15 * 60_000 });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...base, path: '/api/v1/auth', maxAge: c.JWT_REFRESH_TTL_DAYS * 86400_000 });
    res.cookie(SESSION_HINT_COOKIE, '1', { ...base, httpOnly: false, path: '/', maxAge: c.JWT_REFRESH_TTL_DAYS * 86400_000 });
  }

  clearCookies(res: Response): void {
    const c = config();
    res.clearCookie(ACCESS_COOKIE, { path: '/', domain: c.COOKIE_DOMAIN });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth', domain: c.COOKIE_DOMAIN });
    res.clearCookie(SESSION_HINT_COOKIE, { path: '/', domain: c.COOKIE_DOMAIN });
  }
}
