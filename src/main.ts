import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { join, resolve } from 'path';

const API_PREFIX = 'api';
const LOCAL_DEVELOPMENT_PORTS = ['4202', '8083'];

function isAllowedLocalOrigin(origin: string): boolean {
  const configuredOrigins = [
    'http://localhost:4202',
    'http://127.0.0.1:4202',
    'http://localhost:8083',
    'http://127.0.0.1:8083',
    'https://gastromania.gastrowerk24.de',
    ...(process.env.FRONTEND_ORIGIN ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ];

  if (configuredOrigins.includes(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);

    if (!LOCAL_DEVELOPMENT_PORTS.includes(url.port)) {
      return false;
    }

    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname.startsWith('192.168.') ||
      url.hostname.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname)
    );
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.useStaticAssets(resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads')), {
    prefix: '/uploads/',
  });
  app.setGlobalPrefix(API_PREFIX);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || isAllowedLocalOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin ist nicht erlaubt'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3003);
}
void bootstrap();
