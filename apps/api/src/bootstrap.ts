import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { ModulesContainer, NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { contextMiddleware } from './common/context.middleware';
import { IS_PUBLIC, REQUIRES, ROLES } from './common/decorators';
import { config } from './config/config';



export async function createApp(opts: { logger?: boolean } = {}): Promise<INestApplication> {
  const c = config();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: opts.logger === false ? false : ['error', 'warn', 'log'],
    rawBody: true, // webhook signatures are computed over the exact bytes
    bodyParser: true,
  });
  app.set('trust proxy', 1);
  app.useBodyParser('json', { limit: '2mb' });
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // media is loaded by the web and admin apps
      contentSecurityPolicy: false, // JSON API; Swagger UI needs inline scripts
    }),
  );
  app.use(cookieParser());
  app.use(contextMiddleware);
  // Browsers send only scheme://host[:port] as the origin, so an ADMIN_URL with a path (…/admin) is reduced to it.
  const toOrigin = (s: string) => {
    try {
      return new URL(s).origin;
    } catch {
      return s;
    }
  };
  const origins = [...new Set((c.CORS_ORIGINS ?? `${c.WEB_URL},${c.ADMIN_URL}`).split(',').map((s) => s.trim()).filter(Boolean).map(toOrigin))];
  app.enableCors({ origin: origins, credentials: true, allowedHeaders: ['Content-Type', 'Authorization', 'X-SP-Client', 'X-Cart-Token', 'Idempotency-Key'] });

  // Public media (local storage driver). In production the CDN serves these.
  app.use(
    '/media',
    express.static(join(c.storageDir, 'public'), {
      maxAge: '365d',
      immutable: true,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
      },
    }),
  );

  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  return app;
}

export function buildOpenApi(app: INestApplication) {
  const doc = new DocumentBuilder()
    .setTitle('Sahyadri Pearls API')
    .setDescription('One API for the website, admin, partner panels and both apps. Money is in integer paise.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const out = cleanupOpenApiDoc(SwaggerModule.createDocument(app, doc));
  // Who may call each route, read from the same decorators the auth guard enforces.
  const access = accessByOperation(app);
  for (const item of Object.values(out.paths)) {
    for (const op of Object.values(item as Record<string, { operationId?: string; description?: string; 'x-access'?: string }>)) {
      const a = op?.operationId ? access.get(op.operationId) : undefined;
      if (!a) continue;
      op['x-access'] = a;
      op.description = op.description ? `${op.description}\n\nAccess: ${a}` : `Access: ${a}`;
    }
  }
  return out;
}

function accessByOperation(app: INestApplication) {
  const reflector = app.get(Reflector);
  const map = new Map<string, string>();
  for (const mod of app.get(ModulesContainer).values()) {
    for (const wrapper of mod.controllers.values()) {
      const ctrl = wrapper.metatype as (new (...a: unknown[]) => unknown) | null;
      if (!ctrl?.prototype) continue;
      for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
        const handler = Object.getOwnPropertyDescriptor(ctrl.prototype, name)?.value as unknown; // never run getters
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const targets = [handler, ctrl];
        const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
        const roles = reflector.getAllAndOverride<string[] | undefined>(ROLES, targets);
        const req = reflector.getAllAndOverride<{ module: string; action: string } | undefined>(REQUIRES, targets);
        const parts = [isPublic ? 'public' : 'signed in', roles?.length ? `roles ${roles.join(', ')}` : '', req ? `permission ${req.module}.${req.action}` : ''].filter(Boolean);
        map.set(`${ctrl.name}_${name}`, parts.join('; '));
      }
    }
  }
  return map;
}
