import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@sahyadri/db';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';

/** One error shape everywhere: { code, message, fields? }. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;

    if (exception instanceof ZodValidationException) {
      const err = exception.getZodError() as ZodError;
      const fields: Record<string, string> = {};
      for (const i of err.issues) fields[i.path.join('.') || '_'] ??= i.message;
      res.status(400).json({ code: 'VALIDATION_FAILED', message: 'Please check the highlighted fields.', fields });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'code' in body) {
        res.status(status).json(body);
        return;
      }
      const message = typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? exception.message);
      res.status(status).json({ code: HttpStatus[status] ?? 'ERROR', message: Array.isArray(message) ? message.join(', ') : message });
      return;
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        const target = (exception.meta?.target as string[] | string | undefined) ?? '';
        const field = Array.isArray(target) ? target.join(', ') : target;
        res.status(409).json({ code: 'DUPLICATE', message: `That ${field || 'value'} is already in use.`, fields: field ? { [String(Array.isArray(target) ? target[0] : target)]: 'Already in use' } : undefined });
        return;
      }
      if (exception.code === 'P2025') {
        res.status(404).json({ code: 'NOT_FOUND', message: 'Record not found' });
        return;
      }
      if (exception.code === 'P2003') {
        res.status(400).json({ code: 'INVALID_REFERENCE', message: 'A linked record does not exist.' });
        return;
      }
    }
    this.log.error((exception as Error)?.stack ?? String(exception));
    res.status(500).json({ code: 'INTERNAL', message: 'Something went wrong. Please try again.' });
  }
}
