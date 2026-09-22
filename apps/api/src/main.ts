import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.use(cookieParser());

  // The API only ever answers this app's own fetches, so it needs none of the
  // latitude a page does. The deployed web app gets the equivalent headers from
  // vercel.json; these cover the API responses, which Vercel's header rules do
  // not reach once the request is inside the function.
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
  app.enableShutdownHooks();

  // Needed for @Ip() to report the real client address behind Vercel/a proxy,
  // which the IP allow-list check depends on.
  app.set('trust proxy', 1);

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(`stafftime-api listening on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
