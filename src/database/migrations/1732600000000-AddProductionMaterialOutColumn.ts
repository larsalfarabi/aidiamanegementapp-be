import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add barangOutProduksi column to daily_inventory
 *
 * Purpose: Track material stock-out for production process
 *
 * This column records when materials (Barang Baku, Barang Pembantu, Barang Kemasan)
 * are consumed in production batches.
 *
 * Updated formula:
 * stokAkhir = stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample - barangOutProduksi
 */
export class AddProductionMaterialOutColumn1732600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add new column barangOutProduksi
    await queryRunner.query(`
      ALTER TABLE \`daily_inventory\` 
      ADD COLUMN \`barangOutProduksi\` DECIMAL(10,2) NOT NULL DEFAULT 0 
      COMMENT 'Goods out for production (material consumption)' 
      AFTER \`barangOutSample\`
    `);

    // 2. Drop existing stokAkhir generated column
    await queryRunner.query(`
      ALTER TABLE \`daily_inventory\` 
      DROP COLUMN \`stokAkhir\`
    `);

    // 3. Re-create stokAkhir with updated formula
    await queryRunner.query(`
      ALTER TABLE \`daily_inventory\` 
      ADD COLUMN \`stokAkhir\` DECIMAL(10,2) 
      GENERATED ALWAYS AS (
        stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample - barangOutProduksi
      ) STORED 
      COMMENT 'Ending stock (GENERATED COLUMN - includes production material out)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop updated stokAkhir
    await queryRunner.query(`
      ALTER TABLE \`daily_inventory\` 
      DROP COLUMN \`stokAkhir\`
    `);

    // 2. Re-create old stokAkhir (without barangOutProduksi)
    await queryRunner.query(`
      ALTER TABLE \`daily_inventory\` 
      ADD COLUMN \`stokAkhir\` DECIMAL(10,2) 
      GENERATED ALWAYS AS (
        stokAwal + barangMasuk - dipesan - barangOutRepack - barangOutSample
      ) STORED 
      COMMENT 'Ending stock (GENERATED COLUMN - auto-calculated)'
    `);

    // 3. Remove barangOutProduksi column
    await queryRunner.query(`
      ALTER TABLE \`daily_inventory\` 
      DROP COLUMN \`barangOutProduksi\`
    `);
  }
}
