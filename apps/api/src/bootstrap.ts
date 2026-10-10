import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { contextMiddleware } from './common/context.middleware';
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
  const origins = (c.CORS_ORIGINS ?? `${c.WEB_URL},${c.ADMIN_URL}`).split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: origins, credentials: true, allowedHeaders: ['Content-Type', 'Authorization', 'X-SP-Client', 'Idempotency-Key'] });

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
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, doc));
}
