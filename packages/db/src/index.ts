import { Prisma, PrismaClient } from '@prisma/client';

export * from '@prisma/client';

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Prisma.TransactionClient;

export function createPrismaClient(url = process.env.DATABASE_URL): PrismaClient {
  return new PrismaClient({ datasources: url ? { db: { url } } : undefined });
}
export { hashPassword, verifyPassword } from './password';
