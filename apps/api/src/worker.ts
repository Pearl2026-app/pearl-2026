import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JobsService } from './queue/jobs.service';

/** Runs only the background workers (scale separately from the HTTP API). */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  await app.get(JobsService).startWorker();
  Logger.log('Worker running', 'Worker');
}

void main();
