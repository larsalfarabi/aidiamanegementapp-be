import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { CacheModule } from '@nestjs/cache-manager';
import { redisConfig } from '../../config/redis.config';
@Module({
  imports: [CacheModule.register(redisConfig)],
  providers: [RedisService],
  exports: [RedisService, CacheModule],
})
export class RedisModule {}
