import 'reflect-metadata';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { config } from 'dotenv';
import path from 'node:path';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common';

config({ path: path.resolve(__dirname, '../../../.env') });

export async function createApp() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error', 'warn'] });
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true }));
  app.enableCors({ origin: true, credentials: true });
  app.use('/api/v1', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });
  app.useGlobalFilters(new DomainExceptionFilter());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Referendum').setDescription('Public meetings, on the record.').setVersion('1').build(),
  );
  SwaggerModule.setup('docs', app, document);
  return app;
}

async function bootstrap() {
  const app = await createApp();
  await app.listen(process.env.PORT ?? 3000);
}

if (process.argv[1] && (process.argv[1].endsWith('main.ts') || process.argv[1].endsWith('main.js'))) {
  bootstrap().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
