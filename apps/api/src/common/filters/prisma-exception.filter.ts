import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/// Turns raw Prisma errors into clean HTTP responses instead of leaking
/// database internals to the client.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    const { status, message } = this.translate(exception);
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`Unhandled Prisma error ${exception.code}`, exception.stack);
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
