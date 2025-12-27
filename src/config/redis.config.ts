import * as dotenv from 'dotenv';
dotenv.config();
import { CacheModuleOptions } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';

export const redisConfig = async (): Promise<CacheModuleOptions> => ({
  store: await redisStore({
    socket: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    password: process.env.REDIS_PASSWORD || undefined,
    database: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: '', // PENTING: Set empty string untuk tidak ada prefix
  }),
  ttl: parseInt(process.env.CACHE_TTL || '300000'), // milliseconds
});
