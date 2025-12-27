import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add PURCHASE and PRODUCTION_MATERIAL_OUT to TransactionType enum
 *
 * Purpose:
 * - Add PURCHASE transaction type for material procurement
 * - Add PRODUCTION_MATERIAL_OUT transaction type for material consumption in production
 *
 * Impact:
 * - Enables complete inventory tracking for both finished goods and materials
 * - Supports production batch material deduction workflow
 * - Allows tracking of material purchases separately from finished goods
 *
 * Date: November 25, 2025
 * Database: MySQL
 */
export class AddProductionMaterialTransactionTypes1732500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // MySQL: Modify ENUM column to add new values
    // First, get current ENUM values and add new ones
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

    // Add comment to column (MySQL syntax)
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
      COMMENT 'Transaction type: PRODUCTION_IN (finished goods from production), PURCHASE (material procurement), SALE_RETURN (customer returns), ADJUSTMENT_IN (stock correction), SALE (customer sales), PRODUCTION_MATERIAL_OUT (material consumption for production), WASTE (damaged/expired products), ADJUSTMENT_OUT (stock correction)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback: Remove PURCHASE and PRODUCTION_MATERIAL_OUT from enum
    // WARNING: This will fail if any records use these values
    await queryRunner.query(`
      ALTER TABLE \`inventory_transactions\` 
      MODIFY COLUMN \`transactionType\` ENUM(
        'PRODUCTION_IN',
        'SALE_RETURN',
        'ADJUSTMENT_IN',
        'SALE',
        'WASTE',
        'ADJUSTMENT_OUT'
      ) NOT NULL
    `);
  }
}
