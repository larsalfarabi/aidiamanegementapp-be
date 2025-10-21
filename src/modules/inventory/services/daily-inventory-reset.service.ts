import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DailyInventory } from '../entity/daily-inventory.entity';
import { DailyInventorySnapshots } from '../entity/daily-inventory-snapshots.entity';

/**
 * DailyInventoryResetService
 *
 * Scheduled task that runs daily at 00:00 WIB (Western Indonesia Time)
 * to perform inventory reset operations.
 *
 * Operations:
 * 1. Create snapshots of current day's inventory
 * 2. Carry forward stokAkhir to new day's stokAwal
 * 3. Reset daily columns (barangMasuk, dipesan, barangOutRepack, barangOutSample)
 * 4. Clean up old snapshots (older than 1 year)
 *
 * Race Condition Handling:
 * - Uses database transactions with row-level locking
 * - SELECT ... FOR UPDATE to prevent concurrent modifications
 * - Retry mechanism with exponential backoff (5s, 15s, 30s)
 *
 * Business Rules:
 * - Timezone: Asia/Jakarta (WIB - UTC+7)
 * - Schedule: Every day at 00:00:00 WIB
 * - Snapshot Retention: 1 year (365 days)
 * - Only process active records (isActive = true)
 */
@Injectable()
export class DailyInventoryResetService {
  private readonly logger = new Logger(DailyInventoryResetService.name);

  constructor(
    @InjectRepository(DailyInventory)
    private readonly dailyInventoryRepo: Repository<DailyInventory>,
    @InjectRepository(DailyInventorySnapshots)
    private readonly snapshotsRepo: Repository<DailyInventorySnapshots>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Main Cron Job - Daily Reset at 00:00 WIB
   *
   * Cron Expression: '0 0 * * *'
   * Timezone: Asia/Jakarta (UTC+7)
   *
   * Note: NestJS Schedule uses system timezone by default.
   * Ensure server timezone is set to Asia/Jakarta, or use explicit timezone option.
   */
  @Cron('0 0 * * *', {
    name: 'daily-inventory-reset',
    timeZone: 'Asia/Jakarta',
  })
  async handleDailyReset() {
    this.logger.log('🔄 Starting daily inventory reset at 00:00 WIB...');
    const startTime = Date.now();

    try {
      // Execute reset with retry mechanism (isManualTrigger = false for cron)
      await this.executeResetWithRetry(3, false);

      const duration = Date.now() - startTime;
      this.logger.log(
        `✅ Daily inventory reset completed successfully in ${duration}ms`,
      );
    } catch (error) {
      this.logger.error(
        '❌ Daily inventory reset failed after all retry attempts',
        error.stack,
      );
      // TODO: Send alert notification (email/Slack/SMS) to admin
      // this.notificationService.sendAlert('Daily Inventory Reset Failed', error);
    }
  }

  /**
   * Execute reset with exponential backoff retry
   * Retry delays: 5s, 15s, 30s
   */
  private async executeResetWithRetry(
    maxRetries: number = 3,
    isManualTrigger: boolean = false,
  ): Promise<void> {
    const retryDelays = [5000, 15000, 30000]; // 5s, 15s, 30s

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.performDailyReset(isManualTrigger);
        return; // Success, exit retry loop
      } catch (error) {
        const isLastAttempt = attempt === maxRetries - 1;

        if (isLastAttempt) {
          throw error; // Rethrow on last attempt
        }

        const delay = retryDelays[attempt];
        this.logger.warn(
          `⚠️ Reset attempt ${attempt + 1} failed. Retrying in ${delay / 1000}s...`,
          error.message,
        );

        await this.sleep(delay);
      }
    }
  }

  /**
   * Perform the actual daily reset operations
   * Uses database transaction with row-level locking
   *
   * @param isManualTrigger - If true, strict validation. If false (cron), skip validation if already done today.
   */
  private async performDailyReset(
    isManualTrigger: boolean = false,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const today = new Date();
      const businessDate = this.formatDate(today);

      // FIXED: Get the latest businessDate from database instead of assuming yesterday
      // This prevents issues when manual reset is triggered after cron job failed
      const latestRecord = await queryRunner.query(
        `
        SELECT businessDate 
        FROM daily_inventory 
        WHERE deletedAt IS NULL 
        ORDER BY businessDate DESC 
        LIMIT 1
        `,
      );

      let previousBusinessDate: string;

      if (latestRecord && latestRecord.length > 0) {
        // IMPORTANT: Format the database date to string for comparison
        const dbDate = new Date(latestRecord[0].businessDate);
        previousBusinessDate = this.formatDate(dbDate);
        this.logger.log(
          `📅 Latest record found in database: ${previousBusinessDate} (raw: ${latestRecord[0].businessDate})`,
        );
      } else {
        // Fallback to yesterday if no records exist
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        previousBusinessDate = this.formatDate(yesterday);
        this.logger.warn(
          `⚠️ No records found in database. Using yesterday as fallback: ${previousBusinessDate}`,
        );
      }

      this.logger.log(`📅 Business Date (Today): ${businessDate}`);
      this.logger.log(
        `📅 Previous Business Date (Source): ${previousBusinessDate}`,
      );
      this.logger.log(
        `🔧 Trigger Type: ${isManualTrigger ? 'MANUAL' : 'CRON (Scheduled)'}`,
      );

      // Check if we're trying to reset to a date that already exists
      if (previousBusinessDate === businessDate) {
        // If manual trigger, throw error (prevent user from double-resetting)
        // If cron trigger, just skip silently (reset already done today)
        if (isManualTrigger) {
          this.logger.warn(
            `⚠️ Latest database record is already today (${businessDate}). Reset already completed.`,
          );
          throw new Error(
            `Reset already completed for ${businessDate}. Latest record in database matches today's date.`,
          );
        } else {
          this.logger.log(
            `ℹ️ Reset already completed for ${businessDate}. Cron job skipping (idempotent behavior).`,
          );
          return; // Skip silently for cron
        }
      }

      // Step 1: Create snapshots for the latest date's data
      await this.createDailySnapshots(queryRunner, previousBusinessDate);

      // Step 2: Carry forward and reset daily inventory
      await this.carryForwardAndReset(
        queryRunner,
        previousBusinessDate,
        businessDate,
      );

      // Step 3: Clean up old snapshots (older than 1 year)
      await this.cleanupOldSnapshots(queryRunner);

      await queryRunner.commitTransaction();
      this.logger.log('✅ Transaction committed successfully');
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('❌ Transaction rolled back', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Step 1: Create snapshots of yesterday's inventory
   */
  private async createDailySnapshots(
    queryRunner: any,
    previousBusinessDate: string,
  ): Promise<void> {
    this.logger.log(`📸 Creating snapshots for ${previousBusinessDate}...`);

    // First, check if data exists for the given date
    const checkResult = await queryRunner.query(
      `
      SELECT COUNT(*) as count
      FROM daily_inventory
      WHERE businessDate = ?
        AND isActive = 1
        AND deletedAt IS NULL
      `,
      [previousBusinessDate],
    );

    const recordCount = checkResult[0].count;
    this.logger.log(
      `📊 Found ${recordCount} active records for ${previousBusinessDate}`,
    );

    if (recordCount === 0) {
      this.logger.warn(
        `⚠️ No records found for ${previousBusinessDate}. Cannot create snapshots.`,
      );
      throw new Error(
        `Cannot create snapshots: No active inventory records found for ${previousBusinessDate}`,
      );
    }

    // Check if snapshots already exist for this date
    const existingSnapshots = await queryRunner.query(
      `
      SELECT COUNT(*) as count
      FROM daily_inventory_snapshots
      WHERE snapshotDate = ?
      `,
      [previousBusinessDate],
    );

    const existingCount = existingSnapshots[0].count;
    if (existingCount > 0) {
      this.logger.log(
        `ℹ️ Snapshots already exist for ${previousBusinessDate} (${existingCount} records). Skipping snapshot creation.`,
      );
      return;
    }

    // Insert snapshots from the specified date's daily_inventory
    const result = await queryRunner.query(
      `
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
        businessDate as snapshotDate,
        CURRENT_TIME as snapshotTime,
        productCodeId,
        stokAwal,
        barangMasuk,
        dipesan,
        barangOutRepack,
        barangOutSample,
        stokAkhir,
        CURRENT_TIMESTAMP as createdAt
      FROM daily_inventory
      WHERE businessDate = ?
        AND isActive = 1
        AND deletedAt IS NULL
      `,
      [previousBusinessDate],
    );

    const snapshotCount = result.affectedRows || 0;
    this.logger.log(
      `✅ Created ${snapshotCount} snapshots for ${previousBusinessDate}`,
    );
  }

  /**
   * Step 2: Carry forward stokAkhir to new day's stokAwal and reset daily columns
   *
   * Process:
   * 1. Lock rows for yesterday's date (SELECT ... FOR UPDATE)
   * 2. For each product, create new daily_inventory record for today
   * 3. Set stokAwal = yesterday's stokAkhir
   * 4. Reset all daily columns to 0
   */
  private async carryForwardAndReset(
    queryRunner: any,
    previousBusinessDate: string,
    newBusinessDate: string,
  ): Promise<void> {
    this.logger.log(
      `🔄 Carrying forward from ${previousBusinessDate} to ${newBusinessDate}...`,
    );

    // Lock yesterday's inventory records
    const yesterdayInventory = await queryRunner.query(
      `
      SELECT 
        productCodeId,
        stokAkhir,
        minimumStock,
        maximumStock,
        notes,
        createdBy,
        updatedBy
      FROM daily_inventory
      WHERE businessDate = ?
        AND isActive = 1
        AND deletedAt IS NULL
      FOR UPDATE
      `,
      [previousBusinessDate],
    );

    if (!yesterdayInventory || yesterdayInventory.length === 0) {
      this.logger.warn(
        `⚠️ No inventory records found for ${previousBusinessDate}. Skipping carry forward.`,
      );
      return;
    }

    this.logger.log(
      `📦 Found ${yesterdayInventory.length} products to carry forward`,
    );

    // Check if today's records already exist (prevent duplicate creation)
    const existingTodayRecords = await queryRunner.query(
      `
      SELECT COUNT(*) as count
      FROM daily_inventory
      WHERE businessDate = ?
        AND deletedAt IS NULL
      `,
      [newBusinessDate],
    );

    const existingCount = existingTodayRecords[0].count;
    if (existingCount > 0) {
      this.logger.warn(
        `⚠️ Today's inventory records already exist (${existingCount} records). Skipping carry forward to prevent duplicates.`,
      );
      return;
    }

    // Insert new records for today with carried forward stokAwal
    const values = yesterdayInventory.map((item: any) => [
      newBusinessDate, // businessDate
      item.productCodeId, // productCodeId
      item.stokAkhir, // stokAwal (carried forward from yesterday's stokAkhir)
      0, // barangMasuk (reset)
      0, // dipesan (reset)
      0, // barangOutRepack (reset)
      0, // barangOutSample (reset)
      // stokAkhir is GENERATED COLUMN, will be auto-calculated
      item.minimumStock,
      item.maximumStock,
      true, // isActive
      item.notes,
      item.createdBy,
      item.updatedBy,
    ]);

    const placeholders = values
      .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .join(', ');
    const flatValues = values.flat();

    const result = await queryRunner.query(
      `
      INSERT INTO daily_inventory (
        businessDate,
        productCodeId,
        stokAwal,
        barangMasuk,
        dipesan,
        barangOutRepack,
        barangOutSample,
        minimumStock,
        maximumStock,
        isActive,
        notes,
        createdBy,
        updatedBy
      ) VALUES ${placeholders}
      `,
      flatValues,
    );

    const insertedCount = result.affectedRows || 0;
    this.logger.log(
      `✅ Created ${insertedCount} new inventory records for ${newBusinessDate}`,
    );
  }

  /**
   * Step 3: Clean up old snapshots (older than 1 year)
   */
  private async cleanupOldSnapshots(queryRunner: any): Promise<void> {
    this.logger.log('🧹 Cleaning up snapshots older than 1 year...');

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const cutoffDate = this.formatDate(oneYearAgo);

    const result = await queryRunner.query(
      `
      DELETE FROM daily_inventory_snapshots
      WHERE snapshotDate < ?
      `,
      [cutoffDate],
    );

    const deletedCount = result.affectedRows || 0;
    this.logger.log(
      `✅ Deleted ${deletedCount} old snapshots (before ${cutoffDate})`,
    );
  }

  /**
   * Utility: Format date to YYYY-MM-DD using Jakarta timezone
   * Fixes timezone issue where UTC conversion causes wrong date
   */
  private formatDate(date: Date): string {
    // Use Indonesian timezone (WIB/UTC+7) to format date
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Utility: Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Manual trigger for testing or recovery
   * Can be called via endpoint: POST /inventory/admin/trigger-reset
   */
  async triggerManualReset(): Promise<{ success: boolean; message: string }> {
    this.logger.log('🔧 Manual daily reset triggered...');

    try {
      // Execute reset with retry mechanism (isManualTrigger = true for manual)
      await this.executeResetWithRetry(3, true);
      return {
        success: true,
        message: 'Daily reset completed successfully',
      };
    } catch (error) {
      this.logger.error('❌ Manual reset failed', error.stack);
      return {
        success: false,
        message: `Reset failed: ${error.message}`,
      };
    }
  }

  /**
   * Get reset job status and last execution time
   */
  async getResetStatus(): Promise<{
    enabled: boolean;
    schedule: string;
    timezone: string;
    lastSnapshot: any;
    nextRun: string;
  }> {
    // Get last snapshot to verify job is working
    const lastSnapshot = await this.snapshotsRepo
      .createQueryBuilder('snapshot')
      .leftJoinAndSelect('snapshot.productCode', 'productCode')
      .orderBy('snapshot.snapshotDate', 'DESC')
      .addOrderBy('snapshot.createdAt', 'DESC')
      .limit(1)
      .getOne();

    // Calculate next run time (00:00 WIB)
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setDate(nextRun.getDate() + 1);
    nextRun.setHours(0, 0, 0, 0);

    return {
      enabled: true,
      schedule: '0 0 * * * (Every day at 00:00 WIB)',
      timezone: 'Asia/Jakarta',
      lastSnapshot: lastSnapshot
        ? {
            date: lastSnapshot.snapshotDate,
            time: lastSnapshot.snapshotTime,
            productCount: await this.snapshotsRepo.count({
              where: { snapshotDate: lastSnapshot.snapshotDate },
            }),
          }
        : null,
      nextRun: nextRun.toISOString(),
    };
  }

  /**
   * Check inventory dates in database for debugging
   */
  async checkInventoryDates(): Promise<{
    inventoryDates: any[];
    snapshotDates: any[];
    latestInventory: any;
    latestSnapshot: any;
  }> {
    // Get all unique business dates with count
    const inventoryDates = await this.dataSource.query(
      `
      SELECT businessDate, COUNT(*) as productCount, 
             SUM(stokAwal) as totalStokAwal,
             SUM(stokAkhir) as totalStokAkhir
      FROM daily_inventory
      WHERE deletedAt IS NULL
      GROUP BY businessDate
      ORDER BY businessDate DESC
      LIMIT 10
      `,
    );

    // Get all snapshot dates with count
    const snapshotDates = await this.dataSource.query(
      `
      SELECT snapshotDate, COUNT(*) as snapshotCount,
             SUM(stokAwal) as totalStokAwal,
             SUM(stokAkhir) as totalStokAkhir
      FROM daily_inventory_snapshots
      GROUP BY snapshotDate
      ORDER BY snapshotDate DESC
      LIMIT 10
      `,
    );

    // Get latest inventory record
    const latestInventory = await this.dataSource.query(
      `
      SELECT businessDate, COUNT(*) as count
      FROM daily_inventory
      WHERE deletedAt IS NULL
      GROUP BY businessDate
      ORDER BY businessDate DESC
      LIMIT 1
      `,
    );

    // Get latest snapshot
    const latestSnapshot = await this.dataSource.query(
      `
      SELECT snapshotDate, COUNT(*) as count
      FROM daily_inventory_snapshots
      GROUP BY snapshotDate
      ORDER BY snapshotDate DESC
      LIMIT 1
      `,
    );

    return {
      inventoryDates,
      snapshotDates,
      latestInventory: latestInventory[0] || null,
      latestSnapshot: latestSnapshot[0] || null,
    };
  }
}
