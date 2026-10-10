import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { SequenceService } from './sequence.service';
import { SettingsService } from './settings.service';

@Global()
@Module({ providers: [AuditService, SequenceService, SettingsService], exports: [AuditService, SequenceService, SettingsService] })
export class CoreModule {}
