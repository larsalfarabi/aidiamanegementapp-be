import * as dotenv from 'dotenv';
dotenv.config();
import { CacheModuleOptions } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';

export const redisConfig: CacheModuleOptions = {
  store: redisStore,
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT!),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB!),
  ttl: parseInt(process.env.REDIS_TTL!), // Time to live in seconds (5 minutes default)
  max: 1000, // Maximum number of items in cache
};
