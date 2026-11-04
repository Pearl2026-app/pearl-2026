import { ZodValidationException } from 'nestjs-zod';
import type { z } from 'zod';

/** Parse a request body inside a handler; invalid input becomes the usual 400 with per-field messages. */
export function validate<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new ZodValidationException(r.error);
  return r.data;
}
