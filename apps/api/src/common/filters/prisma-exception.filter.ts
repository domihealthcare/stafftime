import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/// Every kind of error the Prisma client throws.
type AnyPrismaError =
  | Prisma.PrismaClientKnownRequestError
  | Prisma.PrismaClientValidationError
  | Prisma.PrismaClientUnknownRequestError
  | Prisma.PrismaClientInitializationError
  | Prisma.PrismaClientRustPanicError;

/// The stack's frames without its first line. A Prisma error's message quotes
/// the failing call, arguments included, so logging it whole would copy what
/// somebody typed (a note, a phone-book entry) into the server log.
export function framesOnly(stack: string | undefined): string {
  return (stack ?? '')
    .split('\n')
    .filter((line) => line.trim().startsWith('at '))
    .join('\n');
}

/// Turns raw Prisma errors into clean HTTP responses instead of leaking
/// database internals to the client, and keeps what was submitted out of the
/// log.
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientRustPanicError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: AnyPrismaError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    const known = exception instanceof Prisma.PrismaClientKnownRequestError ? exception : null;
    const { status, message } = known
      ? this.translate(known)
      : { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Unexpected database error.' };
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      const code = known?.code ?? exception.name;
      this.logger.error(`Unhandled Prisma error ${code}`, framesOnly(exception.stack));
    }

    response.status(status).json({ statusCode: status, message });
  }

  private translate(exception: Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | undefined)?.join(', ') ?? 'value';
        return {
          status: HttpStatus.CONFLICT,
          message: `A record with that ${target} already exists.`,
        };
      }
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Referenced record does not exist.',
        };
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, message: 'Record not found.' };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Unexpected database error.',
        };
    }
  }
}
