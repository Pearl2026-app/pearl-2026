import { Logger } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { buildOpenApi, createApp } from './bootstrap';
import { config } from './config/config';
import { migrateDemoDatabase, prepareDemo } from './demo';
import { JobsService } from './queue/jobs.service';

async function main() {
  const c = config();
  // Demo site (D66): the database gets its tables on start, so no separate migration step is needed.
  if (c.demoMode) migrateDemoDatabase();
  const app = await createApp();
  // The API reference lists every endpoint, so it is served only outside production.
  const docs = c.NODE_ENV !== 'production';
  if (docs) SwaggerModule.setup('api/docs', app, buildOpenApi(app), { jsonDocumentUrl: 'api/docs/openapi.json' });
  await app.init(); // modules register their job handlers and schedules during init
  if (c.RUN_WORKERS) await app.get(JobsService).startWorker();
  await app.listen(c.PORT, '0.0.0.0');
  Logger.log(`API listening on ${c.API_URL}${docs ? ' (docs at /api/docs)' : ''}`, 'Bootstrap');
  if (c.demoMode) {
    Logger.warn('DEMO MODE: sample data, sign-in code 123456, payment sandbox. Not for real customers.', 'Bootstrap');
    void prepareDemo();
  }
}

void main();
