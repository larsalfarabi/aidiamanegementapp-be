# 📊 Inventory Daily System - Database Redesign

## 🎯 Business Requirements Summary

### Kolom Display (Frontend - columns.tsx)

1. **No.** - Auto increment ID
2. **Kode Barang** - Product code dengan detail produk
3. **Stok Awal** - Opening stock (carry forward dari stok akhir kemarin)
4. **Barang Masuk** - Production in (RESET HARIAN)
5. **Dipesan** - Reserved dari invoice_date = today (RESET HARIAN)
6. **Barang Keluar (Produksi Ulang)** - Repacking out (RESET HARIAN)
7. **Barang Keluar (Sample)** - Sample out (RESET HARIAN)
8. **Stok Akhir** - CALCULATED: stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample
9. **Status Stok** - AVAILABLE, LOW_STOCK, OUT_OF_STOCK, OVERSTOCK
10. **Tanggal Terakhir Diperbarui** - Last transaction timestamp

### Reset Logic (Daily at 00:00 WIB)

- **Stok Awal** = Stok Akhir kemarin (carry forward)
- **Barang Masuk** = 0
- **Dipesan** = 0
- **Barang Keluar (Produksi Ulang)** = 0
- **Barang Keluar (Sample)** = 0

---

## 🗄️ Database Schema Design

### **Option A: Daily Snapshot with Transaction Log** ✅ RECOMMENDED

#### Advantages:

✅ **Simple querying** - Current day data always in one table  
✅ **Fast reads** - No complex aggregation needed for daily view  
✅ **Historical tracking** - Snapshots preserve exact state per day  
✅ **Easy rollback** - Can restore from snapshots  
✅ **Performance** - Indexed by date, product for quick access

#### Disadvantages:

⚠️ Data duplication (mitigated with partitioning)  
⚠️ Daily cron job dependency (mitigated with transaction locks)

---

## 📐 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    DAILY INVENTORY SYSTEM                        │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐
│   product_codes          │
│  (Existing - No Change)  │
├──────────────────────────┤
│ PK  id                   │
│     productCode          │
│ FK  productId            │
│ FK  categoryId           │
│ FK  sizeId               │
└────────┬─────────────────┘
         │
         │ 1:N
         │
┌────────▼──────────────────────────────────────────────────────┐
│ daily_inventory ⭐ MAIN TABLE (Current Day Data)              │
├───────────────────────────────────────────────────────────────┤
│ PK  id                 BIGINT AUTO_INCREMENT                  │
│ UK  productCodeId      INT (UNIQUE per day)                   │
│     businessDate       DATE (DEFAULT CURRENT_DATE)            │
│                                                               │
│ ─── Stock Columns (Reset Daily) ───                          │
│     stokAwal           DECIMAL(10,2) DEFAULT 0               │
│     barangMasuk        DECIMAL(10,2) DEFAULT 0  🔄 RESET     │
│     dipesan            DECIMAL(10,2) DEFAULT 0  🔄 RESET     │
│     barangOutRepack    DECIMAL(10,2) DEFAULT 0  🔄 RESET     │
│     barangOutSample    DECIMAL(10,2) DEFAULT 0  🔄 RESET     │
│     stokAkhir          DECIMAL(10,2) GENERATED ALWAYS AS     │
│                        (stokAwal + barangMasuk - dipesan -   │
│                         barangOutRepack - barangOutSample)   │
│                                                               │
│ ─── Stock Limits ───                                          │
│     minimumStock       DECIMAL(10,2) NULL                     │
│     maximumStock       DECIMAL(10,2) NULL                     │
│                                                               │
│ ─── Metadata ───                                              │
│     lastTransactionDate TIMESTAMP NULL                        │
│     lastTransactionType VARCHAR(50) NULL                      │
│     isActive           BOOLEAN DEFAULT true                   │
│     notes              TEXT NULL                              │
│                                                               │
│ ─── Audit ───                                                 │
│ FK  createdBy          INT                                    │
│ FK  updatedBy          INT                                    │
│     createdAt          TIMESTAMP DEFAULT CURRENT_TIMESTAMP    │
│     updatedAt          TIMESTAMP ON UPDATE CURRENT_TIMESTAMP  │
│                                                               │
│ ─── Indexes ───                                               │
│ IDX (productCodeId, businessDate) UNIQUE                      │
│ IDX (businessDate)                                            │
│ IDX (lastTransactionDate)                                     │
│                                                               │
│ ─── Partitioning ───                                          │
│ PARTITION BY RANGE (YEAR(businessDate))                       │
│   - p2025 VALUES LESS THAN (2026)                             │
│   - p2026 VALUES LESS THAN (2027)                             │
│   - ...                                                       │
└───────────────────────────────────────────────────────────────┘
         │
         │ 1:N
         │
┌────────▼──────────────────────────────────────────────────────┐
│ daily_inventory_snapshots ⭐ HISTORICAL RECORDS               │
├───────────────────────────────────────────────────────────────┤
│ PK  id                 BIGINT AUTO_INCREMENT                  │
│ FK  productCodeId      INT                                    │
│     snapshotDate       DATE                                   │
│                                                               │
│ ─── Daily Values (As-Is from daily_inventory) ───            │
│     stokAwal           DECIMAL(10,2)                          │
│     barangMasuk        DECIMAL(10,2)                          │
│     dipesan            DECIMAL(10,2)                          │
│     barangOutRepack    DECIMAL(10,2)                          │
│     barangOutSample    DECIMAL(10,2)                          │
│     stokAkhir          DECIMAL(10,2)                          │
│     stockStatus        ENUM('AVAILABLE', 'LOW_STOCK',         │
│                             'OUT_OF_STOCK', 'OVERSTOCK')     │
│                                                               │
│ ─── Metadata Snapshot ───                                     │
│     minimumStock       DECIMAL(10,2) NULL                     │
│     maximumStock       DECIMAL(10,2) NULL                     │
│     notes              TEXT NULL                              │
│                                                               │
│ ─── Audit ───                                                 │
│     createdAt          TIMESTAMP DEFAULT CURRENT_TIMESTAMP    │
│     createdBy          INT                                    │
│                                                               │
│ ─── Indexes ───                                               │
│ IDX (productCodeId, snapshotDate) UNIQUE                      │
│ IDX (snapshotDate)                                            │
│                                                               │
│ ─── Retention Policy ───                                      │
│ Keep 1 year (365 days) - Auto cleanup via scheduled job      │
└───────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────┐
│ inventory_transactions ⭐ TRANSACTION LOG (Immutable)         │
├───────────────────────────────────────────────────────────────┤
│ PK  id                 BIGINT AUTO_INCREMENT                  │
│ UK  transactionNumber  VARCHAR(50) UNIQUE                     │
│     transactionDate    TIMESTAMP DEFAULT CURRENT_TIMESTAMP    │
│                                                               │
│ ─── Transaction Type (ENHANCED) ───                           │
│     transactionType    ENUM(                                  │
│                          'PRODUCTION_IN',    # Barang Masuk   │
│                          'SALE',             # Dipesan (from order) │
│                          'REPACK_OUT',       # Barang Out Repack    │
│                          'REPACK_IN',        # Target product masuk │
│                          'SAMPLE_OUT',       # Sample keluar  │
│                          'SAMPLE_RETURN',    # Sample kembali │
│                          'WASTE',            # Waste/rusak    │
│                          'ADJUSTMENT_IN',    # Adjustment +   │
│                          'ADJUSTMENT_OUT'    # Adjustment -   │
│                        )                                      │
│                                                               │
│ ─── Product & Inventory Link ───                              │
│ FK  productCodeId      INT                                    │
│ FK  dailyInventoryId   BIGINT                                 │
│     businessDate       DATE (denormalized for fast query)     │
│                                                               │
│ ─── Quantity & Balance ───                                    │
│     quantity           DECIMAL(10,2)  # + for IN, - for OUT  │
│     balanceAfter       DECIMAL(10,2)  # Stok akhir after trx │
│                                                               │
│ ─── References ───                                            │
│ FK  orderId            INT NULL        # For SALE             │
│ FK  orderItemId        INT NULL        # For SALE             │
│ FK  repackingRecordId  BIGINT NULL     # For REPACK_IN/OUT    │
│     batchNumber        VARCHAR(100) NULL # Production batch  │
│     referenceNumber    VARCHAR(100) NULL # External ref      │
│                                                               │
│ ─── Status & Additional Info ───                              │
│     status             ENUM('PENDING', 'COMPLETED',           │
│                             'CANCELLED') DEFAULT 'COMPLETED' │
│     reason             TEXT NULL       # Waste/adjustment reason │
│     notes              TEXT NULL                              │
│     performedBy        VARCHAR(100) NULL # Physical handler   │
│                                                               │
│ ─── Audit ───                                                 │
│ FK  createdBy          INT                                    │
│     createdAt          TIMESTAMP DEFAULT CURRENT_TIMESTAMP    │
│                                                               │
│ ─── Indexes ───                                               │
│ IDX (productCodeId, transactionDate)                          │
│ IDX (transactionType, businessDate)                           │
│ IDX (orderId)                                                 │
│ IDX (repackingRecordId)                                       │
│ IDX (businessDate, transactionType)                           │
│                                                               │
│ ─── Partitioning ───                                          │
│ PARTITION BY RANGE (YEAR(businessDate))                       │
└───────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────┐
│ repacking_records ⭐ REPACKING WORKFLOW TRACKING              │
├───────────────────────────────────────────────────────────────┤
│ PK  id                 BIGINT AUTO_INCREMENT                  │
│ UK  repackingNumber    VARCHAR(50) UNIQUE                     │
│     repackingDate      DATE DEFAULT CURRENT_DATE              │
│                                                               │
│ ─── Source Product (5L → 1L) ───                              │
│ FK  sourceProductCodeId INT                                   │
│     sourceQuantity      DECIMAL(10,2)  # e.g., 10 jerigen 5L │
│     sourceBatchNumber   VARCHAR(100) NULL                     │
│                                                               │
│ ─── Target Product ───                                        │
│ FK  targetProductCodeId INT                                   │
│     targetQuantity      DECIMAL(10,2)  # e.g., 48 botol 1L   │
│     targetBatchNumber   VARCHAR(100) NULL                     │
│                                                               │
│ ─── Conversion & Loss ───                                     │
│     expectedYield       DECIMAL(10,2)  # e.g., 50L expected  │
│     actualYield         DECIMAL(10,2)  # e.g., 48L actual    │
│     lossQuantity        DECIMAL(10,2)  # e.g., 2L loss       │
│     lossReason          TEXT NULL      # Tumpah, waste, etc. │
│     conversionRatio     DECIMAL(10,4)  # Calculated ratio    │
│                                                               │
│ ─── Status & Approval ───                                     │
│     status              ENUM('PENDING', 'IN_PROGRESS',        │
│                              'COMPLETED', 'CANCELLED')       │
│                         DEFAULT 'PENDING'                    │
│     notes               TEXT NULL                             │
│                                                               │
│ ─── Audit ───                                                 │
│ FK  performedBy         INT           # Who did repacking     │
│ FK  approvedBy          INT NULL      # Optional approval     │
│     createdAt           TIMESTAMP DEFAULT CURRENT_TIMESTAMP   │
│     completedAt         TIMESTAMP NULL                        │
│                                                               │
│ ─── Indexes ───                                               │
│ IDX (sourceProductCodeId, repackingDate)                      │
│ IDX (targetProductCodeId, repackingDate)                      │
│ IDX (repackingDate)                                           │
│ IDX (status)                                                  │
└───────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────┐
│ sample_tracking ⭐ SAMPLE MANAGEMENT (Optional - Future)      │
├───────────────────────────────────────────────────────────────┤
│ PK  id                 BIGINT AUTO_INCREMENT                  │
│ UK  sampleNumber       VARCHAR(50) UNIQUE                     │
│ FK  productCodeId      INT                                    │
│ FK  transactionId      BIGINT  # Link to inventory_transactions │
│                                                               │
│ ─── Sample Details ───                                        │
│     sampleDate         DATE DEFAULT CURRENT_DATE              │
│     quantity           DECIMAL(10,2)                          │
│     purpose            ENUM('CUSTOMER_DEMO', 'QUALITY_TEST',  │
│                             'R&D', 'MARKETING', 'OTHER')     │
│     purposeDetails     TEXT NULL                              │
│                                                               │
│ ─── Recipient ───                                             │
│     recipientName      VARCHAR(200) NULL                      │
│     recipientCompany   VARCHAR(200) NULL                      │
│     recipientContact   VARCHAR(100) NULL                      │
│                                                               │
│ ─── Return Tracking ───                                       │
│     isReturnable       BOOLEAN DEFAULT false                  │
│     returnDate         DATE NULL                              │
│     returnQuantity     DECIMAL(10,2) NULL                     │
│     returnStatus       ENUM('NOT_RETURNED', 'PARTIAL',        │
│                             'FULL_RETURN') DEFAULT 'NOT_RETURNED' │
│                                                               │
│ ─── Audit ───                                                 │
│ FK  requestedBy        INT                                    │
│ FK  approvedBy         INT NULL                               │
│     createdAt          TIMESTAMP DEFAULT CURRENT_TIMESTAMP    │
│     notes              TEXT NULL                              │
│                                                               │
│ ─── Indexes ───                                               │
│ IDX (productCodeId, sampleDate)                               │
│ IDX (sampleDate)                                              │
│ IDX (purpose)                                                 │
│ IDX (returnStatus)                                            │
└───────────────────────────────────────────────────────────────┘
```

---

## 🔄 Daily Reset Process (Cron Job at 00:00 WIB)

### **Execution Flow with Race Condition Handling**

```sql
-- ============================================
-- STEP 1: START TRANSACTION WITH LOCK
-- ============================================
START TRANSACTION;

-- Lock all daily_inventory records for update (prevents concurrent modifications)
SELECT id, productCodeId, stokAwal, barangMasuk, dipesan,
       barangOutRepack, barangOutSample, stokAkhir
FROM daily_inventory
WHERE businessDate = CURRENT_DATE - INTERVAL 1 DAY
FOR UPDATE;

-- ============================================
-- STEP 2: CREATE SNAPSHOT (Historical Backup)
-- ============================================
INSERT INTO daily_inventory_snapshots (
  productCodeId, snapshotDate,
  stokAwal, barangMasuk, dipesan, barangOutRepack, barangOutSample, stokAkhir,
  stockStatus, minimumStock, maximumStock, notes, createdBy
)
SELECT
  productCodeId,
  CURRENT_DATE - INTERVAL 1 DAY AS snapshotDate,
  stokAwal, barangMasuk, dipesan, barangOutRepack, barangOutSample, stokAkhir,
  CASE
    WHEN stokAkhir <= 0 THEN 'OUT_OF_STOCK'
    WHEN minimumStock IS NOT NULL AND stokAkhir <= minimumStock THEN 'LOW_STOCK'
    WHEN maximumStock IS NOT NULL AND stokAkhir >= maximumStock THEN 'OVERSTOCK'
    ELSE 'AVAILABLE'
  END AS stockStatus,
  minimumStock, maximumStock, notes, 1 AS createdBy
FROM daily_inventory
WHERE businessDate = CURRENT_DATE - INTERVAL 1 DAY;

-- ============================================
-- STEP 3: CARRY FORWARD (Stok Akhir → Stok Awal)
-- ============================================
UPDATE daily_inventory di
SET
  businessDate = CURRENT_DATE,
  stokAwal = di.stokAkhir,  -- ⭐ CARRY FORWARD
  barangMasuk = 0,          -- 🔄 RESET
  dipesan = 0,              -- 🔄 RESET
  barangOutRepack = 0,      -- 🔄 RESET
  barangOutSample = 0,      -- 🔄 RESET
  -- stokAkhir akan auto-calculated by GENERATED column
  lastTransactionDate = CURRENT_TIMESTAMP,
  lastTransactionType = 'DAILY_RESET',
  updatedAt = CURRENT_TIMESTAMP,
  updatedBy = 1  -- System user
WHERE businessDate = CURRENT_DATE - INTERVAL 1 DAY;

-- ============================================
-- STEP 4: COMMIT TRANSACTION
-- ============================================
COMMIT;

-- ============================================
-- STEP 5: CLEANUP OLD SNAPSHOTS (Retention: 1 year)
-- ============================================
DELETE FROM daily_inventory_snapshots
WHERE snapshotDate < CURRENT_DATE - INTERVAL 365 DAY;
```

### **Race Condition Handling**

**Scenario**: Transaksi masuk tepat saat reset (00:00:00 - 00:00:05)

**Solution**: Database Row-Level Locking

```typescript
// NestJS Service Implementation
async dailyResetCronJob() {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction('READ COMMITTED'); // Isolation level

  try {
    // 1. Lock rows with FOR UPDATE
    await queryRunner.query(`
      SELECT id FROM daily_inventory
      WHERE businessDate = CURDATE() - INTERVAL 1 DAY
      FOR UPDATE
    `);

    // 2. Create snapshot
    await this.createDailySnapshot(queryRunner);

    // 3. Carry forward and reset
    await this.carryForwardAndReset(queryRunner);

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    // Retry mechanism with exponential backoff
    await this.retryResetWithBackoff();
  } finally {
    await queryRunner.release();
  }
}
```

**Retry Logic**:

- Max 3 retries
- Exponential backoff: 5s, 15s, 30s
- Alert admin if all retries fail

---

## 📊 Calculated Fields & Virtual Properties

### **1. stokAkhir (GENERATED ALWAYS AS)**

```sql
stokAkhir DECIMAL(10,2) GENERATED ALWAYS AS (
  stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample
) STORED
```

**Advantages**:

- ✅ Always consistent (auto-updated)
- ✅ Indexed for fast queries
- ✅ No application logic needed

### **2. stockStatus (Virtual Getter in TypeORM)**

```typescript
get stockStatus(): 'OUT_OF_STOCK' | 'LOW_STOCK' | 'AVAILABLE' | 'OVERSTOCK' {
  const stokAkhir = Number(this.stokAkhir) || 0;
  const minimum = Number(this.minimumStock) || 0;
  const maximum = Number(this.maximumStock) || 0;

  if (stokAkhir <= 0) return 'OUT_OF_STOCK';
  if (minimum > 0 && stokAkhir <= minimum) return 'LOW_STOCK';
  if (maximum > 0 && stokAkhir >= maximum) return 'OVERSTOCK';
  return 'AVAILABLE';
}
```

---

## 🔗 Integration Points

### **1. Order Invoice Integration**

**Trigger**: When `orders.invoiceDate` is set to today

```typescript
// orders.service.ts
async setInvoiceDate(orderId: number, invoiceDate: Date, userId: number) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Update order invoice date
    await queryRunner.manager.update(Orders, orderId, {
      invoiceDate,
      orderStatus: OrderStatus.CONFIRMED,
      updatedBy: { id: userId },
    });

    // 2. Get order items
    const orderItems = await queryRunner.manager.find(OrderItems, {
      where: { orderId },
      relations: ['productCode'],
    });

    // 3. Update daily_inventory.dipesan for each item
    for (const item of orderItems) {
      // Increment 'dipesan' column
      await queryRunner.manager.increment(
        DailyInventory,
        {
          productCodeId: item.productCodeId,
          businessDate: invoiceDate
        },
        'dipesan',
        item.quantity
      );

      // Create SALE transaction
      await queryRunner.manager.save(InventoryTransactions, {
        transactionNumber: await this.generateTransactionNumber(),
        transactionDate: new Date(),
        transactionType: TransactionType.SALE,
        productCodeId: item.productCodeId,
        quantity: -item.quantity,  // Negative for OUT
        orderId: orderId,
        orderItemId: item.id,
        referenceNumber: order.invoiceNumber,
        businessDate: invoiceDate,
        status: 'COMPLETED',
        createdBy: { id: userId },
      });
    }

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

### **2. Production Recording**

```typescript
async recordProduction(dto: RecordProductionDto, userId: number) {
  const { productCodeId, quantity, batchNumber, notes } = dto;

  // 1. Increment barangMasuk
  await this.dailyInventoryRepo.increment(
    { productCodeId, businessDate: new Date() },
    'barangMasuk',
    quantity
  );

  // 2. Create transaction log
  await this.transactionRepo.save({
    transactionNumber: await this.generateTransactionNumber(),
    transactionType: TransactionType.PRODUCTION_IN,
    productCodeId,
    quantity,
    batchNumber,
    notes,
    businessDate: new Date(),
    status: 'COMPLETED',
    createdBy: { id: userId },
  });
}
```

### **3. Repacking Workflow**

```typescript
async recordRepacking(dto: RecordRepackingDto, userId: number) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Create repacking record
    const repackingRecord = await queryRunner.manager.save(RepackingRecords, {
      repackingNumber: await this.generateRepackingNumber(),
      sourceProductCodeId: dto.sourceProductCodeId,
      sourceQuantity: dto.sourceQuantity,
      targetProductCodeId: dto.targetProductCodeId,
      targetQuantity: dto.targetQuantity,
      lossQuantity: dto.lossQuantity,
      lossReason: dto.lossReason,
      conversionRatio: dto.targetQuantity / dto.sourceQuantity,
      status: 'COMPLETED',
      performedBy: { id: userId },
      completedAt: new Date(),
    });

    // 2. Deduct from source product (barangOutRepack++)
    await queryRunner.manager.increment(
      DailyInventory,
      {
        productCodeId: dto.sourceProductCodeId,
        businessDate: new Date()
      },
      'barangOutRepack',
      dto.sourceQuantity
    );

    // Create REPACK_OUT transaction
    await queryRunner.manager.save(InventoryTransactions, {
      transactionNumber: await this.generateTransactionNumber(),
      transactionType: TransactionType.REPACK_OUT,
      productCodeId: dto.sourceProductCodeId,
      quantity: -dto.sourceQuantity,
      repackingRecordId: repackingRecord.id,
      businessDate: new Date(),
      status: 'COMPLETED',
      createdBy: { id: userId },
    });

    // 3. Add to target product (barangMasuk++)
    await queryRunner.manager.increment(
      DailyInventory,
      {
        productCodeId: dto.targetProductCodeId,
        businessDate: new Date()
      },
      'barangMasuk',
      dto.targetQuantity
    );

    // Create REPACK_IN transaction
    await queryRunner.manager.save(InventoryTransactions, {
      transactionNumber: await this.generateTransactionNumber(),
      transactionType: TransactionType.REPACK_IN,
      productCodeId: dto.targetProductCodeId,
      quantity: dto.targetQuantity,
      repackingRecordId: repackingRecord.id,
      businessDate: new Date(),
      status: 'COMPLETED',
      createdBy: { id: userId },
    });

    // 4. Record loss as WASTE if > 0
    if (dto.lossQuantity > 0) {
      await queryRunner.manager.save(InventoryTransactions, {
        transactionNumber: await this.generateTransactionNumber(),
        transactionType: TransactionType.WASTE,
        productCodeId: dto.sourceProductCodeId,
        quantity: -dto.lossQuantity,
        reason: `Repacking loss: ${dto.lossReason}`,
        repackingRecordId: repackingRecord.id,
        businessDate: new Date(),
        status: 'COMPLETED',
        createdBy: { id: userId },
      });
    }

    await queryRunner.commitTransaction();
    return repackingRecord;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

### **4. Sample Tracking**

```typescript
async recordSampleOut(dto: RecordSampleDto, userId: number) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Increment barangOutSample
    await queryRunner.manager.increment(
      DailyInventory,
      {
        productCodeId: dto.productCodeId,
        businessDate: new Date()
      },
      'barangOutSample',
      dto.quantity
    );

    // 2. Create transaction
    const transaction = await queryRunner.manager.save(InventoryTransactions, {
      transactionNumber: await this.generateTransactionNumber(),
      transactionType: TransactionType.SAMPLE_OUT,
      productCodeId: dto.productCodeId,
      quantity: -dto.quantity,
      businessDate: new Date(),
      status: 'COMPLETED',
      notes: `Sample for ${dto.purpose}`,
      createdBy: { id: userId },
    });

    // 3. Create sample tracking record
    await queryRunner.manager.save(SampleTracking, {
      sampleNumber: await this.generateSampleNumber(),
      productCodeId: dto.productCodeId,
      transactionId: transaction.id,
      quantity: dto.quantity,
      purpose: dto.purpose,
      purposeDetails: dto.purposeDetails,
      recipientName: dto.recipientName,
      isReturnable: dto.isReturnable,
      requestedBy: { id: userId },
    });

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

### **5. Stock Adjustment (Discrepancy Handling)**

```typescript
async adjustStockDiscrepancy(dto: AdjustStockDto, userId: number) {
  const { productCodeId, physicalCount, reason } = dto;

  // Get current system stock
  const dailyInventory = await this.dailyInventoryRepo.findOne({
    where: { productCodeId, businessDate: new Date() },
  });

  const systemStock = dailyInventory.stokAkhir;
  const difference = physicalCount - systemStock;

  if (difference === 0) {
    throw new BadRequestException('No discrepancy found');
  }

  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Adjust stokAwal directly (not reset columns)
    await queryRunner.manager.increment(
      DailyInventory,
      { productCodeId, businessDate: new Date() },
      'stokAwal',
      difference  // Can be negative or positive
    );

    // Create adjustment transaction
    const transactionType = difference > 0
      ? TransactionType.ADJUSTMENT_IN
      : TransactionType.ADJUSTMENT_OUT;

    await queryRunner.manager.save(InventoryTransactions, {
      transactionNumber: await this.generateTransactionNumber(),
      transactionType,
      productCodeId,
      quantity: difference,
      reason: `Stock opname: ${reason}. System=${systemStock}, Physical=${physicalCount}, Diff=${difference}`,
      businessDate: new Date(),
      status: 'COMPLETED',
      createdBy: { id: userId },
    });

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

---

## 📈 Reporting Queries

### **1. Daily Comparison Report**

```sql
-- Today vs Yesterday vs Last Week
SELECT
  pc.productCode,
  p.name AS productName,

  -- Today
  t.stokAwal AS today_opening,
  t.barangMasuk AS today_in,
  t.dipesan AS today_ordered,
  t.barangOutRepack AS today_repack,
  t.barangOutSample AS today_sample,
  t.stokAkhir AS today_closing,

  -- Yesterday
  y.stokAkhir AS yesterday_closing,
  (t.stokAkhir - y.stokAkhir) AS day_change,

  -- Last Week Same Day
  w.stokAkhir AS lastweek_closing,
  (t.stokAkhir - w.stokAkhir) AS week_change

FROM daily_inventory_snapshots t
LEFT JOIN daily_inventory_snapshots y
  ON t.productCodeId = y.productCodeId
  AND y.snapshotDate = CURDATE() - INTERVAL 1 DAY
LEFT JOIN daily_inventory_snapshots w
  ON t.productCodeId = w.productCodeId
  AND w.snapshotDate = CURDATE() - INTERVAL 7 DAY
LEFT JOIN product_codes pc ON t.productCodeId = pc.id
LEFT JOIN products p ON pc.productId = p.id

WHERE t.snapshotDate = CURDATE()
ORDER BY pc.productCode;
```

### **2. Monthly Summary Report**

```sql
-- Aggregate data for current month
SELECT
  pc.productCode,
  p.name AS productName,

  -- Opening stock (first day of month)
  (SELECT stokAwal
   FROM daily_inventory_snapshots
   WHERE productCodeId = pc.id
     AND snapshotDate = DATE_FORMAT(CURDATE(), '%Y-%m-01')
   LIMIT 1) AS month_opening,

  -- Totals for the month
  SUM(dis.barangMasuk) AS total_production,
  SUM(dis.dipesan) AS total_ordered,
  SUM(dis.barangOutRepack) AS total_repacked,
  SUM(dis.barangOutSample) AS total_sampled,

  -- Current closing
  (SELECT stokAkhir
   FROM daily_inventory_snapshots
   WHERE productCodeId = pc.id
     AND snapshotDate = CURDATE()
   LIMIT 1) AS month_closing,

  -- Average daily stock
  AVG(dis.stokAkhir) AS avg_daily_stock,

  -- Min/Max stock
  MIN(dis.stokAkhir) AS min_stock,
  MAX(dis.stokAkhir) AS max_stock

FROM product_codes pc
LEFT JOIN products p ON pc.productId = p.id
LEFT JOIN daily_inventory_snapshots dis
  ON pc.id = dis.productCodeId
  AND dis.snapshotDate >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
  AND dis.snapshotDate <= CURDATE()

GROUP BY pc.id, pc.productCode, p.name
ORDER BY pc.productCode;
```

---

## 🔒 Rollback Strategy

### **1. Backup Before Migration**

```sql
-- Create backup tables with 1-month data retention
CREATE TABLE inventory_backup_20250115 AS
SELECT * FROM inventory
WHERE lastTransactionDate >= CURDATE() - INTERVAL 30 DAY;

CREATE TABLE inventory_transactions_backup_20250115 AS
SELECT * FROM inventory_transactions
WHERE transactionDate >= CURDATE() - INTERVAL 30 DAY;
```

### **2. Rollback Migration Script**

```typescript
// migration/1737000000000-RollbackInventoryRedesign.ts
export class RollbackInventoryRedesign1737000000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop new tables
    await queryRunner.dropTable('sample_tracking', true);
    await queryRunner.dropTable('repacking_records', true);
    await queryRunner.dropTable('daily_inventory_snapshots', true);
    await queryRunner.dropTable('daily_inventory', true);

    // 2. Restore from backup
    await queryRunner.query(`
      CREATE TABLE inventory LIKE inventory_backup_20250115;
      INSERT INTO inventory SELECT * FROM inventory_backup_20250115;
    `);

    await queryRunner.query(`
      CREATE TABLE inventory_transactions LIKE inventory_transactions_backup_20250115;
      INSERT INTO inventory_transactions SELECT * FROM inventory_transactions_backup_20250115;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Re-run forward migration
  }
}
```

---

## 📊 Performance Optimizations

### **1. Indexes**

```sql
-- daily_inventory
CREATE INDEX idx_daily_inv_product_date ON daily_inventory(productCodeId, businessDate);
CREATE INDEX idx_daily_inv_date ON daily_inventory(businessDate);
CREATE INDEX idx_daily_inv_last_trx ON daily_inventory(lastTransactionDate);

-- daily_inventory_snapshots
CREATE INDEX idx_snapshot_product_date ON daily_inventory_snapshots(productCodeId, snapshotDate);
CREATE INDEX idx_snapshot_date ON daily_inventory_snapshots(snapshotDate);

-- inventory_transactions
CREATE INDEX idx_trx_product_date ON inventory_transactions(productCodeId, businessDate);
CREATE INDEX idx_trx_type_date ON inventory_transactions(transactionType, businessDate);
CREATE INDEX idx_trx_order ON inventory_transactions(orderId);
CREATE INDEX idx_trx_repack ON inventory_transactions(repackingRecordId);

-- repacking_records
CREATE INDEX idx_repack_source ON repacking_records(sourceProductCodeId, repackingDate);
CREATE INDEX idx_repack_target ON repacking_records(targetProductCodeId, repackingDate);
CREATE INDEX idx_repack_date ON repacking_records(repackingDate);
```

### **2. Partitioning (For 100+ products with 20 trx/day)**

```sql
-- Partition inventory_transactions by year
ALTER TABLE inventory_transactions
PARTITION BY RANGE (YEAR(businessDate)) (
  PARTITION p2024 VALUES LESS THAN (2025),
  PARTITION p2025 VALUES LESS THAN (2026),
  PARTITION p2026 VALUES LESS THAN (2027),
  PARTITION pmax VALUES LESS THAN MAXVALUE
);

-- Partition daily_inventory_snapshots by year
ALTER TABLE daily_inventory_snapshots
PARTITION BY RANGE (YEAR(snapshotDate)) (
  PARTITION p2024 VALUES LESS THAN (2025),
  PARTITION p2025 VALUES LESS THAN (2026),
  PARTITION p2026 VALUES LESS THAN (2027),
  PARTITION pmax VALUES LESS THAN MAXVALUE
);
```

### **3. Materialized Views (for reporting)**

```sql
-- Monthly summary view (refresh daily at 00:30 WIB)
CREATE TABLE mv_monthly_summary (
  productCodeId INT,
  month_date DATE,
  month_opening DECIMAL(10,2),
  total_production DECIMAL(10,2),
  total_ordered DECIMAL(10,2),
  total_repacked DECIMAL(10,2),
  total_sampled DECIMAL(10,2),
  month_closing DECIMAL(10,2),
  avg_daily_stock DECIMAL(10,2),
  PRIMARY KEY (productCodeId, month_date),
  INDEX idx_month (month_date)
);

-- Refresh procedure (run at 00:30 WIB)
CREATE PROCEDURE refresh_monthly_summary()
BEGIN
  TRUNCATE mv_monthly_summary;

  INSERT INTO mv_monthly_summary
  SELECT
    productCodeId,
    DATE_FORMAT(snapshotDate, '%Y-%m-01') AS month_date,
    -- ... aggregation logic ...
  FROM daily_inventory_snapshots
  WHERE snapshotDate >= DATE_FORMAT(CURDATE(), '%Y-%m-01') - INTERVAL 12 MONTH
  GROUP BY productCodeId, month_date;
END;
```

---

## 🎯 Summary

### **Tables Created**

1. ✅ `daily_inventory` - Main table with reset columns
2. ✅ `daily_inventory_snapshots` - Historical records (1 year retention)
3. ✅ `inventory_transactions` - Enhanced transaction log
4. ✅ `repacking_records` - Repacking workflow tracking
5. ✅ `sample_tracking` - Sample management (optional)

### **Features Implemented**

✅ Daily reset at 00:00 WIB with cron job  
✅ Race condition handling with row-level locks  
✅ Automatic carry forward (stokAkhir → stokAwal)  
✅ Invoice integration (invoiceDate → dipesan)  
✅ Repacking workflow with loss tracking  
✅ Sample tracking with return capability  
✅ Stock adjustment for discrepancies  
✅ Historical comparison reporting  
✅ Partitioning for scalability  
✅ Rollback strategy with 1-month backup

### **Next Steps**

1. ✅ Review ERD and approve schema
2. ⏳ Create TypeORM migration files
3. ⏳ Update entity classes
4. ⏳ Implement cron job service
5. ⏳ Update service layer methods
6. ⏳ Test with sample data
7. ⏳ Frontend integration (columns.tsx)

---

**Last Updated**: January 15, 2025  
**Author**: Senior Database Administrator  
**Status**: 📋 Design Phase - Awaiting Approval
