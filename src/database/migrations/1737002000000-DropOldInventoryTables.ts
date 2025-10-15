import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Drop Old Inventory Tables
 *
 * Purpose: Remove old inventory structure to make way for new daily inventory system
 *
 * ⚠️ WARNING: This is a destructive operation!
 * ⚠️ Ensure backup migration (1737001000000-BackupInventoryTables) was run successfully
 * ⚠️ Backup tables are retained for rollback purposes
 *
 * Tables to drop:
 * - inventory (old structure with quantityOnHand, quantityReserved, quantityAvailable)
 * - inventory_transactions (old transaction structure)
 * - inventory_daily_snapshots (if exists)
 *
 * Created: 2025-01-15
 */
export class DropOldInventoryTables1737002000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('🗑️  Starting to drop old inventory tables...');

    // Drop in reverse order of dependencies

    // 1. Drop inventory_daily_snapshots if exists
    const hasSnapshotsTable = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventory_daily_snapshots';
    `);

    if (hasSnapshotsTable[0].count > 0) {
      await queryRunner.query(`DROP TABLE IF EXISTS inventory_daily_snapshots`);
      console.log('✅ Dropped inventory_daily_snapshots table');
    }

    // 2. Drop inventory_transactions (has FK to inventory)
    await queryRunner.query(`DROP TABLE IF EXISTS inventory_transactions`);
    console.log('✅ Dropped inventory_transactions table');

    // 3. Drop inventory (parent table)
    await queryRunner.query(`DROP TABLE IF EXISTS inventory`);
    console.log('✅ Dropped inventory table');

    console.log('🗑️  Old inventory tables dropped successfully!');
    console.log('📌 Backup tables are still available for rollback');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log(
      '⏪ Rolling back: Recreating old inventory tables from backup...',
    );

    const backupDate = '20250115';

    // Restore inventory table
    await queryRunner.query(`
      CREATE TABLE inventory AS
      SELECT * FROM inventory_backup_${backupDate};
    `);
    console.log('✅ Restored inventory table from backup');

    // Restore inventory_transactions table
    await queryRunner.query(`
      CREATE TABLE inventory_transactions AS
      SELECT * FROM inventory_transactions_backup_${backupDate};
    `);
    console.log('✅ Restored inventory_transactions table from backup');

    // Restore inventory_daily_snapshots if backup exists
    const hasBackup = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'inventory_daily_snapshots_backup_${backupDate}';
    `);

    if (hasBackup[0].count > 0) {
      await queryRunner.query(`
        CREATE TABLE inventory_daily_snapshots AS
        SELECT * FROM inventory_daily_snapshots_backup_${backupDate};
      `);
      console.log('✅ Restored inventory_daily_snapshots table from backup');
    }

    console.log('⏪ Old inventory tables restored from backup');
    console.log(
      '⚠️  Note: You may need to recreate indexes and foreign keys manually',
    );
  }
}
