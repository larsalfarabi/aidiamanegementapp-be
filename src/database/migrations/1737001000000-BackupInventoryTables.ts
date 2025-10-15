import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Backup Existing Inventory Tables
 *
 * Purpose: Create backup of existing inventory data before restructuring
 * Retention: Last 30 days of data for safety
 *
 * Tables backed up:
 * - inventory → inventory_backup_20250115
 * - inventory_transactions → inventory_transactions_backup_20250115
 * - inventory_daily_snapshots → inventory_daily_snapshots_backup_20250115
 *
 * Created: 2025-01-15
 */
export class BackupInventoryTables1737001000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const backupDate = '20250115';

    console.log('📦 Starting backup of existing inventory tables...');

    // 1. Backup inventory table (all active records)
    await queryRunner.query(`
      CREATE TABLE inventory_backup_${backupDate} AS
      SELECT * FROM inventory
      WHERE isActive = 1;
    `);
    console.log(
      `✅ Backed up inventory table → inventory_backup_${backupDate}`,
    );

    // 2. Backup inventory_transactions (last 30 days)
    await queryRunner.query(`
      CREATE TABLE inventory_transactions_backup_${backupDate} AS
      SELECT * FROM inventory_transactions
      WHERE transactionDate >= CURDATE() - INTERVAL 30 DAY;
    `);
    console.log(
      `✅ Backed up inventory_transactions (last 30 days) → inventory_transactions_backup_${backupDate}`,
    );

    // 3. Backup inventory_daily_snapshots if exists (last 30 days)
    const hasSnapshotsTable = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventory_daily_snapshots';
    `);

    if (hasSnapshotsTable[0].count > 0) {
      await queryRunner.query(`
        CREATE TABLE inventory_daily_snapshots_backup_${backupDate} AS
        SELECT * FROM inventory_daily_snapshots
        WHERE snapshotDate >= CURDATE() - INTERVAL 30 DAY;
      `);
      console.log(
        `✅ Backed up inventory_daily_snapshots (last 30 days) → inventory_daily_snapshots_backup_${backupDate}`,
      );
    }

    console.log('📦 Backup completed successfully!');
    console.log(`⚠️  Backup tables will be kept for manual verification`);
    console.log(
      `⚠️  Remember to drop backup tables after confirming new system works`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const backupDate = '20250115';

    console.log('⏪ Rolling back: Dropping backup tables...');

    // Drop backup tables
    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory_backup_${backupDate}`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory_transactions_backup_${backupDate}`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS inventory_daily_snapshots_backup_${backupDate}`,
    );

    console.log('⏪ Backup tables dropped');
  }
}
