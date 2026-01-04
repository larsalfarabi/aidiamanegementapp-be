import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import * as compression from 'compression';
import helmet from 'helmet';
import { Logger, ValidationPipe } from '@nestjs/common';
import { useContainer } from 'class-validator';
import * as os from 'os';
dotenv.config();

// Function to get network IP address
function getNetworkIP(): string {
  const interfaces = os.networkInterfaces();

  for (const interfaceName in interfaces) {
    const interfaceInfo = interfaces[interfaceName];
    if (interfaceInfo) {
      for (const info of interfaceInfo) {
        // Skip internal/loopback addresses and IPv6
        if (info.family === 'IPv4' && !info.internal) {
          return info.address;
        }
      }
    }
  }

  // Fallback to localhost if no network IP found
  return 'localhost';
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Note: Body parser is enabled by default in NestJS
  // Better Auth will handle its own request parsing when needed

  app.use(
    compression({
      threshold: 1024,
      level: 6,
      filter: (req, res) => {
        // Skip jika ada header khusus
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      },
    }),
  );

  // Security headers
  app.use(helmet());

  // CORS - restrict to allowed origins
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://aidiamakmur.cloud',
    'https://be.aidiamakmur.cloud',
  ];
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });
  const port = process.env.APP_PORT!;

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidUnknownValues: true,
      transform: true,
      validateCustomDecorators: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  const networkIP = getNetworkIP();

  await app.listen(port, '0.0.0.0');
  Logger.debug(
    `Server berjalan di http://${networkIP}:${process.env.APP_PORT}`,
    'Bootstrap',
  );
}
bootstrap();
