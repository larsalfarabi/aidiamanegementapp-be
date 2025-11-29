import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryLegacyService } from './services/inventory-legacy.service';
// Services
import { DailyInventoryResetService } from './services/daily-inventory-reset.service';
import { DailyInventoryService } from './services/daily-inventory.service';
import { InventoryTransactionService } from './services/inventory-transaction.service';
// Active entities (Daily Inventory System)
import { DailyInventory } from './entity/daily-inventory.entity';
import { DailyInventorySnapshots } from './entity/daily-inventory-snapshots.entity';
import { InventoryTransactions } from './entity/inventory-transactions.entity';
import { RepackingRecords } from './entity/repacking-records.entity';
import { SampleTracking } from './entity/sample-tracking.entity';
// Related entities
import { ProductCodes } from '../products/entity/product_codes.entity';
import { Orders } from '../orders/entity/orders.entity';
import { OrderItems } from '../orders/entity/order_items.entity';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { Users } from '../users/entities/users.entity';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Active entities (Daily Inventory System)
      DailyInventory,
      DailyInventorySnapshots,
      InventoryTransactions,
      RepackingRecords,
      SampleTracking,
      // Related entities
      ProductCodes,
      Orders,
      OrderItems,
      Users,
    ]),
    RedisModule,
  ],
  controllers: [InventoryController],
  providers: [
    InventoryLegacyService, // Production-only service (3 methods)
    DailyInventoryService, // Daily inventory CRUD
    DailyInventoryResetService, // Cron job for daily reset
    InventoryTransactionService, // Transaction operations
    PermissionGuard,
  ],
  exports: [
    InventoryLegacyService, // Export for production-batch.service.ts
    DailyInventoryService, // Export for order integration
    InventoryTransactionService, // Export for transaction operations
    DailyInventoryResetService, // Export for testing/manual trigger
  ],
})
export class InventoryModule {}
