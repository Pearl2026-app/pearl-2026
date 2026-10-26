import { Controller, Get, HttpCode, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { lookup } from './mime';
import { config } from '../../config/config';
import { runSeedNow } from '../../demo';
import { Public, Roles } from '../../common/decorators';
import { badRequest, notFound } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { signLocal } from '../../providers/storage';
import { STORAGE, type StorageProvider } from '../../providers/types';

const STARTED_AT = new Date().toISOString();

@ApiTags('system')
@Controller()
export class SystemController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  @Public()
  @Get('health')
  health() {
    return { ok: true, startedAt: STARTED_AT, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null };
  }

  /** Demo site only: run the sample-data seed now and return everything it printed (Super Admin). */
  @Post('admin/system/demo-seed')
  @HttpCode(200)
  @Roles('SUPER_ADMIN')
  demoSeed() {
    if (!config().demoMode) throw badRequest('NOT_DEMO', 'The sample-data seed runs only on the demo site.');
    return runSeedNow();
  }

  @Public()
  @Get('ready')
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  }

  /** Local-storage signed URLs for private files (resumes, delivery proofs). */
  @Public()
  @ApiExcludeEndpoint()
  @Get('files/*key')
  async file(@Param('key') keyParts: string | string[], @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    const key = Array.isArray(keyParts) ? keyParts.join('/') : keyParts;
    const expNum = Number(exp);
    const expected = Buffer.from(signLocal(config().appSecret, key, expNum));
    const got = Buffer.from(String(sig ?? ''));
    if (!expNum || expNum < Date.now() / 1000 || expected.length !== got.length || !timingSafeEqual(expected, got)) throw notFound('File');
    const body = await this.storage.get(key, 'private');
    if (!body) throw notFound('File');
    res.setHeader('Content-Type', lookup(key));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${key.split('/').pop()}"`);
    res.send(body);
  }
}
