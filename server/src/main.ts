import './preload-env';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { assertEnvironmentSafe, corsOrigins, resolveAppEnv } from './common/env';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const appEnv = assertEnvironmentSafe();

  if (process.env.SENTRY_DSN) {
    try {
      const Sentry = await import('@sentry/node');
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: appEnv,
      });
    } catch {
      /* Sentry optional */
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  app.setGlobalPrefix('api');
  app.use(new RequestIdMiddleware().use.bind(new RequestIdMiddleware()));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
  });

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(
    `Fajara API [${resolveAppEnv()}] listening on port ${port} (/api)`,
  );
}

bootstrap();
