import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@sahyadri/db';
import { PrismaService } from '../prisma/prisma.service';
import { currentContext } from './context';

const SECRET_KEYS = /password|token|secret|codeHash|refreshTokenHash/i;

/** Remove secrets and make values JSON-safe before they go into the audit log. */
export function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(
    JSON.stringify(value, (k, v) => (SECRET_KEYS.test(k) ? '[redacted]' : typeof v === 'bigint' ? v.toString() : v)),
  );
}

@Injectable()
export class AuditService {
  private readonly log = new Logger('Audit');
  constructor(private readonly prisma: PrismaService) {}

  /** Rule 6: record who changed what, before and after, when and from where. Append-only. */
  async record(
    entity: string,
    entityId: string | null,
    action: string,
    before?: unknown,
    after?: unknown,
    db: Pick<PrismaService, 'auditLog'> | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const { user, ip, userAgent } = currentContext();
    try {
      await db.auditLog.create({
        data: {
          actorId: user?.id ?? null,
          actorRole: user?.role ?? null,
          action,
          entity,
          entityId,
          before: sanitize(before),
          after: sanitize(after),
          ip,
          userAgent: userAgent?.slice(0, 300) ?? null,
        },
      });
    } catch (e) {
      // Inside a transaction the error must propagate so the change rolls back with it.
      if (db !== this.prisma) throw e;
      this.log.error(`Failed to write audit log for ${entity}/${entityId}: ${(e as Error).message}`);
      throw e;
    }
  }
}
