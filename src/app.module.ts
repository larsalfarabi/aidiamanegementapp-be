import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { GqlThrottlerGuard } from './common/guards/gql-throttler.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { typeOrmConfig } from './config/database.config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { CacheModule } from '@nestjs/cache-manager';
import { RedisModule } from './modules/redis/redis.module';
import { ProductsModule } from './modules/products/products.module';
import { CustomersModule } from './modules/customers/customers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ReportsModule } from './modules/reports/reports.module';
import { MailModule } from './modules/mail/mail.module';
import { redisStore } from 'cache-manager-redis-yet';
import { ProductionModule } from './modules/production/production.module';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot(typeOrmConfig),
    ScheduleModule.forRoot(), // Enable scheduled tasks (cron jobs)
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute window
        limit: 100, // Max 100 requests per minute per IP
      },
    ]),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      playground: true, // Enable playground for dev/demo
      sortSchema: true,
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisConfig = {
          socket: {
            host: configService.get<string>('REDIS_HOST', '127.0.0.1'),
            port: configService.get<number>('REDIS_PORT', 6379),
          },
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
          database: configService.get<number>('REDIS_DB', 0),
          keyPrefix: '', // PENTING: Set empty string untuk tidak ada prefix
        };

        console.log('🔧 Redis Configuration:', {
          host: redisConfig.socket.host,
          port: redisConfig.socket.port,
          database: redisConfig.database,
          hasPassword: !!redisConfig.password,
          keyPrefix: redisConfig.keyPrefix,
        });

        const store = await redisStore(redisConfig);
        console.log('✅ Redis Store created:', {
          name: store.name,
          hasClient: !!store.client,
          clientIsReady: store.client?.isReady,
        });

        return {
          store: store,
          ttl: configService.get<number>('CACHE_TTL', 300000), // milliseconds
        };
      },
      inject: [ConfigService],
    }),
    RedisModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    ProductsModule,
    CustomersModule,
    OrdersModule,
    InventoryModule,
    ReportsModule,
    ProductionModule,
    DashboardModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
  ],
})
export class AppModule {}
