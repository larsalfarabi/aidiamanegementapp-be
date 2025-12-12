import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add SAMPLE_OUT, SAMPLE_RETURN, REPACK_IN, REPACK_OUT to TransactionType enum
 *
 * Purpose:
 * - Add SAMPLE_OUT for sample distribution tracking
 * - Add SAMPLE_RETURN for returned samples
 * - Add REPACK_IN for repacking result products
 * - Add REPACK_OUT for repacking source products
 *
 * Impact:
 * - Enables complete sample tracking workflow
 * - Supports repacking operations (e.g., 4x 250ML → 1x 1000ML)
 * - Links to sample_tracking table via outTransactionId
 * - Links to repacking_records table via repackingId
 *
 * Date: December 12, 2025
 * Database: MySQL
 */
export class AddSampleAndRepackTransactionTypes1734200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // MySQL: Modify ENUM column to add new values
    await queryRunner.query(`
      ALTER TABLE \`inventory_transactions\` 
      MODIFY COLUMN \`transactionType\` ENUM(
        'PRODUCTION_IN',
        'REPACK_IN',
        'SAMPLE_RETURN',
        'PURCHASE',
        'SALE_RETURN',
        'ADJUSTMENT_IN',
        'SALE',
        'REPACK_OUT',
        'SAMPLE_OUT',
        'PRODUCTION_MATERIAL_OUT',
        'WASTE',
        'ADJUSTMENT_OUT',
        'ADJUSTMENT'
      ) NOT NULL
      COMMENT 'Transaction types: IN (PRODUCTION_IN, REPACK_IN, SAMPLE_RETURN, PURCHASE), OUT (SALE, REPACK_OUT, SAMPLE_OUT, PRODUCTION_MATERIAL_OUT, WASTE), ADJUSTMENT (stock correction)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback: Remove sample and repack transaction types
    // WARNING: This will fail if any records use these values
    await queryRunner.query(`
      ALTER TABLE \`inventory_transactions\` 
      MODIFY COLUMN \`transactionType\` ENUM(
        'PRODUCTION_IN',
        'PURCHASE',
        'SALE_RETURN',
        'ADJUSTMENT_IN',
        'SALE',
        'PRODUCTION_MATERIAL_OUT',
        'WASTE',
        'ADJUSTMENT_OUT'
      ) NOT NULL
    `);
  }
}
