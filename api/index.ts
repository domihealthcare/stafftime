/**
 * The API as a single Vercel serverless function.
 *
 * Vercel serves the built web app as static files and routes every /api/*
 * request here (see vercel.json). That keeps the browser on one origin, which
 * is what lets the session cookie stay `sameSite=lax` with no CSRF token
 * scheme — see docs/architecture.md.
 *
 * The Nest app is created once per warm instance and reused, because booting it
 * (and opening a database connection) on every request would be slow and would
 * exhaust Postgres connections.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AppModule } from '../apps/api/src/app.module';
import { configureApp } from '../apps/api/src/configure-app';

let cached: NestExpressApplication | undefined;

async function bootstrap(): Promise<NestExpressApplication> {
  if (cached) {
    return cached;
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Vercel captures stdout; Nest's startup banner per cold start is noise.
    logger: ['error', 'warn', 'log'],
  });

  configureApp(app);

  await app.init();
  Logger.log('API initialised', 'Vercel');

  cached = app;
  return app;
}

export default async function handler(req: Request, res: Response) {
  const app = await bootstrap();
  const instance = app.getHttpAdapter().getInstance();
  instance(req, res);
}
