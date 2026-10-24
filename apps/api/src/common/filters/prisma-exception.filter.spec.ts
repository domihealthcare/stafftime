import { HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { framesOnly, PrismaExceptionFilter } from './prisma-exception.filter';

function hostWith(json: jest.Mock) {
  const status = jest.fn().mockReturnValue({ json });
  return {
    host: { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as never,
    status,
  };
}

describe('PrismaExceptionFilter', () => {
  let logged: unknown[][];
  beforeEach(() => {
    logged = [];
    jest.spyOn(Logger.prototype, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('keeps the quoted call, and so what was typed, out of the log', () => {
    const error = new Prisma.PrismaClientValidationError(
      'Invalid `prisma.shift.create()` invocation: { data: { notes: "typed by a person" } }',
      { clientVersion: 'test' },
    );
    const json = jest.fn();
    const { host, status } = hostWith(json);

    new PrismaExceptionFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Unexpected database error.',
    });
    expect(JSON.stringify(logged)).not.toContain('typed by a person');
  });

  it('still answers a missing record with a 404', () => {
    const error = new Prisma.PrismaClientKnownRequestError('x', {
      code: 'P2025',
      clientVersion: 'test',
    });
    const json = jest.fn();
    const { host, status } = hostWith(json);

    new PrismaExceptionFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(logged).toHaveLength(0);
  });

  it('framesOnly drops the message line', () => {
    expect(framesOnly('Error: secret\n    at a (b.ts:1:1)\n    at c (d.ts:2:2)')).toBe(
      '    at a (b.ts:1:1)\n    at c (d.ts:2:2)',
    );
    expect(framesOnly(undefined)).toBe('');
  });
});
