import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const result = await this.cacheManager.get<T>(key);
      this.logger.debug(`GET ${key}: ${result ? 'HIT' : 'MISS'}`);
      return result;
    } catch (error) {
      this.logger.error(`Error getting key ${key}:`, error.message);
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
      this.logger.debug(`SET ${key} with TTL: ${ttl || 'default'} seconds`);
    } catch (error) {
      this.logger.error(`Error setting key ${key}:`, error.message);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
      this.logger.debug(`DEL ${key}: completed`);
    } catch (error) {
      this.logger.error(`Error deleting key ${key}:`, error.message);
    }
  }

  // Add utility method to check if Redis is connected
  async isConnected(): Promise<boolean> {
    try {
      const testKey = 'connection-test';
      await this.set(testKey, 'test-value', 1);
      const result = await this.get(testKey);
      await this.del(testKey);
      return result === 'test-value';
    } catch (error) {
      this.logger.error('Redis connection test failed:', error.message);
      return false;
    }
  }
}
