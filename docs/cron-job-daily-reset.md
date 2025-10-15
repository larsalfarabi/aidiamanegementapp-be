# Daily Inventory Reset - Cron Job Documentation

## Overview

The Daily Inventory Reset service is a scheduled task that runs every day at **00:00 WIB (Western Indonesia Time)** to perform automated inventory reset operations.

**Created:** January 16, 2025  
**Status:** ✅ IMPLEMENTED  
**Service:** `DailyInventoryResetService`  
**Schedule:** `0 0 * * *` (Every day at midnight)  
**Timezone:** Asia/Jakarta (UTC+7)

---

## Purpose

The daily reset cron job automates three critical operations:

1. **Create Snapshots** - Archive yesterday's inventory data for historical reporting
2. **Carry Forward Stock** - Transfer ending stock (stokAkhir) to new day's opening stock (stokAwal)
3. **Reset Daily Columns** - Zero out daily transaction columns (barangMasuk, dipesan, barangOutRepack, barangOutSample)
4. **Cleanup Old Data** - Delete snapshots older than 1 year (365 days)

---

## Architecture

### Service Location

```
src/modules/inventory/services/daily-inventory-reset.service.ts
```

### Dependencies

- `@nestjs/schedule` - Cron job functionality
- `TypeORM` - Database operations with transactions
- `DailyInventory` entity - Main inventory table
- `DailyInventorySnapshots` entity - Historical snapshots

### Module Registration

The service is registered in `InventoryModule` and enabled via `ScheduleModule.forRoot()` in `AppModule`.

```typescript
// app.module.ts
@Module({
  imports: [
    ScheduleModule.forRoot(), // Enable cron jobs
    // ... other modules
  ],
})
export class AppModule {}
```

---

## Cron Schedule

### Schedule Configuration

```typescript
@Cron('0 0 * * *', {
  name: 'daily-inventory-reset',
  timeZone: 'Asia/Jakarta',
})
```

### Execution Time

- **Daily**: Every day
- **Time**: 00:00:00 WIB (midnight)
- **Timezone**: Asia/Jakarta (UTC+7)
- **Frequency**: Once per day

### Cron Expression Breakdown

```
0    0    *    *    *
│    │    │    │    │
│    │    │    │    └─── Day of week (0-7, Sunday=0/7)
│    │    │    └──────── Month (1-12)
│    │    └───────────── Day of month (1-31)
│    └────────────────── Hour (0-23)
└─────────────────────── Minute (0-59)
```

`0 0 * * *` = At 00:00 (midnight) every day

---

## Operation Flow

### High-Level Process

```
00:00 WIB
    │
    ├─► Step 1: Create Snapshots
    │   └─ Insert yesterday's data into daily_inventory_snapshots
    │
    ├─► Step 2: Carry Forward & Reset
    │   ├─ Lock yesterday's inventory records (FOR UPDATE)
    │   ├─ Create new records for today
    │   ├─ stokAwal (today) = stokAkhir (yesterday)
    │   └─ Reset: barangMasuk, dipesan, barangOutRepack, barangOutSample = 0
    │
    ├─► Step 3: Cleanup Old Snapshots
    │   └─ Delete snapshots older than 1 year
    │
    └─► Complete ✓
```

### Detailed Workflow

#### **Step 1: Create Daily Snapshots**

```sql
-- Insert snapshots from yesterday's daily_inventory
INSERT INTO daily_inventory_snapshots (
  snapshotDate,
  snapshotTime,
  productCodeId,
  stokAwal,
  barangMasuk,
  dipesan,
  barangOutRepack,
  barangOutSample,
  stokAkhir,
  createdAt
)
SELECT
  businessDate,
  CURRENT_TIME,
  productCodeId,
  stokAwal,
  barangMasuk,
  dipesan,
  barangOutRepack,
  barangOutSample,
  stokAkhir,
  CURRENT_TIMESTAMP
FROM daily_inventory
WHERE businessDate = ? -- yesterday
  AND isActive = 1
  AND deletedAt IS NULL
```

**Purpose**: Archive yesterday's complete inventory state for:

- Historical reporting
- Trend analysis
- Audit trail
- Data recovery

#### **Step 2: Carry Forward and Reset**

**Phase A: Lock Yesterday's Records**

```sql
SELECT
  productCodeId,
  stokAkhir,
  minimumStock,
  maximumStock,
  notes,
  createdBy,
  updatedBy
FROM daily_inventory
WHERE businessDate = ? -- yesterday
  AND isActive = 1
  AND deletedAt IS NULL
FOR UPDATE  -- Row-level lock prevents race conditions
```

**Phase B: Check for Duplicates**

```sql
SELECT COUNT(*) as count
FROM daily_inventory
WHERE businessDate = ? -- today
  AND deletedAt IS NULL
```

If count > 0, skip carry forward to prevent duplicate records.

**Phase C: Create Today's Records**

```sql
INSERT INTO daily_inventory (
  businessDate,
  productCodeId,
  stokAwal,        -- Carried forward!
  barangMasuk,     -- Reset to 0
  dipesan,         -- Reset to 0
  barangOutRepack, -- Reset to 0
  barangOutSample, -- Reset to 0
  -- stokAkhir is GENERATED COLUMN (auto-calculated)
  minimumStock,
  maximumStock,
  isActive,
  notes,
  createdBy,
  updatedBy
) VALUES (
  '2025-01-16',     -- today
  1,                -- productCodeId
  100.00,           -- stokAwal = yesterday's stokAkhir
  0,                -- barangMasuk (reset)
  0,                -- dipesan (reset)
  0,                -- barangOutRepack (reset)
  0,                -- barangOutSample (reset)
  50.00,            -- minimumStock
  500.00,           -- maximumStock
  1,                -- isActive
  NULL,             -- notes
  1,                -- createdBy
  1                 -- updatedBy
)
```

**Result**: Fresh inventory records for new business day with carried forward opening stock.

#### **Step 3: Cleanup Old Snapshots**

```sql
DELETE FROM daily_inventory_snapshots
WHERE snapshotDate < ? -- 1 year ago (CURDATE() - INTERVAL 1 YEAR)
```

**Purpose**: Maintain 1-year retention policy to:

- Prevent database bloat
- Optimize query performance
- Comply with data retention policies

---

## Race Condition Handling

### Problem

Multiple processes might attempt to:

- Read/write inventory simultaneously
- Execute reset multiple times
- Interfere with ongoing transactions

### Solution: Database Transaction + Row Locking

```typescript
// 1. Start transaction
await queryRunner.startTransaction();

try {
  // 2. Lock rows with SELECT ... FOR UPDATE
  const records = await queryRunner.query(
    `
    SELECT * FROM daily_inventory
    WHERE businessDate = ?
    FOR UPDATE  -- Exclusive lock until commit/rollback
  `,
    [date],
  );

  // 3. Perform operations
  await this.createSnapshots();
  await this.carryForward();
  await this.cleanup();

  // 4. Commit (releases locks)
  await queryRunner.commitTransaction();
} catch (error) {
  // 5. Rollback on error (releases locks)
  await queryRunner.rollbackTransaction();
}
```

### Retry Mechanism

**Exponential Backoff Strategy:**

- **Attempt 1**: Execute immediately
- **Attempt 2**: Wait 5 seconds, retry
- **Attempt 3**: Wait 15 seconds, retry
- **Attempt 4**: Wait 30 seconds, retry

```typescript
async executeResetWithRetry(maxRetries = 3) {
  const retryDelays = [5000, 15000, 30000];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await this.performDailyReset();
      return; // Success!
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await this.sleep(retryDelays[attempt]);
    }
  }
}
```

**Why Retry?**

- Deadlock resolution (MariaDB)
- Lock wait timeout recovery
- Temporary connection issues
- System resource contention

---

## Manual Operations

### Trigger Reset Manually

**Endpoint:** `POST /inventory/admin/trigger-reset`

**Use Cases:**

- Testing the reset process in development
- Recovery after system downtime
- Manual execution if cron job failed
- Debugging reset logic

**Request:**

```bash
curl -X POST http://localhost:3000/inventory/admin/trigger-reset \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**

```json
{
  "success": true,
  "message": "Daily reset completed successfully"
}
```

**Error Response:**

```json
{
  "success": false,
  "message": "Reset failed: Database transaction timeout"
}
```

### Check Reset Status

**Endpoint:** `GET /inventory/admin/reset-status`

**Request:**

```bash
curl -X GET http://localhost:3000/inventory/admin/reset-status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**

```json
{
  "enabled": true,
  "schedule": "0 0 * * * (Every day at 00:00 WIB)",
  "timezone": "Asia/Jakarta",
  "lastSnapshot": {
    "date": "2025-01-15",
    "time": "00:00:00",
    "productCount": 25
  },
  "nextRun": "2025-01-17T00:00:00.000Z"
}
```

---

## Logging

### Log Levels

**INFO**: Normal operations

```
🔄 Starting daily inventory reset at 00:00 WIB...
📅 Business Date: 2025-01-16
📅 Previous Business Date: 2025-01-15
📸 Creating snapshots for 2025-01-15...
✅ Created 25 snapshots for 2025-01-15
🔄 Carrying forward from 2025-01-15 to 2025-01-16...
📦 Found 25 products to carry forward
✅ Created 25 new inventory records for 2025-01-16
🧹 Cleaning up snapshots older than 1 year...
✅ Deleted 0 old snapshots (before 2024-01-16)
✅ Transaction committed successfully
✅ Daily inventory reset completed successfully in 1234ms
```

**WARN**: Recoverable issues

```
⚠️ No inventory records found for 2025-01-15. Skipping carry forward.
⚠️ Today's inventory records already exist (25 records). Skipping carry forward to prevent duplicates.
⚠️ Reset attempt 1 failed. Retrying in 5s...
```

**ERROR**: Failures

```
❌ Daily inventory reset failed after all retry attempts
❌ Transaction rolled back
Error: Lock wait timeout exceeded; try restarting transaction
```

### Log Locations

**Console Output** (NestJS Logger):

```bash
[DailyInventoryResetService] 🔄 Starting daily inventory reset...
```

**Database Logs** (if enabled):

```sql
-- General query log
SET GLOBAL general_log = 'ON';

-- Slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;
```

---

## Testing

### Development Testing

**1. Test Manual Trigger**

```bash
# Trigger reset manually
curl -X POST http://localhost:3000/inventory/admin/trigger-reset \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**2. Test with Mock Data**

```sql
-- Insert test inventory records
INSERT INTO daily_inventory (
  businessDate, productCodeId, stokAwal, barangMasuk,
  dipesan, barangOutRepack, barangOutSample, isActive
) VALUES
  ('2025-01-15', 1, 100, 50, 20, 10, 5, 1),
  ('2025-01-15', 2, 200, 30, 15, 0, 10, 1);

-- Verify stokAkhir calculation
SELECT
  productCodeId,
  stokAwal,
  barangMasuk,
  dipesan,
  barangOutRepack,
  barangOutSample,
  stokAkhir,
  (stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample) as calculated
FROM daily_inventory
WHERE businessDate = '2025-01-15';
```

**3. Verify Cron Schedule**

```bash
# Check if ScheduleModule is loaded
# Server logs should show:
[ScheduleModule] Initialized
[DailyInventoryResetService] Cron job 'daily-inventory-reset' registered
```

### Production Testing

**Pre-Go-Live Checklist:**

- [ ] Server timezone set to `Asia/Jakarta`
- [ ] Cron job registered in ScheduleModule
- [ ] Database timezone UTC+7 configured
- [ ] Initial inventory records created
- [ ] Alert system configured (email/Slack)
- [ ] Manual trigger tested successfully
- [ ] Retry mechanism tested with failures
- [ ] Snapshot retention verified (1 year)

**Monitoring:**

```bash
# Daily monitoring query
SELECT
  COUNT(*) as snapshot_count,
  MAX(snapshotDate) as last_snapshot_date,
  MIN(snapshotDate) as oldest_snapshot_date
FROM daily_inventory_snapshots;

# Verify today's records
SELECT
  COUNT(*) as record_count,
  SUM(stokAwal) as total_opening_stock,
  SUM(stokAkhir) as total_ending_stock
FROM daily_inventory
WHERE businessDate = CURDATE()
  AND isActive = 1
  AND deletedAt IS NULL;
```

---

## Troubleshooting

### Issue: Cron Job Not Running

**Symptoms:**

- No snapshots created
- Inventory not resetting
- No logs at 00:00 WIB

**Solutions:**

1. **Check ScheduleModule Registration**

```typescript
// app.module.ts
@Module({
  imports: [
    ScheduleModule.forRoot(), // ← Must be imported!
    // ...
  ],
})
```

2. **Verify Server Timezone**

```bash
# Linux
timedatectl
# or
date

# Should show: WIB (UTC+7)
```

3. **Check Service Registration**

```typescript
// inventory.module.ts
@Module({
  providers: [
    DailyInventoryResetService, // ← Must be in providers!
  ],
})
```

### Issue: Duplicate Records

**Symptoms:**

- Error: Duplicate entry for key 'IDX_daily_inventory_productCodeId_businessDate'
- Multiple records for same product + date

**Solutions:**

**Prevention** (already implemented):

```typescript
// Check before inserting
const existingCount = await queryRunner.query(
  `
  SELECT COUNT(*) as count
  FROM daily_inventory
  WHERE businessDate = ? AND deletedAt IS NULL
`,
  [today],
);

if (existingCount[0].count > 0) {
  logger.warn('Records already exist. Skipping...');
  return;
}
```

**Recovery:**

```sql
-- Find duplicates
SELECT
  businessDate,
  productCodeId,
  COUNT(*) as count
FROM daily_inventory
WHERE deletedAt IS NULL
GROUP BY businessDate, productCodeId
HAVING COUNT(*) > 1;

-- Keep only the latest record (soft delete others)
UPDATE daily_inventory di1
SET deletedAt = NOW()
WHERE EXISTS (
  SELECT 1 FROM daily_inventory di2
  WHERE di2.businessDate = di1.businessDate
    AND di2.productCodeId = di1.productCodeId
    AND di2.id > di1.id
    AND di2.deletedAt IS NULL
);
```

### Issue: Lock Wait Timeout

**Symptoms:**

```
Error: Lock wait timeout exceeded; try restarting transaction
```

**Causes:**

- Long-running transactions blocking reset
- Other processes accessing inventory
- Deadlock between transactions

**Solutions:**

1. **Increase Lock Timeout** (temporary):

```sql
SET GLOBAL innodb_lock_wait_timeout = 120; -- Default: 50 seconds
```

2. **Identify Blocking Transactions**:

```sql
-- MariaDB 10.5+
SELECT * FROM information_schema.innodb_trx;
SELECT * FROM information_schema.innodb_locks;
SELECT * FROM information_schema.innodb_lock_waits;

-- Kill blocking transaction
KILL <trx_mysql_thread_id>;
```

3. **Schedule Reset at Quiet Time**:

- Ensure 00:00 WIB is low-traffic period
- Avoid running batch jobs at midnight
- Pause background workers during reset

### Issue: Snapshot Count Mismatch

**Symptoms:**

- Fewer snapshots than inventory records
- Missing snapshots for some products

**Diagnosis:**

```sql
-- Count inventory vs snapshots
SELECT
  'Inventory' as source,
  businessDate,
  COUNT(*) as count
FROM daily_inventory
WHERE businessDate = '2025-01-15'
  AND isActive = 1
  AND deletedAt IS NULL
GROUP BY businessDate

UNION ALL

SELECT
  'Snapshots' as source,
  snapshotDate as businessDate,
  COUNT(*) as count
FROM daily_inventory_snapshots
WHERE snapshotDate = '2025-01-15'
GROUP BY snapshotDate;
```

**Recovery:**

```sql
-- Manually create missing snapshots
INSERT INTO daily_inventory_snapshots (
  snapshotDate,
  snapshotTime,
  productCodeId,
  stokAwal,
  barangMasuk,
  dipesan,
  barangOutRepack,
  barangOutSample,
  stokAkhir,
  createdAt
)
SELECT
  businessDate,
  '00:00:00',
  productCodeId,
  stokAwal,
  barangMasuk,
  dipesan,
  barangOutRepack,
  barangOutSample,
  stokAkhir,
  CURRENT_TIMESTAMP
FROM daily_inventory
WHERE businessDate = '2025-01-15'
  AND isActive = 1
  AND deletedAt IS NULL
  AND productCodeId NOT IN (
    SELECT productCodeId
    FROM daily_inventory_snapshots
    WHERE snapshotDate = '2025-01-15'
  );
```

---

## Performance Considerations

### Expected Performance

**Small Dataset** (< 100 products):

- Execution time: < 1 second
- Lock duration: < 500ms
- Memory usage: < 10MB

**Medium Dataset** (100-1000 products):

- Execution time: 1-5 seconds
- Lock duration: 1-2 seconds
- Memory usage: 10-50MB

**Large Dataset** (> 1000 products):

- Execution time: 5-30 seconds
- Lock duration: 2-10 seconds
- Memory usage: 50-200MB

### Optimization Tips

1. **Index Optimization**:

```sql
-- Ensure proper indexes exist
SHOW INDEX FROM daily_inventory;
SHOW INDEX FROM daily_inventory_snapshots;

-- Should have:
-- daily_inventory: (productCodeId, businessDate) UNIQUE
-- daily_inventory_snapshots: (productCodeId, snapshotDate)
```

2. **Batch Size Tuning**:

```typescript
// For large datasets, consider batching
const batchSize = 100;
for (let i = 0; i < products.length; i += batchSize) {
  const batch = products.slice(i, i + batchSize);
  await this.insertBatch(batch);
}
```

3. **Connection Pooling**:

```typescript
// typeorm.config.ts
{
  type: 'mariadb',
  poolSize: 20, // Increase for concurrent operations
  extra: {
    connectionLimit: 20,
  }
}
```

---

## Security Considerations

### Authorization

**Admin Endpoints:**

```typescript
// inventory.controller.ts
@Post('admin/trigger-reset')
@UseGuards(JwtGuard, RolesGuard) // Add role-based access
@Roles('ADMIN', 'SUPER_ADMIN') // Only admins can trigger
async triggerDailyReset() {
  return this.dailyResetService.triggerManualReset();
}
```

### Rate Limiting

```typescript
// Prevent abuse of manual trigger
@Throttle(1, 3600) // 1 request per hour
@Post('admin/trigger-reset')
async triggerDailyReset() {
  // ...
}
```

### Audit Trail

```typescript
// Log who triggered manual reset
async triggerManualReset(userId: number) {
  this.logger.log(`Manual reset triggered by user ${userId}`);
  // ... execute reset
}
```

---

## Maintenance

### Database Maintenance

**Weekly:**

```sql
-- Analyze tables for query optimization
ANALYZE TABLE daily_inventory;
ANALYZE TABLE daily_inventory_snapshots;

-- Check table sizes
SELECT
  table_name,
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
FROM information_schema.tables
WHERE table_schema = 'DB_Sales_Aidia'
  AND table_name IN ('daily_inventory', 'daily_inventory_snapshots')
ORDER BY size_mb DESC;
```

**Monthly:**

```sql
-- Optimize tables
OPTIMIZE TABLE daily_inventory;
OPTIMIZE TABLE daily_inventory_snapshots;
```

### Monitoring Queries

**Daily Health Check:**

```sql
-- Verify reset ran today
SELECT
  MAX(businessDate) as latest_inventory_date,
  CURDATE() as today,
  CASE
    WHEN MAX(businessDate) = CURDATE() THEN 'OK ✓'
    ELSE 'MISSING! ✗'
  END as status
FROM daily_inventory
WHERE deletedAt IS NULL;
```

**Snapshot Audit:**

```sql
-- Count snapshots per date
SELECT
  snapshotDate,
  COUNT(*) as snapshot_count,
  COUNT(DISTINCT productCodeId) as unique_products
FROM daily_inventory_snapshots
GROUP BY snapshotDate
ORDER BY snapshotDate DESC
LIMIT 30;
```

---

## Future Enhancements

### Planned Improvements

1. **Alert Notifications**
   - Email/Slack notification on failure
   - Daily summary report
   - Low stock warnings

2. **Metrics Dashboard**
   - Reset execution time trends
   - Success/failure rate
   - Database lock duration

3. **Multi-Tenant Support**
   - Reset per warehouse/location
   - Different schedules per tenant

4. **Rollback Capability**
   - Undo reset if errors detected
   - Restore from snapshot

5. **Partial Reset**
   - Reset specific products only
   - Skip certain product categories

---

## References

- **NestJS Schedule Documentation**: https://docs.nestjs.com/techniques/task-scheduling
- **Cron Expression Guide**: https://crontab.guru/
- **MariaDB Transactions**: https://mariadb.com/kb/en/transactions/
- **TypeORM Transactions**: https://typeorm.io/transactions

---

**Document Version:** 1.0  
**Last Updated:** January 16, 2025  
**Author:** GitHub Copilot
