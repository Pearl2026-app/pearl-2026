import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { can, type Action, type Module, type Role } from '@sahyadri/shared';
import { currentContext } from '../common/context';
import { IS_PUBLIC, REQUIRES, ROLES } from '../common/decorators';
import { forbidden } from '../common/errors';
import { ACCESS_COOKIE, TokensService } from './tokens.service';
import { UserLoader } from './user-loader.service';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard: authenticates (Bearer header or httpOnly cookie), then checks @Roles and @Requires.
 * Cookie-authenticated writes must carry the X-SP-Client header (a simple CSRF defence: other sites
 * cannot add custom headers without a CORS preflight, which the API refuses).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly users: UserLoader,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);

    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[ACCESS_COOKIE] ?? null;
    const token = bearer ?? cookie;

    let user = null;
    if (token) {
      const claims = this.tokens.verifyAccess(token);
      if (claims) user = await this.users.load(claims.sub, claims.sid);
    }
    if (user && !bearer && cookie && !SAFE.has(req.method) && !req.headers['x-sp-client']) {
      throw forbidden('Missing client header');
    }
    req.user = user;
    const store = currentContext();
    store.user = user;

    if (!user) {
      if (isPublic) return true;
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Please sign in.' });
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (roles && !roles.includes(user.role)) throw forbidden();

    const req2 = this.reflector.getAllAndOverride<{ module: Module; action: Action } | undefined>(REQUIRES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (req2 && !can({ role: user.role, staffGrants: user.grants }, req2.module, req2.action)) throw forbidden();
    return true;
  }
}
