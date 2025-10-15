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
      // Execute reset with retry mechanism
      await this.executeResetWithRetry();

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
  private async executeResetWithRetry(maxRetries: number = 3): Promise<void> {
    const retryDelays = [5000, 15000, 30000]; // 5s, 15s, 30s

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.performDailyReset();
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
   */
  private async performDailyReset(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const today = new Date();
      const businessDate = this.formatDate(today);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const previousBusinessDate = this.formatDate(yesterday);

      this.logger.log(`📅 Business Date: ${businessDate}`);
      this.logger.log(`📅 Previous Business Date: ${previousBusinessDate}`);

      // Step 1: Create snapshots for yesterday's data
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

    // Insert snapshots from yesterday's daily_inventory
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
   * Utility: Format date to YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
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
      await this.executeResetWithRetry();
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
    const lastSnapshot = await this.snapshotsRepo.findOne({
      order: { snapshotDate: 'DESC', createdAt: 'DESC' },
      relations: ['productCode'],
    });

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
}
