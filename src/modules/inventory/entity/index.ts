/**
 * Inventory Entities Index
 * Centralized exports for all inventory-related entities
 */

// New Daily Inventory System Entities
export { DailyInventory } from './daily-inventory.entity';
export { DailyInventorySnapshots } from './daily-inventory-snapshots.entity';
export {
  InventoryTransactions,
  TransactionType,
  TransactionStatus,
} from './inventory-transactions.entity';
export { RepackingRecords, RepackingStatus } from './repacking-records.entity';
export {
  SampleTracking,
  SamplePurpose,
  SampleStatus,
} from './sample-tracking.entity';

// Old Entities (for backward compatibility during migration)
export { Inventory } from './inventory.entity';
export { InventoryTransactions as OldInventoryTransactions } from './inventory_transactions.entity';
export { InventoryDailySnapshots as OldInventoryDailySnapshots } from './inventory_daily_snapshots.entity';
