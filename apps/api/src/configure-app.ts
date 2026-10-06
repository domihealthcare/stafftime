import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

/**
 * Everything the app needs before it answers a request, shared by `main.ts`
 * (a laptop, CI) and `api/index.ts` (the live site on Vercel). They used to
 * repeat it, and had drifted: the live one had lost the headers below.
 */
export function configureApp(app: NestExpressApplication): void {
  app.use(cookieParser());

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
