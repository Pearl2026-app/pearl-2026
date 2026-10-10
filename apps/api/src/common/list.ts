import { z } from 'zod';
import { listQuery, type Paginated } from '@sahyadri/shared';

export { listQuery };
export type ListArgs = z.infer<typeof listQuery>;

/** Parse "field" / "-field" into a Prisma orderBy, limited to allowed fields. */
export function orderBy(sort: string | undefined, allowed: string[], fallback: Record<string, 'asc' | 'desc'>) {
  if (!sort) return fallback;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (!allowed.includes(field)) return fallback;
  return { [field]: desc ? 'desc' : 'asc' } as Record<string, 'asc' | 'desc'>;
}

export async function paginate<T>(
  args: { page: number; pageSize: number },
  count: () => Promise<number>,
  find: (skip: number, take: number) => Promise<T[]>,
): Promise<Paginated<T>> {
  const [total, items] = await Promise.all([count(), find((args.page - 1) * args.pageSize, args.pageSize)]);
  return { items, total, page: args.page, pageSize: args.pageSize };
}

/** Case-insensitive contains across fields. */
export function searchOr(q: string | undefined, fields: string[]): Record<string, unknown> {
  if (!q) return {};
  return { OR: fields.map((f) => nest(f, { contains: q, mode: 'insensitive' })) };
}

function nest(path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.');
  return parts.reduceRight<unknown>((acc, key) => ({ [key]: acc }), value) as Record<string, unknown>;
}

export const dateRange = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export function between(from?: Date, to?: Date) {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}
