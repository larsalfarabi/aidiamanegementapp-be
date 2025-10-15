import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration: Create Daily Inventory Snapshots Table
 *
 * Purpose: Store historical daily inventory snapshots for reporting
 *
 * Schema Design:
 * - Automatic snapshot creation every midnight (via cron job)
 * - 1-year retention policy (auto-cleanup old snapshots)
 * - Partitioned by year for performance
 * - Read-only table (insert only, no updates)
 *
 * Use Cases:
 * - Historical comparison reports
 * - Month-end closing verification
 * - Audit trail for stock movements
 * - Rollback recovery
 *
 * Created: 2025-01-15
 */
export class CreateDailyInventorySnapshotsTable1737004000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('📸 Creating daily_inventory_snapshots table...');

    // Drop if exists (safety for failed migrations)
    await queryRunner.query(`DROP TABLE IF EXISTS daily_inventory_snapshots`);

    await queryRunner.createTable(
      new Table({
        name: 'daily_inventory_snapshots',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          // Snapshot Metadata
          {
            name: 'snapshotDate',
            type: 'date',
            comment: 'Date of snapshot (business date)',
          },
          {
            name: 'snapshotTime',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            comment: 'Exact time when snapshot was taken',
          },
          // Product Reference
          {
            name: 'productCodeId',
            type: 'int',
            comment: 'Foreign key to product_codes table',
          },
          // Stock Values (snapshot of daily_inventory at midnight)
          {
            name: 'stokAwal',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            comment: 'Opening stock for the day',
          },
          {
            name: 'barangMasuk',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            comment: 'Total incoming stock for the day',
          },
          {
            name: 'dipesan',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            comment: 'Total ordered/sold quantity for the day',
          },
          {
            name: 'barangOutRepack',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            comment: 'Total outgoing for repacking for the day',
          },
          {
            name: 'barangOutSample',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
            comment: 'Total sample giveaways for the day',
          },
          {
            name: 'stokAkhir',
            type: 'decimal',
            precision: 10,
            scale: 2,
            comment: 'Ending stock (calculated at snapshot time)',
          },
          // Audit
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create Foreign Key to product_codes
    await queryRunner.query(`
      ALTER TABLE daily_inventory_snapshots
      ADD CONSTRAINT FK_daily_inventory_snapshots_productCodeId
      FOREIGN KEY (productCodeId) REFERENCES product_codes(id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
    `);

    // Create Indexes for fast queries
    await queryRunner.createIndex(
      'daily_inventory_snapshots',
      new TableIndex({
        name: 'IDX_snapshots_productCodeId_snapshotDate',
        columnNames: ['productCodeId', 'snapshotDate'],
      }),
    );

    await queryRunner.createIndex(
      'daily_inventory_snapshots',
      new TableIndex({
        name: 'IDX_snapshots_snapshotDate',
        columnNames: ['snapshotDate'],
      }),
    );

    // Create partition by year (for large datasets)
    // Note: MariaDB doesn't support partitioning on tables with foreign keys
    // Skipping partitioning - can be added later if needed without FK
    const mysqlVersion = await queryRunner.query(`SELECT VERSION() as version`);
    const version = mysqlVersion[0].version;

    console.log(`📌 MySQL Version: ${version}`);
    console.log(
      '⚠️  Partitioning skipped (MariaDB limitation with foreign keys)',
    );
    console.log(
      '   - Can be added later by removing FK, partitioning, then re-adding FK',
    );

    console.log('✅ daily_inventory_snapshots table created with:');
    console.log('   - Foreign key: productCodeId');
    console.log('   - Indexes: (productCodeId, snapshotDate), snapshotDate');
    console.log('   - Retention: 1 year (cleanup via cron job)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('⏪ Dropping daily_inventory_snapshots table...');

    await queryRunner.dropTable('daily_inventory_snapshots', true);

    console.log('⏪ daily_inventory_snapshots table dropped');
  }
}
