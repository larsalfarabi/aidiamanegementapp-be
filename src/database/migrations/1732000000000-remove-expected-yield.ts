import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Remove expectedYield and acceptableWaste columns
 *
 * Reason: Simplify production formulas by removing yield tracking.
 * Waste tracking is now only done at batch level (production_batches table).
 *
 * Changes:
 * - DROP COLUMN acceptableWaste from production_formulas
 *
 * Date: January 2025
 */
export class RemoveExpectedYield1732000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove acceptableWaste column from production_formulas
    await queryRunner.query(
      `ALTER TABLE \`production_formulas\` DROP COLUMN \`acceptableWaste\``,
    );

    console.log(
      '✅ Migration UP: Removed acceptableWaste column from production_formulas',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore acceptableWaste column (default 0 for all existing records)
    await queryRunner.query(
      `ALTER TABLE \`production_formulas\` 
       ADD COLUMN \`acceptableWaste\` DECIMAL(5,2) NOT NULL DEFAULT 0 
       COMMENT 'Acceptable waste percentage (calculated: 100 - expectedYield)'`,
    );

    console.log(
      '✅ Migration DOWN: Restored acceptableWaste column to production_formulas',
    );
  }
}
