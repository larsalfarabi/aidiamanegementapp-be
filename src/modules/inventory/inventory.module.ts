import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
// Services
import { DailyInventoryResetService } from './services/daily-inventory-reset.service';
import { DailyInventoryService } from './services/daily-inventory.service';
import { InventoryTransactionService } from './services/inventory-transaction.service';
// Old entities (will be phased out)
import { Inventory } from './entity/inventory.entity';
import { InventoryTransactions as OldInventoryTransactions } from './entity/inventory_transactions.entity';
import { InventoryDailySnapshots as OldInventoryDailySnapshots } from './entity/inventory_daily_snapshots.entity';
// New entities (Daily Inventory System)
import { DailyInventory } from './entity/daily-inventory.entity';
import { DailyInventorySnapshots } from './entity/daily-inventory-snapshots.entity';
import { InventoryTransactions } from './entity/inventory-transactions.entity';
import { RepackingRecords } from './entity/repacking-records.entity';
import { SampleTracking } from './entity/sample-tracking.entity';
// Related entities
import { ProductCodes } from '../products/entity/product_codes.entity';
import { Orders } from '../orders/entity/orders.entity';
import { OrderItems } from '../orders/entity/order_items.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Old entities (backward compatibility during migration)
      Inventory,
      OldInventoryTransactions,
      OldInventoryDailySnapshots,
      // New entities (Daily Inventory System)
      DailyInventory,
      DailyInventorySnapshots,
      InventoryTransactions,
      RepackingRecords,
      SampleTracking,
      // Related entities
      ProductCodes,
      Orders,
      OrderItems,
    ]),
  ],
  controllers: [InventoryController],
  providers: [
    InventoryService, // Old service (legacy)
    DailyInventoryService, // New service (daily inventory CRUD)
    DailyInventoryResetService, // Cron job for daily reset
    InventoryTransactionService, // New service (transaction operations)
  ],
  exports: [
    InventoryService, // Export for backward compatibility
    DailyInventoryService, // Export for order integration
    InventoryTransactionService, // Export for transaction operations
    DailyInventoryResetService, // Export for testing/manual trigger
  ],
})
export class InventoryModule {}
