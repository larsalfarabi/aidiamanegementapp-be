import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Increase decimal scale from 2 → 4 for inventory & production tables
 *
 * Reason:
 * formula_materials.rumus uses DECIMAL(22,10), but downstream tables
 * (daily_inventory, inventory_transactions, production_batches) only use
 * DECIMAL(10,2). This causes precision loss when recording small-batch
 * production with fractional formula values.
 *
 * Affected Tables:
 * - daily_inventory (7 stock columns + 2 threshold columns + 1 generated)
 * - daily_inventory_snapshots (7 stock columns)
 * - inventory_transactions (2 columns)
 * - production_batches (7 quantity columns)
 * - production_bottling_output (2 columns, scale 3 → 4)
 *
 * Data Safety:
 * ALTER COLUMN from DECIMAL(10,2) to DECIMAL(10,4) only adds decimal places.
 * Existing values like 12.50 become 12.5000 — no data loss.
 */
export class IncreaseDecimalScale1740100163000 implements MigrationInterface {
  name = 'IncreaseDecimalScale1740100163000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // 1. daily_inventory — stock columns
    // ============================================
    await queryRunner.query(`
      ALTER TABLE \`daily_inventory\`
        MODIFY COLUMN \`stokAwal\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangMasuk\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`dipesan\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangOutRepack\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangOutSample\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangOutProduksi\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`minimumStock\` DECIMAL(10,4) NULL,
        MODIFY COLUMN \`maximumStock\` DECIMAL(10,4) NULL
    `);

    // Special handling for GENERATED column — must drop and recreate
    await queryRunner.query(`
      ALTER TABLE \`daily_inventory\`
        DROP COLUMN \`stokAkhir\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`daily_inventory\`
        ADD COLUMN \`stokAkhir\` DECIMAL(10,4) GENERATED ALWAYS AS
          (stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample - barangOutProduksi) STORED
          COMMENT 'Ending stock (GENERATED COLUMN - includes production material out)'
    `);

    // ============================================
    // 2. daily_inventory_snapshots — stock columns
    // ============================================
    await queryRunner.query(`
      ALTER TABLE \`daily_inventory_snapshots\`
        MODIFY COLUMN \`stokAwal\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangMasuk\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`dipesan\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangOutRepack\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangOutSample\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangOutProduksi\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`stokAkhir\` DECIMAL(10,4) NOT NULL DEFAULT 0
    `);

    // ============================================
    // 3. inventory_transactions
    // ============================================
    await queryRunner.query(`
      ALTER TABLE \`inventory_transactions\`
        MODIFY COLUMN \`quantity\` DECIMAL(10,4) NOT NULL,
        MODIFY COLUMN \`balanceAfter\` DECIMAL(10,4) NOT NULL
    `);

    // ============================================
    // 4. production_batches — quantity columns
    // ============================================
    await queryRunner.query(`
      ALTER TABLE \`production_batches\`
        MODIFY COLUMN \`plannedQuantity\` DECIMAL(10,4) NOT NULL,
        MODIFY COLUMN \`plannedConcentrate\` DECIMAL(10,4) NULL,
        MODIFY COLUMN \`actualConcentrate\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`actualQuantity\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`qcPassedQuantity\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`qcFailedQuantity\` DECIMAL(10,4) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`wasteQuantity\` DECIMAL(10,4) NOT NULL DEFAULT 0
    `);

    // ============================================
    // 5. production_bottling_outputs — scale 3 → 4
    // ============================================
    await queryRunner.query(`
      ALTER TABLE \`production_bottling_outputs\`
        MODIFY COLUMN \`quantity\` DECIMAL(12,4) NOT NULL,
        MODIFY COLUMN \`wasteQuantity\` DECIMAL(12,4) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: daily_inventory
    await queryRunner.query(`
      ALTER TABLE \`daily_inventory\`
        DROP COLUMN \`stokAkhir\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`daily_inventory\`
        MODIFY COLUMN \`stokAwal\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangMasuk\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`dipesan\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangOutRepack\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangOutSample\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangOutProduksi\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`minimumStock\` DECIMAL(10,2) NULL,
        MODIFY COLUMN \`maximumStock\` DECIMAL(10,2) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`daily_inventory\`
        ADD COLUMN \`stokAkhir\` DECIMAL(10,2) GENERATED ALWAYS AS
          (stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample - barangOutProduksi) STORED
    `);

    // Revert: daily_inventory_snapshots
    await queryRunner.query(`
      ALTER TABLE \`daily_inventory_snapshots\`
        MODIFY COLUMN \`stokAwal\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangMasuk\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`dipesan\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangOutRepack\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangOutSample\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`barangOutProduksi\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`stokAkhir\` DECIMAL(10,2) NOT NULL DEFAULT 0
    `);

    // Revert: inventory_transactions
    await queryRunner.query(`
      ALTER TABLE \`inventory_transactions\`
        MODIFY COLUMN \`quantity\` DECIMAL(10,2) NOT NULL,
        MODIFY COLUMN \`balanceAfter\` DECIMAL(10,2) NOT NULL
    `);

    // Revert: production_batches
    await queryRunner.query(`
      ALTER TABLE \`production_batches\`
        MODIFY COLUMN \`plannedQuantity\` DECIMAL(10,2) NOT NULL,
        MODIFY COLUMN \`plannedConcentrate\` DECIMAL(10,2) NULL,
        MODIFY COLUMN \`actualConcentrate\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`actualQuantity\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`qcPassedQuantity\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`qcFailedQuantity\` DECIMAL(10,2) NOT NULL DEFAULT 0,
        MODIFY COLUMN \`wasteQuantity\` DECIMAL(10,2) NOT NULL DEFAULT 0
    `);

    // Revert: production_bottling_outputs
    await queryRunner.query(`
      ALTER TABLE \`production_bottling_outputs\`
        MODIFY COLUMN \`quantity\` DECIMAL(12,3) NOT NULL,
        MODIFY COLUMN \`wasteQuantity\` DECIMAL(12,3) NOT NULL DEFAULT 0
    `);
  }
}
