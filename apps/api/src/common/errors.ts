import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

/** Out-of-scope and missing records look the same (rule 1). */
export const notFound = (what = 'Record') => new NotFoundException({ code: 'NOT_FOUND', message: `${what} not found` });
export const badRequest = (code: string, message: string, fields?: Record<string, string>) =>
  new BadRequestException({ code, message, fields });
export const conflict = (code: string, message: string) => new ConflictException({ code, message });
export const forbidden = (message = 'You do not have permission to do this') =>
  new ForbiddenException({ code: 'FORBIDDEN', message });

export function orNotFound<T>(value: T | null | undefined, what?: string): T {
  if (value == null) throw notFound(what);
  return value;
}
