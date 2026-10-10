import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './common/core.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { config } from './config/config';
import { FEATURE_MODULES } from './modules';
import { MediaModule } from './modules/media/media.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SystemController } from './modules/system/system.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProvidersModule } from './providers/providers.module';
import { JobsModule } from './queue/jobs.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: config().NODE_ENV === 'test' ? 100_000 : 300 }]),
    PrismaModule,
    CoreModule,
    JobsModule,
    ProvidersModule,
    NotificationsModule,
    MediaModule,
    AuthModule,
    ...FEATURE_MODULES,
  ],
  controllers: [SystemController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
