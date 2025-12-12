import { Controller, Get, Inject, Delete, Param } from '@nestjs/common';
import { AppService } from './app.service';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('redis-test')
  async testRedis() {
    try {
      console.log('🔍 Starting Redis test...');

      // Set cache dengan TTL 60 detik
      const testKey = 'my-key';
      const testValue = 'Hello from NestJS!';

      console.log(`📤 Setting key "${testKey}" with value "${testValue}"`);
      await this.cacheManager.set(testKey, testValue, 60000);

      console.log('📥 Getting value from cache...');
      const value = await this.cacheManager.get<string>(testKey);

      console.log(`✅ Retrieved value: "${value}"`);

      // Debug: Access stores array (cache-manager v7)
      const cacheManagerAny = this.cacheManager as any;
      console.log('🔧 CacheManager type:', this.cacheManager.constructor.name);
      console.log('🔧 Has stores:', !!cacheManagerAny.stores);

      let storeInfo = { type: 'Unknown', hasClient: false };
      let clientInfo: any = { connected: false };

      // Access stores array
      if (cacheManagerAny.stores && Array.isArray(cacheManagerAny.stores)) {
        console.log('🔧 Number of stores:', cacheManagerAny.stores.length);

        // Get first store (should be Redis)
        const firstStore = cacheManagerAny.stores[0];
        if (firstStore) {
          console.log('🔧 First store type:', firstStore.constructor?.name);
          console.log('🔧 First store keys:', Object.keys(firstStore));

          storeInfo.type = firstStore.constructor?.name || 'Unknown';

          // Keyv has different structure - try multiple access patterns
          let redisStore = null;

          // Pattern 1: opts.store (Keyv with adapter)
          if (firstStore.opts && firstStore.opts.store) {
            redisStore = firstStore.opts.store;
            console.log(
              '🔧 Found via opts.store:',
              redisStore.constructor?.name,
            );
          }

          // Pattern 2: Direct store property
          if (!redisStore && firstStore.store) {
            redisStore = firstStore.store;
            console.log(
              '🔧 Found via store property:',
              redisStore.constructor?.name,
            );
          }

          // Pattern 3: Adapter's cache
          if (!redisStore && firstStore._cache) {
            redisStore = firstStore._cache;
            console.log('🔧 Found via _cache:', redisStore.constructor?.name);
          }

          // Pattern 4: Check all properties
          if (!redisStore) {
            console.log('🔧 Searching in all firstStore properties...');
            for (const key of Object.keys(firstStore)) {
              const prop = (firstStore as any)[key];
              if (prop && typeof prop === 'object' && prop.client) {
                console.log(
                  `🔧 Found client in property "${key}":`,
                  prop.constructor?.name,
                );
                redisStore = prop;
                break;
              }
            }
          }

          if (redisStore) {
            console.log('🔧 RedisStore found, checking for client...');
            console.log('🔧 RedisStore keys:', Object.keys(redisStore));

            if (redisStore.client) {
              storeInfo.hasClient = true;
              clientInfo = {
                connected: true,
                isReady: redisStore.client.isReady,
                isOpen: redisStore.client.isOpen,
              };
              console.log('✅ Redis client found:', clientInfo);
            } else {
              console.log('⚠️ RedisStore has no client property');
            }
          } else {
            console.log('⚠️ Could not find RedisStore');
          }
        }
      }

      return {
        status: 'Success',
        message: 'Redis integration test successful!',
        key: testKey,
        setValue: testValue,
        getValue: value,
        matched: value === testValue,
        storeInfo: storeInfo,
        cacheManagerType: this.cacheManager.constructor.name,
        redisClient: clientInfo,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ Redis test error:', error);
      return {
        status: 'Error',
        message: 'Redis connection failed!',
        error: error.message,
        stack: error.stack,
      };
    }
  }

  @Get('redis-keys')
  async getRedisKeys() {
    try {
      const cacheManagerAny = this.cacheManager as any;

      if (
        !cacheManagerAny.stores ||
        !Array.isArray(cacheManagerAny.stores) ||
        cacheManagerAny.stores.length === 0
      ) {
        return {
          error: 'Redis store not available',
          storesCount: cacheManagerAny.stores?.length || 0,
        };
      }

      // Get first store (Redis store wrapped in Keyv)
      const firstStore = cacheManagerAny.stores[0];

      // Access the actual Redis store from Keyv wrapper
      const redisStore = firstStore.opts?.store;

      if (!redisStore || !redisStore.client) {
        return {
          error: 'Redis client not available',
          hasStore: !!redisStore,
          hasClient: !!redisStore?.client,
        };
      }

      // Get all keys menggunakan SCAN untuk production-ready
      const keys: string[] = [];
      for await (const key of redisStore.client.scanIterator()) {
        keys.push(key);
      }

      return {
        status: 'Success',
        totalKeys: keys.length,
        keys: keys,
      };
    } catch (error) {
      return {
        status: 'Error',
        error: error.message,
        stack: error.stack,
      };
    }
  }

  @Get('redis-get/:key')
  async getRedisKey(@Param('key') key: string) {
    try {
      const value = await this.cacheManager.get(key);

      return {
        status: 'Success',
        key: key,
        value: value,
        exists: value !== null && value !== undefined,
      };
    } catch (error) {
      return {
        status: 'Error',
        error: error.message,
      };
    }
  }

  @Delete('redis-clear')
  async clearRedis() {
    try {
      const cacheManagerAny = this.cacheManager as any;

      if (
        !cacheManagerAny.stores ||
        !Array.isArray(cacheManagerAny.stores) ||
        cacheManagerAny.stores.length === 0
      ) {
        return { error: 'Redis store not available' };
      }

      const firstStore = cacheManagerAny.stores[0];
      const redisStore = firstStore.opts?.store;

      if (!redisStore || !redisStore.client) {
        return { error: 'Redis client not available' };
      }

      // Clear all keys
      await redisStore.client.flushDb();

      return {
        status: 'Success',
        message: 'Redis cache cleared',
      };
    } catch (error) {
      return {
        status: 'Error',
        error: error.message,
      };
    }
  }
}
