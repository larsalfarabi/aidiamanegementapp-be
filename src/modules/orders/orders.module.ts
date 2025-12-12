import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Orders } from './entity/orders.entity';
import { OrderItems } from './entity/order_items.entity';
import { Customers } from '../customers/entity/customers.entity';
import { CustomerProductCatalogs } from '../customers/entity/customer_product_catalog.entity';
import { ProductCodes } from '../products/entity/product_codes.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { Users } from '../users/entities/users.entity';
import { RedisModule } from '../redis/redis.module';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Orders,
      OrderItems,
      Customers,
      CustomerProductCatalogs,
      ProductCodes,
      Users,
    ]),
    InventoryModule,
    RedisModule,
    NotificationsModule, // ✅ Import to access NotificationEventEmitter
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PermissionGuard],
  exports: [OrdersService],
})
export class OrdersModule {}
