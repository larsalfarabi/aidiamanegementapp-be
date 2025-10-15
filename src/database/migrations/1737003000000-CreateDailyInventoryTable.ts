import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration: Create Daily Inventory Table
 *
 * Purpose: Create new daily_inventory table with reset columns
 *
 * Schema Design:
 * - One row per product per business day
 * - Reset columns: barangMasuk, dipesan, barangOutRepack, barangOutSample
 * - Calculated column: stokAkhir (GENERATED ALWAYS AS)
 * - Daily snapshot approach for simple querying
 *
 * Key Features:
 * - Virtual computed column for stokAkhir (always up-to-date)
 * - Unique index on (productCodeId, businessDate)
 * - Foreign key to product_codes
 *
 * Created: 2025-01-15
 */
export class CreateDailyInventoryTable1737003000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('📋 Creating daily_inventory table...');

    // Drop if exists (safety)
    await queryRunner.query(`DROP TABLE IF EXISTS daily_inventory`);

    // Create table using raw SQL for MariaDB compatibility with GENERATED COLUMN
    await queryRunner.query(`
      CREATE TABLE daily_inventory (
        id INT NOT NULL AUTO_INCREMENT,
        businessDate DATE NOT NULL COMMENT 'Business date for this inventory record (YYYY-MM-DD)',
        productCodeId INT NOT NULL COMMENT 'Foreign key to product_codes table',
        stokAwal DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Opening stock (carried forward from previous day stokAkhir)',
        barangMasuk DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Incoming stock (production, returns, repacking in) - RESET DAILY',
        dipesan DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Ordered/sold quantity (from invoices) - RESET DAILY',
        barangOutRepack DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Outgoing for repacking (source product) - RESET DAILY',
        barangOutSample DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'Sample giveaways - RESET DAILY',
        stokAkhir DECIMAL(10,2) GENERATED ALWAYS AS (stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample) STORED COMMENT 'Ending stock (GENERATED COLUMN)',
        isActive TINYINT(1) NOT NULL DEFAULT 1,
        notes TEXT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deletedAt TIMESTAMP NULL,
        createdBy INT NULL,
        updatedBy INT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB;
    `);

    // Create Foreign Key to product_codes
    await queryRunner.query(`
      ALTER TABLE daily_inventory
      ADD CONSTRAINT FK_daily_inventory_productCodeId
      FOREIGN KEY (productCodeId) REFERENCES product_codes(id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
    `);

    // Create Foreign Keys to users (for audit)
    await queryRunner.query(`
      ALTER TABLE daily_inventory
      ADD CONSTRAINT FK_daily_inventory_createdBy
      FOREIGN KEY (createdBy) REFERENCES users(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    await queryRunner.query(`
      ALTER TABLE daily_inventory
      ADD CONSTRAINT FK_daily_inventory_updatedBy
      FOREIGN KEY (updatedBy) REFERENCES users(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    `);

    // Create Unique Index (one row per product per day)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IDX_daily_inventory_productCodeId_businessDate
      ON daily_inventory (productCodeId, businessDate);
    `);

    // Create Index for date queries
    await queryRunner.query(`
      CREATE INDEX IDX_daily_inventory_businessDate
      ON daily_inventory (businessDate);
    `);

    // Create Index for active records
    await queryRunner.query(`
      CREATE INDEX IDX_daily_inventory_isActive
      ON daily_inventory (isActive);
    `);

    console.log('✅ daily_inventory table created with:');
    console.log('   - Virtual computed column: stokAkhir');
    console.log('   - Unique constraint: (productCodeId, businessDate)');
    console.log('   - Foreign keys: productCodeId, createdBy, updatedBy');
    console.log('   - Indexes: businessDate, isActive');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('⏪ Dropping daily_inventory table...');

    await queryRunner.query(`DROP TABLE IF EXISTS daily_inventory`);

    console.log('⏪ daily_inventory table dropped');
  }
}
