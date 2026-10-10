import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './context';

export function contextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
  requestContext.run({ user: null, ip, userAgent: req.headers['user-agent'] ?? null }, () => next());
}
