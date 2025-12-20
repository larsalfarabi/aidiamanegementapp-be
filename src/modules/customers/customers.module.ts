import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { Customers } from './entity/customers.entity';
import { CustomerProductCatalogs } from './entity/customer_product_catalog.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Users } from '../users/entities/users.entity';
import { RedisModule } from '../redis/redis.module';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Orders } from '../orders/entity/orders.entity';
import { ProductCodes } from '../products/entity/product_codes.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customers,
      CustomerProductCatalogs,
      Users,
      Orders,
      ProductCodes,
    ]),
    RedisModule,
    NotificationsModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService, PermissionGuard],
})
export class CustomersModule {}
