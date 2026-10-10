import { Injectable } from '@nestjs/common';
import type { Prisma } from '@sahyadri/db';
import { PrismaService } from '../prisma/prisma.service';

/** Gap-free counters for human-readable numbers. Call inside the transaction that uses the number. */
@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  async next(key: string, db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<number> {
    const rows = await db.$queryRaw<Array<{ value: number }>>`
      INSERT INTO "Sequence" ("key", "value", "updatedAt") VALUES (${key}, 1, now())
      ON CONFLICT ("key") DO UPDATE SET "value" = "Sequence"."value" + 1, "updatedAt" = now()
      RETURNING "value"`;
    return Number(rows[0]!.value);
  }
}

const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** India's financial year runs April–March: 2026-27. */
export function financialYear(d = new Date()): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function yymm(d = new Date()): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  return `${pad(ist.getUTCFullYear() % 100, 2)}${pad(ist.getUTCMonth() + 1, 2)}`;
}

export const formatOrderNumber = (period: string, n: number) => `SP-${period}-${pad(n, 5)}`;
export const formatInvoiceNumber = (prefix: string, fy: string, n: number) => `${prefix}/${fy}/${pad(n, 5)}`;
export const formatPoNumber = (year: number, n: number) => `PO-${year}-${pad(n, 5)}`;
export const formatEnquiryRef = (yy: string, n: number) => `ENQ-${yy}-${pad(n, 6)}`;
