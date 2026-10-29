import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { refuseForgedRequest } from './common/request-origin';

/// A refusal is written to the log, so a real client the rule shuts out by
/// mistake shows up there rather than as a puzzle.
const forgedLog = new Logger('ForgedRequest');

/**
 * Everything the app needs before it answers a request, shared by `main.ts`
 * (a laptop, CI) and `api/index.ts` (the live site on Vercel). They used to
 * repeat it, and had drifted: the live one had lost the headers below.
 */
export function configureApp(app: NestExpressApplication): void {
  app.use(cookieParser());

  // Refuse a request that changes something when it was sent from another
  // site, the practice's own website included, or carries a form's body
  // rather than JSON. Before the body parsers, so a forged body is never read.
  // Why, and what still passes: common/request-origin.ts.
  app.use((request: Request, response: Response, next: NextFunction) => {
    const refusal = refuseForgedRequest(request.method, request.headers);
    if (!refusal) return next();
    forgedLog.warn(
      `${refusal.statusCode} ${request.method} ${request.path}: ` +
        `sec-fetch-site=${String(request.headers['sec-fetch-site'] ?? '-')} ` +
        `origin=${String(request.headers.origin ?? '-')} ` +
        `content-type=${String(request.headers['content-type'] ?? '-')}`,
    );
    response.status(refusal.statusCode).json(refusal);
  });

  // Room for a profile photo: the browser keeps one under 180,000 characters,
  // and Express's own limit is 100 kB.
  app.useBodyParser('json', { limit: '300kb' });

  // Nobody needs telling what the server runs on.
  app.disable('x-powered-by');

  // The API only ever answers this app's own fetches, so it needs none of the
  // latitude a page does. The deployed web app gets the equivalent headers from
  // vercel.json; these make sure the API responses carry them wherever it runs.
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());

  // Behind Vercel (or any proxy) the real client address arrives in
  // x-forwarded-for; @Ip() and the IP allow-list check depend on it.
  app.set('trust proxy', 1);
}
