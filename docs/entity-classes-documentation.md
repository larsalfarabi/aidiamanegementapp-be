# Daily Inventory System - Entity Classes Documentation

## Overview

This document provides detailed information about the TypeORM entity classes for the Daily Inventory System.

**Created:** January 16, 2025  
**Status:** ✅ COMPLETED  
**Database:** MariaDB 10.4.32

---

## Entity Classes Summary

### 1. DailyInventory Entity

**File:** `daily-inventory.entity.ts`  
**Table:** `daily_inventory`  
**Purpose:** Main daily inventory tracking with auto-reset at 00:00 WIB

#### Key Features:

- **GENERATED COLUMN**: `stokAkhir` auto-calculated by database
  ```typescript
  stokAkhir =
    stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample;
  ```
- **Daily Reset Columns**: All daily columns reset at 00:00 WIB via cron job
- **Unique Constraint**: One record per product per business date
- **Soft Delete**: Uses `deletedAt` for soft deletion

#### Column Structure:

```typescript
{
  id: number; // Primary key (auto-increment)
  businessDate: Date; // Business date (partition key)
  productCodeId: number; // FK to product_codes

  // Daily columns (reset at 00:00 WIB)
  stokAwal: number; // Opening stock (carried forward)
  barangMasuk: number; // Goods in (production, repack-in, sample-return)
  dipesan: number; // Orders with invoice date = today
  barangOutRepack: number; // Goods out for repacking
  barangOutSample: number; // Goods out as samples
  stokAkhir: number; // GENERATED - Ending stock

  // Thresholds
  minimumStock: number; // Min stock for production planning
  maximumStock: number; // Max stock capacity

  // Metadata
  isActive: boolean;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  createdBy: number;
  updatedBy: number;
}
```

#### Virtual Properties:

- `stockStatus`: Returns 'OUT_OF_STOCK' | 'LOW_STOCK' | 'AVAILABLE' | 'OVERSTOCK'
- `stockUtilization`: Percentage of maximum capacity used
- `getDaysUntilReorder(avgDailyUsage)`: Estimates days until reorder needed

#### Indexes:

1. **Unique**: `(productCodeId, businessDate)` - One record per product per day
2. **businessDate** - Fast daily queries
3. **isActive** - Active records filter

---

### 2. DailyInventorySnapshots Entity

**File:** `daily-inventory-snapshots.entity.ts`  
**Table:** `daily_inventory_snapshots`  
**Purpose:** Historical daily snapshots (1-year retention)

#### Key Features:

- **Immutable**: Never updated after creation (read-only)
- **Auto Cleanup**: Cron job deletes snapshots older than 1 year
- **Regular Column**: `stokAkhir` is stored value (not generated)
- **Snapshot Time**: Captured at 00:00:00 WIB before daily reset

#### Column Structure:

```typescript
{
  id: number; // Primary key (bigint, auto-increment)
  snapshotDate: Date; // Date of snapshot (partition key)
  snapshotTime: string; // Time of snapshot (typically 00:00:00)
  productCodeId: number; // FK to product_codes

  // Snapshot values (read-only)
  stokAwal: number;
  barangMasuk: number;
  dipesan: number;
  barangOutRepack: number;
  barangOutSample: number;
  stokAkhir: number; // REGULAR column (stored snapshot value)

  createdAt: Date;
}
```

#### Virtual Properties:

- `stockChange`: Day-over-day change (stokAkhir - stokAwal)
- `stockChangePercentage`: Percentage change from opening to ending
- `totalActivity`: Total inventory movement (in + out)
- `turnoverRatio`: Stock turnover rate for the day

#### Indexes:

1. **(productCodeId, snapshotDate)** - Product history queries
2. **snapshotDate** - Date range queries

---

### 3. InventoryTransactions Entity (Enhanced)

**File:** `inventory-transactions.entity.ts`  
**Table:** `inventory_transactions`  
**Purpose:** Complete audit trail for all inventory movements

#### Key Features:

- **Enhanced Transaction Types**: Added REPACK_OUT, REPACK_IN, SAMPLE_OUT, SAMPLE_RETURN
- **Immutable**: Soft delete only (via `deletedAt`)
- **Business Date Tracking**: Links to daily_inventory via businessDate
- **Bidirectional Links**: Links to repacking_records for REPACK transactions

#### Transaction Types:

```typescript
enum TransactionType {
  // IN Transactions (positive quantity)
  PRODUCTION_IN = 'PRODUCTION_IN', // Production results
  REPACK_IN = 'REPACK_IN', // Product created from repacking
  SAMPLE_RETURN = 'SAMPLE_RETURN', // Sample returned

  // OUT Transactions (negative quantity)
  SALE = 'SALE', // Sales to customers
  REPACK_OUT = 'REPACK_OUT', // Product consumed for repacking
  SAMPLE_OUT = 'SAMPLE_OUT', // Sample distribution
  WASTE = 'WASTE', // Damaged/expired disposal

  // Special
  ADJUSTMENT = 'ADJUSTMENT', // Stock correction (+ or -)
  SALE_RETURN = 'SALE_RETURN', // Customer return
}
```

#### Column Structure:

```typescript
{
  id: number; // Primary key (bigint)
  transactionNumber: string; // Unique (e.g., TRX-20250115-001)
  transactionDate: Date; // When transaction occurred
  businessDate: Date; // Business date for daily tracking
  transactionType: TransactionType;

  productCodeId: number; // FK to product_codes
  quantity: number; // Positive for IN, negative for OUT
  balanceAfter: number; // Stock balance after transaction

  // References
  orderId: number; // FK to orders (for SALE)
  orderItemId: number; // FK to order_items (for SALE)
  repackingId: number; // FK to repacking_records (for REPACK)
  productionBatchNumber: string; // Production batch (for PRODUCTION_IN)
  referenceNumber: string; // External reference

  // Metadata
  status: TransactionStatus; // PENDING | COMPLETED | CANCELLED
  reason: string;
  notes: string;
  performedBy: string;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  createdBy: number;
  updatedBy: number;
}
```

#### Virtual Properties:

- `isStockIn`: Returns true for IN transactions
- `isStockOut`: Returns true for OUT transactions
- `absoluteQuantity`: Absolute value of quantity

#### Indexes:

1. **(productCodeId, businessDate)** - Daily inventory updates
2. **(transactionType, businessDate)** - Transaction reports
3. **orderId** - Order tracking
4. **repackingId** - Repacking tracking
5. **productionBatchNumber** - Production tracking
6. **businessDate** - Date range queries

---

### 4. RepackingRecords Entity

**File:** `repacking-records.entity.ts`  
**Table:** `repacking_records`  
**Purpose:** Track product repacking/conversion with loss calculation

#### Key Features:

- **Conversion Tracking**: Source → Target product conversion
- **Loss Calculation**: Automatic loss/waste percentage calculation
- **Bidirectional Transaction Links**: Links to both REPACK_OUT and REPACK_IN transactions
- **Efficiency Metrics**: Built-in conversion efficiency calculation

#### Example Scenario:

```typescript
// Repacking: 4x Bottle 250ML → 1x Bottle 1000ML
{
  sourceProductCode: "Bottle 250ML",
  sourceQuantity: 4.0,
  targetProductCode: "Bottle 1000ML",
  targetQuantity: 0.95,  // Some spillage
  conversionRatio: 4.0,
  expectedTargetQty: 1.0,  // 4 ÷ 4.0 = 1.0
  lossQuantity: 0.2,       // (1.0 - 0.95) × 4 = 0.2
  lossPercentage: 5.0      // (0.2 / 4) × 100 = 5%
}
```

#### Column Structure:

```typescript
{
  id: number; // Primary key
  repackingNumber: string; // Unique (e.g., REP-20250115-001)
  repackingDate: Date;
  businessDate: Date;

  // Source product
  sourceProductCodeId: number;
  sourceQuantity: number;

  // Target product
  targetProductCodeId: number;
  targetQuantity: number;

  // Conversion calculation
  conversionRatio: number; // e.g., 4.0 (4 small = 1 large)
  expectedTargetQty: number; // Expected based on ratio
  lossQuantity: number; // Loss in source units
  lossPercentage: number; // Loss percentage

  // Transaction links
  sourceTransactionId: number; // REPACK_OUT transaction
  targetTransactionId: number; // REPACK_IN transaction

  // Metadata
  status: RepackingStatus; // PENDING | COMPLETED | CANCELLED
  reason: string;
  notes: string;
  performedBy: string;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  createdBy: number;
  updatedBy: number;
}
```

#### Virtual Properties:

- `conversionEfficiency`: 100 - lossPercentage (100% = no loss)
- `actualConversionRatio`: Actual ratio achieved (considering loss)
- `isWithinTolerance(maxLossPercentage)`: Checks if loss is acceptable

#### Indexes:

1. **businessDate** - Daily queries
2. **sourceProductCodeId** - Source product tracking
3. **targetProductCodeId** - Target product tracking
4. **status** - Status filtering

---

### 5. SampleTracking Entity (Optional)

**File:** `sample-tracking.entity.ts`  
**Table:** `sample_tracking`  
**Purpose:** Track sample distribution and sales conversion ROI

#### Key Features:

- **Recipient Tracking**: Full contact information
- **Purpose Categories**: PROMOTION, DEMO, QUALITY_TEST, PARTNERSHIP, EVENT, OTHER
- **Return Tracking**: Optional return monitoring
- **Sales Conversion**: Track if sample leads to order
- **Follow-up Scheduling**: Sales team follow-up reminders
- **ROI Indicators**: Built-in conversion metrics

#### Use Cases:

1. **Promotional Sample** (No Return):
   - Give samples to potential customers
   - Schedule follow-up
   - Track conversion to sale

2. **Demo Sample** (Return Expected):
   - Lend products for event demonstration
   - Track return after event
   - Measure event ROI

3. **Quality Test Sample**:
   - Send to lab for testing
   - Track return or disposal
   - Link to quality reports

#### Column Structure:

```typescript
{
  id: number; // Primary key
  sampleNumber: string; // Unique (e.g., SMP-20250115-001)
  sampleDate: Date;
  businessDate: Date;

  productCodeId: number;
  quantity: number;

  // Recipient info
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  recipientAddress: string;

  // Sample purpose
  purpose: SamplePurpose;
  eventName: string;

  // Return tracking (optional)
  expectedReturn: boolean;
  returnDate: Date;
  returnQuantity: number;
  returnTransactionId: number; // SAMPLE_RETURN transaction

  // Sales conversion
  followUpDate: Date;
  convertedToSale: boolean;
  orderId: number; // FK to orders if converted

  // Transaction link
  outTransactionId: number; // SAMPLE_OUT transaction

  // Metadata
  status: SampleStatus; // PENDING | DISTRIBUTED | RETURNED | CONVERTED | CLOSED
  notes: string;
  distributedBy: string;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date;
  createdBy: number;
  updatedBy: number;
}
```

#### Virtual Properties:

- `isOverdueForFollowUp`: Checks if follow-up date passed
- `daysSinceDistribution`: Days since sample given
- `returnRate`: Percentage of samples returned
- `unreturnedQuantity`: Samples not yet returned
- `roiIndicator`: 'CONVERTED' | 'PENDING_FOLLOWUP' | 'NO_CONVERSION' | 'RETURNED'

#### Indexes:

1. **businessDate** - Daily queries
2. **productCodeId** - Product tracking
3. **status** - Status filtering
4. **convertedToSale** - Conversion tracking
5. **followUpDate** - Follow-up reminders

---

## Entity Relationships

```
DailyInventory
├── ManyToOne → ProductCodes
├── ManyToOne → Users (creator)
└── ManyToOne → Users (updater)

DailyInventorySnapshots
└── ManyToOne → ProductCodes

InventoryTransactions
├── ManyToOne → ProductCodes
├── ManyToOne → Orders
├── ManyToOne → OrderItems
├── ManyToOne → RepackingRecords
├── ManyToOne → Users (creator)
└── ManyToOne → Users (updater)

RepackingRecords
├── ManyToOne → ProductCodes (source)
├── ManyToOne → ProductCodes (target)
├── OneToOne → InventoryTransactions (source)
├── OneToOne → InventoryTransactions (target)
├── ManyToOne → Users (creator)
└── ManyToOne → Users (updater)

SampleTracking
├── ManyToOne → ProductCodes
├── ManyToOne → Orders
├── OneToOne → InventoryTransactions (out)
├── OneToOne → InventoryTransactions (return)
├── ManyToOne → Users (creator)
└── ManyToOne → Users (updater)
```

---

## TypeORM Module Configuration

The `InventoryModule` includes all entity classes:

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Old entities (backward compatibility)
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
  // ...
})
```

---

## Import/Export

All entities can be imported from the index file:

```typescript
// Single import for all entities
import {
  DailyInventory,
  DailyInventorySnapshots,
  InventoryTransactions,
  TransactionType,
  TransactionStatus,
  RepackingRecords,
  RepackingStatus,
  SampleTracking,
  SamplePurpose,
  SampleStatus,
} from './entity';
```

---

## Migration Status

✅ All migrations executed successfully:

1. ✅ BackupInventoryTables (1737001000000)
2. ✅ DropOldInventoryTables (1737002000000)
3. ✅ CreateDailyInventoryTable (1737003000000) - **WITH GENERATED COLUMN**
4. ✅ CreateDailyInventorySnapshotsTable (1737004000000)
5. ✅ CreateInventoryTransactionsTable (1737005000000)
6. ✅ CreateRepackingRecordsTable (1737006000000)
7. ✅ CreateSampleTrackingTable (1737007000000)

**Database Schema:** Fully deployed and ready for service layer implementation

---

## Next Steps

1. ✅ **Entity Classes** - COMPLETED
2. ⏳ **Service Layer** - Update inventory.service.ts with new entity operations
3. ⏳ **Cron Job** - Implement daily reset at 00:00 WIB
4. ⏳ **Order Integration** - Hook into orders.service.ts for invoice date
5. ⏳ **Repacking Service** - Implement repacking workflow
6. ⏳ **Controller & DTOs** - Update API endpoints and DTOs
7. ⏳ **Frontend** - Update UI columns and interfaces

---

## Notes

- **GENERATED COLUMN**: The `stokAkhir` column in `DailyInventory` is auto-calculated by MariaDB. Never set this value in application code.
- **Immutability**: `InventoryTransactions` and `DailyInventorySnapshots` should never be updated (soft delete only).
- **Soft Delete**: All entities use `deletedAt` for soft deletion except `DailyInventorySnapshots` (hard delete after 1 year).
- **Backward Compatibility**: Old entities (`Inventory`, `InventoryTransactions`, `InventoryDailySnapshots`) are kept for migration transition period.

---

**Document Version:** 1.0  
**Last Updated:** January 16, 2025  
**Author:** GitHub Copilot
